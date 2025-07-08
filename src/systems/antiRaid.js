const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { GuildConfig } = require('../utils/database');

class AntiRaid {
    constructor() {
        this.recentJoins = new Map();
        this.raidMode = new Map();
        this.verificationCache = new Map();
        this.verificationAttempts = new Map();
        this.bannedTokens = new Set(); // Store banned token patterns
        this.userPatterns = new Map(); // Store patterns of usernames
        this.raidStats = new Map(); // Track statistics about raids
    }

    async handleJoin(member) {
        const { guild, user } = member;
        const config = await GuildConfig.findOne({ guildId: guild.id });

        if (!config?.antiRaid?.enabled) return;

        // Check if user is whitelisted in server-specific anti-nuke whitelist
        if (config.antiNuke?.whitelistedUsers?.includes(member.id)) {
            return;
        }

        // Check if raid mode is already enabled
        const isRaidModeActive = this.raidMode.has(guild.id);
        const now = Date.now();

        // Initialize guild join tracking
        if (!this.recentJoins.has(guild.id)) {
            this.recentJoins.set(guild.id, []);
        }

        // Record join with extended user info
        const guildJoins = this.recentJoins.get(guild.id);
        const userInfo = {
            userId: member.id,
            username: member.user.username,
            discriminator: member.user.discriminator,
            avatar: member.user.avatar,
            createdTimestamp: member.user.createdTimestamp,
            timestamp: now,
            accountAge: member.user.createdTimestamp
        };
        guildJoins.push(userInfo);

        // Clean up old joins based on configured time window
        const joinTime = config.antiRaid.joinTime || 30000; // Default to 30s if not configured
        while (guildJoins.length > 0 && now - guildJoins[0].timestamp > joinTime) {
            guildJoins.shift();
        }

        // Check for raid indicators with extended analysis
        const raidIndicators = this.checkRaidIndicators(guildJoins, config);
        
        // Track token patterns for this join if suspicious
        if (raidIndicators.severity >= 2) {
            this.analyzeUserPatterns(userInfo, guild.id);
        }
        
        // If raid is detected, or raid mode is already active
        if (raidIndicators.isRaid || isRaidModeActive) {
            // Enable raid mode if not already enabled
            if (!isRaidModeActive) {
                this.raidMode.set(guild.id, {
                    enabled: true,
                    timestamp: now,
                    reason: raidIndicators.reason,
                    severity: raidIndicators.severity
                });
                
                // Alert staff about new raid detection
                await this.alertStaff(guild, config, raidIndicators);
                
                // Track statistics
                if (!this.raidStats.has(guild.id)) {
                    this.raidStats.set(guild.id, {
                        totalRaids: 0,
                        totalRaidAccounts: 0,
                        lastRaidTime: 0,
                        highestSeverity: 0
                    });
                }
                
                const stats = this.raidStats.get(guild.id);
                stats.totalRaids++;
                stats.lastRaidTime = now;
                stats.totalRaidAccounts += guildJoins.length;
                if (raidIndicators.severity > stats.highestSeverity) {
                    stats.highestSeverity = raidIndicators.severity;
                }
            }

            // Apply raid action to the member
            await this.handleRaid(guild, member, config, raidIndicators);
        }

        // Automatically disable raid mode after cooldown
        if (this.raidMode.has(guild.id)) {
            const raidModeData = this.raidMode.get(guild.id);
            const cooldown = config.antiRaid.raidModeCooldown || 30 * 60 * 1000; // Default to 30 min
            
            if (now - raidModeData.timestamp > cooldown) {
                this.raidMode.delete(guild.id);
                await this.logAction(guild, config, '🛡️ Raid Mode automatically disabled - Cooldown period ended');
            }
        }
    }

    analyzeUserPatterns(userInfo, guildId) {
        // Extract creation timestamp patterns to identify batch-created accounts
        const creationDate = new Date(userInfo.createdTimestamp);
        const datePattern = `${creationDate.getFullYear()}-${creationDate.getMonth()}`;
        
        if (!this.userPatterns.has(guildId)) {
            this.userPatterns.set(guildId, new Map());
        }
        
        const patterns = this.userPatterns.get(guildId);
        if (!patterns.has(datePattern)) {
            patterns.set(datePattern, []);
        }
        
        patterns.get(datePattern).push({
            userId: userInfo.userId,
            username: userInfo.username,
            timestamp: Date.now()
        });
        
        // Cleanup patterns older than 24 hours
        const yesterday = Date.now() - 24 * 60 * 60 * 1000;
        patterns.forEach((users, pattern) => {
            patterns.set(pattern, users.filter(user => user.timestamp > yesterday));
            if (patterns.get(pattern).length === 0) {
                patterns.delete(pattern);
            }
        });
    }

    checkRaidIndicators(joins, config) {
        const indicators = {
            isRaid: false,
            reason: [],
            severity: 0
        };

        // Check join rate
        if (joins.length >= config.antiRaid.joinThreshold) {
            indicators.isRaid = true;
            indicators.reason.push(`High join rate (${joins.length} joins in ${config.antiRaid.joinTime / 1000}s)`);
            indicators.severity += 2;
            
            // Higher join rates get higher severity
            if (joins.length >= config.antiRaid.joinThreshold * 2) {
                indicators.severity += 1;
            }
            if (joins.length >= config.antiRaid.joinThreshold * 3) {
                indicators.severity += 1;
            }
        }

        // Check for new accounts
        const now = Date.now();
        const newAccounts = joins.filter(join => 
            (now - join.accountAge) < config.antiRaid.minAccountAge
        );
        
        const newAccountsCount = newAccounts.length;
        if (newAccountsCount >= config.antiRaid.newAccountThreshold) {
            indicators.isRaid = true;
            indicators.reason.push(`High number of new accounts (${newAccountsCount} accounts < ${config.antiRaid.minAccountAge / (1000 * 60 * 60 * 24)}d old)`);
            indicators.severity += 2;
            
            // Calculate percentage of new accounts
            const newAccountPercentage = (newAccountsCount / joins.length) * 100;
            if (newAccountPercentage > 80) {
                indicators.severity += 1;
                indicators.reason.push(`${newAccountPercentage.toFixed(1)}% of joins are new accounts`);
            }
        }
        
        // Check for extremely new accounts (less than 1 hour old)
        const brandNewAccounts = joins.filter(join => 
            (now - join.accountAge) < 60 * 60 * 1000 // 1 hour
        ).length;
        
        if (brandNewAccounts >= 3) {
            indicators.isRaid = true;
            indicators.reason.push(`${brandNewAccounts} accounts less than 1 hour old detected`);
            indicators.severity += 2;
        }

        // Check for similar usernames
        const usernameSimilarity = this.checkUsernameSimilarity(joins);
        if (usernameSimilarity >= config.antiRaid.similarNameThreshold) {
            indicators.isRaid = true;
            indicators.reason.push('High username similarity detected');
            indicators.severity += 1;
        }
        
        // Check avatar patterns (missing avatars)
        const noAvatarCount = joins.filter(join => !join.avatar).length;
        if (noAvatarCount >= 3 && (noAvatarCount / joins.length) > 0.5) {
            indicators.isRaid = true;
            indicators.reason.push(`${noAvatarCount} accounts have no avatar (${((noAvatarCount / joins.length) * 100).toFixed(1)}%)`);
            indicators.severity += 1;
        }

        return indicators;
    }

    checkUsernameSimilarity(joins) {
        if (joins.length < 2) return 0;
        
        let similarCount = 0;
        const usernames = joins.map(join => join.username);
        
        // Check for sequential numbers in usernames
        const sequentialMatches = this.checkSequentialPatterns(usernames);
        if (sequentialMatches > 1) {
            similarCount += sequentialMatches;
        }
        
        // Traditional similarity check
        for (let i = 0; i < usernames.length; i++) {
            for (let j = i + 1; j < usernames.length; j++) {
                if (this.calculateSimilarity(usernames[i], usernames[j]) > 0.8) {
                    similarCount++;
                }
            }
        }
        
        return similarCount / (joins.length * (joins.length - 1) / 2);
    }
    
    checkSequentialPatterns(usernames) {
        // Check for usernames that follow patterns like user1, user2, user3
        const patterns = {};
        
        usernames.forEach(name => {
            // Extract alphabetic prefix and numeric suffix
            const match = name.match(/^([a-zA-Z]+)(\d+)$/);
            if (match) {
                const [_, prefix, num] = match;
                if (!patterns[prefix]) {
                    patterns[prefix] = [];
                }
                patterns[prefix].push(parseInt(num));
            }
        });
        
        // Check for sequential numbers
        let sequentialMatches = 0;
        for (const prefix in patterns) {
            const numbers = patterns[prefix].sort((a, b) => a - b);
            for (let i = 0; i < numbers.length - 1; i++) {
                if (numbers[i + 1] - numbers[i] === 1) {
                    sequentialMatches++;
                }
            }
        }
        
        return sequentialMatches;
    }

    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        return (longer.length - this.editDistance(longer, shorter)) / longer.length;
    }

    editDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill().map(() => Array(str1.length + 1).fill(0));
        
        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                if (str1[i-1] === str2[j-1]) {
                    matrix[j][i] = matrix[j-1][i-1];
                } else {
                    matrix[j][i] = Math.min(
                        matrix[j-1][i-1] + 1,
                        matrix[j][i-1] + 1,
                        matrix[j-1][i] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    async handleRaid(guild, member, config, raidIndicators) {
        try {
            let action = config.antiRaid.action || 'VERIFICATION';
            
            // Escalate action based on severity
            if (raidIndicators.severity >= 5) {
                action = 'BAN';
            } else if (raidIndicators.severity >= 3) {
                action = 'KICK';
            }

            // Execute the appropriate action
            switch (action) {
                case 'BAN':
                    if (member.bannable) {
                        await member.ban({
                            reason: `Anti-Raid Protection: ${raidIndicators.reason.join(', ')}`
                        });
                        await this.logAction(guild, config, `🔨 Banned ${member.user.tag} (Raid Protection - Severity ${raidIndicators.severity}/5)`);
                    } else {
                        // Fallback to kick if can't ban
                        if (member.kickable) {
                            await member.kick(`Anti-Raid Protection: ${raidIndicators.reason.join(', ')}`);
                            await this.logAction(guild, config, `👢 Kicked ${member.user.tag} (Raid Protection - Failed to ban, insufficient permissions)`);
                        } else {
                            await this.logAction(guild, config, `⚠️ Failed to take action against ${member.user.tag} - Insufficient permissions`);
                        }
                    }
                    break;

                case 'KICK':
                    if (member.kickable) {
                        await member.kick(`Anti-Raid Protection: ${raidIndicators.reason.join(', ')}`);
                        await this.logAction(guild, config, `👢 Kicked ${member.user.tag} (Raid Protection - Severity ${raidIndicators.severity}/5)`);
                    } else {
                        // Fallback to verification if can't kick
                        await this.setupVerification(guild, member, config, raidIndicators);
                    }
                    break;

                case 'VERIFICATION':
                    await this.setupVerification(guild, member, config, raidIndicators);
                    break;
            }
        } catch (error) {
            console.error('Error in handleRaid:', error);
            await this.logAction(guild, config, `❌ Error while handling raid member ${member.user.tag}: ${error.message}`);
        }
    }
    
    async setupVerification(guild, member, config, raidIndicators) {
        try {
            // Create verification role if it doesn't exist
            let verificationRole = guild.roles.cache.find(r => r.name === 'Pending Verification');
            if (!verificationRole) {
                verificationRole = await guild.roles.create({
                    name: 'Pending Verification',
                    permissions: [],
                    reason: 'Anti-Raid Verification System'
                });

                // Set up role permissions
                await Promise.all(guild.channels.cache.map(channel =>
                    channel.permissionOverwrites.create(verificationRole, {
                        ViewChannel: false,
                        SendMessages: false,
                        AddReactions: false
                    })
                ));
            }

            // Create verification channel if it doesn't exist
            let verificationChannel = guild.channels.cache.find(c => c.name === 'verification');
            if (!verificationChannel) {
                verificationChannel = await guild.channels.create({
                    name: 'verification',
                    type: 0, // Text channel
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: verificationRole.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                        }
                    ]
                });
                
                // Add welcome message with instructions
                const welcomeEmbed = new EmbedBuilder()
                    .setColor('#2B65EC')
                    .setTitle('🛡️ Server Verification')
                    .setDescription('This channel is for verification during high traffic or raid detection periods.\n\n' + 
                                 'When you receive a verification code, please type it here to gain access to the server.\n\n' +
                                 'If you need help, please contact a server administrator.')
                    .setFooter({ text: 'Anti-Raid Protection System' });
                    
                await verificationChannel.send({ embeds: [welcomeEmbed] });
            }

            // Store member's original roles before removing them
            const memberRoles = [...member.roles.cache.keys()].filter(id => id !== guild.id);
            
            // Save original roles in verification cache for restoration after verification
            const cacheKey = `${guild.id}-${member.id}`;
            
            // Add verification role to member and remove other roles
            await member.roles.set([verificationRole.id]);

            // Generate verification code (more complex than before)
            const verificationCode = this.generateVerificationCode();
            this.verificationCache.set(cacheKey, {
                code: verificationCode,
                timestamp: Date.now(),
                originalRoles: memberRoles,
                attempts: 0
            });

            // Send verification instructions
            const verificationEmbed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle('Verification Required')
                .setDescription(`Due to high join rates, verification is required.\n**Please type the following code in the verification channel:**\n\`${verificationCode}\``)
                .addFields({
                    name: 'Why am I seeing this?',
                    value: raidIndicators.reason.join('\n')
                })
                .setFooter({ text: 'This code will expire in 30 minutes' });

            // Try DM first, if fails, mention in verification channel
            try {
                await member.send({ embeds: [verificationEmbed] });
            } catch {
                await verificationChannel.send({
                    content: `${member}`,
                    embeds: [verificationEmbed]
                });
            }

            // Set verification code timeout
            setTimeout(() => {
                const verificationData = this.verificationCache.get(cacheKey);
                if (verificationData) {
                    this.verificationCache.delete(cacheKey);
                    this.handleExpiredVerification(guild, member, config);
                }
            }, 30 * 60 * 1000); // 30 minutes

            await this.logAction(guild, config, `🔒 Added ${member.user.tag} to verification queue`);
        } catch (error) {
            console.error('Error in setupVerification:', error);
            await this.logAction(guild, config, `❌ Error setting up verification for ${member.user.tag}: ${error.message}`);
        }
    }

    generateVerificationCode() {
        // Generate a more complex verification code with both letters and numbers
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing characters like 0, O, 1, I
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    // Generate verification code for a specific user
    async generateVerificationCodeForUser(member) {
        const { guild } = member;
        const config = await GuildConfig.findOne({ guildId: guild.id });
        const cacheKey = `${guild.id}-${member.id}`;
        
        // Check if user is already in verification process
        if (this.verificationCache.has(cacheKey)) {
            // Return existing code
            return this.verificationCache.get(cacheKey).code;
        }
        
        // Check if verification is required for this user
        if (!config?.antiRaid?.enabled) {
            return null;
        }
        
        // Generate verification code
        const verificationCode = this.generateVerificationCode();
        
        // Check if server has a verification role
        let verificationRole = guild.roles.cache.find(r => r.name === 'Pending Verification');
        if (!verificationRole) {
            verificationRole = await guild.roles.create({
                name: 'Pending Verification',
                permissions: [],
                reason: 'Anti-Raid Verification System'
            });
            
            // Set up role permissions
            await Promise.all(guild.channels.cache.map(channel =>
                channel.permissionOverwrites.create(verificationRole, {
                    ViewChannel: false,
                    SendMessages: false,
                    AddReactions: false
                })
            ));
        }
        
        // Store member's original roles before removing them
        const memberRoles = [...member.roles.cache.keys()].filter(id => id !== guild.id);
        
        // Add verification role to member and remove other roles
        try {
            await member.roles.set([verificationRole.id]);
        } catch (error) {
            console.error('Error setting verification role:', error);
        }
        
        // Save in verification cache
        this.verificationCache.set(cacheKey, {
            code: verificationCode,
            timestamp: Date.now(),
            originalRoles: memberRoles,
            attempts: 0
        });
        
        // Set verification code timeout
        setTimeout(() => {
            const verificationData = this.verificationCache.get(cacheKey);
            if (verificationData) {
                this.verificationCache.delete(cacheKey);
                this.handleExpiredVerification(guild, member, config);
            }
        }, 30 * 60 * 1000); // 30 minutes
        
        // Log verification
        try {
            await this.logAction(guild, config, `🔒 Added ${member.user.tag} to verification queue via verification panel`);
        } catch (error) {
            console.error('Error logging verification:', error);
        }
        
        return verificationCode;
    }
    
    async handleExpiredVerification(guild, member, config) {
        try {
            // Check if member still exists in guild
            try {
                await guild.members.fetch(member.id);
            } catch {
                // Member already left, no action needed
                return;
            }
            
            // Handle based on config (kick or leave in verification)
            if (config.antiRaid?.expiredVerificationAction === 'KICK') {
                if (member.kickable) {
                    await member.kick('Verification timeout expired');
                    await this.logAction(guild, config, `⏰ Kicked ${member.user.tag} - Verification timeout expired`);
                }
            } else {
                // Default: just log it
                await this.logAction(guild, config, `⏰ Verification expired for ${member.user.tag}`);
            }
        } catch (error) {
            console.error('Error handling expired verification:', error);
        }
    }

    async verifyUser(member, code) {
        const cacheKey = `${member.guild.id}-${member.id}`;
        const verificationData = this.verificationCache.get(cacheKey);

        if (!verificationData) {
            return { success: false, reason: 'NO_VERIFICATION_NEEDED' };
        }

        // Track verification attempts
        verificationData.attempts++;
        this.verificationCache.set(cacheKey, verificationData);
        
        // Check for too many attempts
        if (verificationData.attempts >= 5) {
            // Handle too many failed attempts
            this.verificationCache.delete(cacheKey);
            
            // Get guild config
            const config = await GuildConfig.findOne({ guildId: member.guild.id });
            
            if (config?.antiRaid?.maxFailedVerificationAction === 'KICK' && member.kickable) {
                await member.kick('Too many failed verification attempts');
                await this.logAction(member.guild, config, `🚫 Kicked ${member.user.tag} - Too many failed verification attempts`);
            }
            
            return { success: false, reason: 'TOO_MANY_ATTEMPTS' };
        }

        // Check if code matches
        if (code !== verificationData.code) {
            return { success: false, reason: 'INVALID_CODE' };
        }

        // Verification successful - remove from verification role
        const verificationRole = member.guild.roles.cache.find(r => r.name === 'Pending Verification');
        if (verificationRole) {
            await member.roles.remove(verificationRole);
        }

        // Try to restore original roles if they were saved
        if (verificationData.originalRoles && verificationData.originalRoles.length > 0) {
            try {
                await member.roles.add(verificationData.originalRoles);
            } catch (error) {
                console.error('Error restoring roles:', error);
            }
        }

        // Clear verification code
        this.verificationCache.delete(cacheKey);

        // Get default role if configured
        const config = await GuildConfig.findOne({ guildId: member.guild.id });
        if (config?.antiRaid?.defaultRole) {
            const defaultRole = member.guild.roles.cache.get(config.antiRaid.defaultRole);
            if (defaultRole) {
                await member.roles.add(defaultRole);
            }
        }

        // Log successful verification
        await this.logAction(member.guild, config, `✅ User ${member.user.tag} successfully verified`);

        return { success: true };
    }

    async alertStaff(guild, config, raidIndicators) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🚨 RAID DETECTED')
            .setDescription('Anti-Raid measures have been automatically activated.')
            .addFields(
                { name: 'Reason', value: raidIndicators.reason.join('\n') },
                { name: 'Severity', value: `${raidIndicators.severity}/5` },
                { name: 'Action', value: config.antiRaid.action },
                { name: 'Recent Joins', value: `${this.recentJoins.get(guild.id).length} members in ${config.antiRaid.joinTime / 1000}s` },
                { name: 'Auto-Disable', value: `${config.antiRaid.raidModeCooldown / (60 * 1000)} minutes` }
            )
            .setTimestamp();

        // Send alert to mod log channel
        if (config.moderation?.modLogChannel) {
            try {
                const logChannel = await guild.channels.fetch(config.moderation.modLogChannel);
                if (logChannel) {
                    // Ping alert role if configured and raid is serious
                    let alertContent = null;
                    if (raidIndicators.severity >= 3 && config.antiRaid.alertRole) {
                        alertContent = `<@&${config.antiRaid.alertRole}>`;
                    }
                    
                    await logChannel.send({
                        content: alertContent,
                        embeds: [embed]
                    });
                }
            } catch (error) {
                console.error('Error sending raid alert:', error);
            }
        }
    }

    async logAction(guild, config, message) {
        if (config.moderation?.modLogChannel) {
            try {
                const logChannel = await guild.channels.fetch(config.moderation.modLogChannel);
                if (logChannel) {
                    await logChannel.send(message);
                }
            } catch (error) {
                console.error('Error logging action:', error);
            }
        }
    }
    
    // Get current raid statistics
    getRaidStats(guildId) {
        return this.raidStats.get(guildId) || {
            totalRaids: 0,
            totalRaidAccounts: 0,
            lastRaidTime: 0,
            highestSeverity: 0
        };
    }
    
    // Get current raid mode status
    getRaidModeStatus(guildId) {
        const raidMode = this.raidMode.get(guildId);
        if (!raidMode) return { active: false };
        
        return {
            active: true,
            reason: raidMode.reason,
            since: raidMode.timestamp,
            severity: raidMode.severity
        };
    }
    
    // Manually set raid mode
    async setRaidMode(guild, enabled, reason = 'Manually triggered', duration = 30) {
        const config = await GuildConfig.findOne({ guildId: guild.id });
        
        if (enabled) {
            this.raidMode.set(guild.id, {
                enabled: true,
                timestamp: Date.now(),
                reason: [reason],
                severity: 3,
                manual: true
            });
            
            // Set auto-disable timeout
            setTimeout(() => {
                if (this.raidMode.has(guild.id) && this.raidMode.get(guild.id).manual) {
                    this.raidMode.delete(guild.id);
                    this.logAction(guild, config, `🛡️ Raid Mode automatically disabled after ${duration} minutes`);
                }
            }, duration * 60 * 1000);
            
            await this.logAction(guild, config, `🛡️ Raid Mode manually enabled: ${reason}`);
        } else {
            this.raidMode.delete(guild.id);
            await this.logAction(guild, config, '🛡️ Raid Mode manually disabled');
        }
        
        return enabled;
    }

    // Reset raid detection for a guild
    resetGuild(guildId) {
        this.recentJoins.delete(guildId);
        this.raidMode.delete(guildId);
        this.verificationCache.forEach((value, key) => {
            if (key.startsWith(`${guildId}-`)) {
                this.verificationCache.delete(key);
            }
        });
        this.verificationAttempts.delete(guildId);
        this.userPatterns.delete(guildId);
    }
}

module.exports = new AntiRaid(); 