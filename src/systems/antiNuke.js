const { PermissionFlagsBits, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { GuildConfig } = require('../utils/database');

class AntiNuke {
    constructor() {
        this.recentActions = new Map();
        this.actionTypes = {
            BAN: 'bans',
            KICK: 'kicks',
            ROLE_DELETE: 'roleDeletes',
            CHANNEL_DELETE: 'channelDeletes',
            WEBHOOK_DELETE: 'webhookDeletes',
            PERMISSION_UPDATES: 'permissionUpdates',
            EMOJI_DELETE: 'emojiDeletes',
            MASS_MENTION: 'massMentions',
            GUILD_UPDATE: 'guildUpdates',
            BOT_ADD: 'botAdds',
            MEMBER_PRUNE: 'memberPrunes'
        };
        this.lockdownStatus = new Map();
        this.emergencyMode = new Map();
    }

    // Initialize guild tracking
    initGuild(guildId) {
        if (!this.recentActions.has(guildId)) {
            this.recentActions.set(guildId, {
                bans: new Map(),
                kicks: new Map(),
                roleDeletes: new Map(),
                channelDeletes: new Map(),
                webhookDeletes: new Map(),
                permissionUpdates: new Map(),
                emojiDeletes: new Map(),
                massMentions: new Map(),
                guildUpdates: new Map(),
                botAdds: new Map(),
                memberPrunes: new Map()
            });
        }
    }

    // Check if user is whitelisted for anti-nuke system
    async isWhitelisted(userId, guildId) {
        // Check server-specific whitelist
        const config = await GuildConfig.findOne({ guildId });
        if (config?.antiNuke?.whitelistedUsers?.includes(userId)) {
            return true;
        }

        return false;
    }

    // Track an action
    async trackAction(guild, userId, actionType) {
        // Check if user is whitelisted first
        if (await this.isWhitelisted(userId, guild.id)) {
            console.log(`User ${userId} is whitelisted for anti-nuke, skipping check`);
            return false;
        }

        this.initGuild(guild.id);
        const guildActions = this.recentActions.get(guild.id);
        const actionMap = guildActions[actionType];

        if (!actionMap.has(userId)) {
            actionMap.set(userId, []);
        }

        const userActions = actionMap.get(userId);
        const now = Date.now();
        userActions.push(now);

        // Get guild config
        const config = await GuildConfig.findOne({ guildId: guild.id });
        if (!config || !config.antiNuke.enabled) return false;

        // Clean up old actions outside the threshold
        while (userActions.length > 0 && now - userActions[0] > config.antiNuke.actionThreshold) {
            userActions.shift();
        }

        // Check for emergency mode - activate if multiple users are making suspicious actions
        if (actionType === this.actionTypes.CHANNEL_DELETE || 
            actionType === this.actionTypes.ROLE_DELETE || 
            actionType === this.actionTypes.WEBHOOK_DELETE) {
            
            const suspiciousUsers = this.countSuspiciousUsers(guildActions[actionType]);
            
            if (suspiciousUsers >= 2) {
                await this.enableEmergencyMode(guild, config, `Multiple users (${suspiciousUsers}) performing suspicious actions`);
            }
        }

        // Check if threshold is exceeded
        const maxActions = {
            bans: config.antiNuke.maxBans || 3,
            kicks: config.antiNuke.maxKicks || 3,
            roleDeletes: config.antiNuke.maxRoleDeletes || 2,
            channelDeletes: config.antiNuke.maxChannelDeletes || 2,
            webhookDeletes: config.antiNuke.maxWebhookDeletes || 3,
            permissionUpdates: config.antiNuke.maxPermissionUpdates || 5,
            emojiDeletes: config.antiNuke.maxEmojiDeletes || 5,
            massMentions: config.antiNuke.maxMassMentions || 3,
            guildUpdates: config.antiNuke.maxGuildUpdates || 2,
            botAdds: config.antiNuke.maxBotAdds || 2,
            memberPrunes: config.antiNuke.maxMemberPrunes || 2
        };

        if (userActions.length >= maxActions[actionType]) {
            await this.punish(guild, userId, actionType, config);
            return true;
        }

        return false;
    }

    // Count users who have performed suspicious actions recently
    countSuspiciousUsers(actionMap) {
        const now = Date.now();
        let count = 0;
        
        for (const [userId, actions] of actionMap.entries()) {
            // Filter to actions in the last 5 minutes
            const recentActions = actions.filter(timestamp => now - timestamp < 5 * 60 * 1000);
            if (recentActions.length >= 2) {
                count++;
            }
        }
        
        return count;
    }

    // Enable emergency lockdown mode
    async enableEmergencyMode(guild, config, reason) {
        // Don't enable if already in emergency mode
        if (this.emergencyMode.has(guild.id)) {
            return { 
                success: false, 
                message: 'Emergency mode is already active'
            };
        }
        
        // Ensure we have a valid reason
        const safeReason = reason && reason.trim() !== '' ? reason : 'Manual activation (no reason provided)';
        
        try {
            // Check if bot has permission to modify roles before proceeding
            const botMember = await guild.members.fetchMe();
            
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return { 
                    success: false,
                    message: '❌ Bot lacks Manage Roles permission required for emergency mode'
                };
            }
            
            // Check if bot's role is high enough to modify important roles
            const botRole = botMember.roles.highest;
            console.log(`[DEBUG] Bot's highest role: ${botRole.name} (position: ${botRole.position})`);
            
            const moderationRoles = guild.roles.cache.filter(role => 
                role.permissions.has(PermissionFlagsBits.BanMembers) ||
                role.permissions.has(PermissionFlagsBits.KickMembers) ||
                role.permissions.has(PermissionFlagsBits.ManageRoles) ||
                role.permissions.has(PermissionFlagsBits.ManageChannels) ||
                role.permissions.has(PermissionFlagsBits.Administrator)
            );
            
            // Log all moderation roles and their positions for debugging
            moderationRoles.forEach(role => {
                console.log(`[DEBUG] Moderation role: ${role.name} (position: ${role.position})`);
            });
            
            // Check if there are roles the bot can't modify
            const unmodifiableRoles = [];
            for (const [id, role] of moderationRoles) {
                // Skip @everyone role
                if (role.id === guild.id) continue;
                
                // Use strict greater than instead of greater than or equal
                // This ensures we only check for roles ABOVE the bot's role
                if (role.position > botRole.position) {
                    unmodifiableRoles.push(role.name);
                    console.log(`[DEBUG] Cannot modify role: ${role.name} (position: ${role.position} > bot's ${botRole.position})`);
                }
            }
            
            if (unmodifiableRoles.length > 0) {
                return {
                    success: false,
                    message: `❌ Bot role needs to be higher than the following roles: ${unmodifiableRoles.join(', ')}`
                };
            }
            
            // Set emergency mode status
            this.emergencyMode.set(guild.id, {
                timestamp: Date.now(),
                reason: safeReason
            });
            
            console.log(`[EMERGENCY MODE] Enabled for guild ${guild.id}: ${safeReason}`);
            
            // Create emergency embed
            const emergencyEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚨 EMERGENCY LOCKDOWN ACTIVATED')
                .setDescription('Suspicious activity detected - Server has been put into emergency lockdown')
                .addFields(
                    { name: 'Reason', value: safeReason },
                    { name: 'Actions Taken', value: '- All moderator roles have been temporarily locked\n- Integration permissions revoked\n- Webhook actions suspended' }
                )
                .setTimestamp();
                
            // Log the emergency
            if (config.moderation?.modLogChannel) {
                try {
                    const logChannel = await guild.channels.fetch(config.moderation.modLogChannel);
                    await logChannel.send({ embeds: [emergencyEmbed] });
                } catch (error) {
                    console.error('Failed to send emergency log', error);
                }
            }
            
            // Try to notify the owner
            try {
                const owner = await guild.fetchOwner();
                await owner.send({ embeds: [emergencyEmbed] });
            } catch (error) {
                console.error('Failed to notify owner about emergency mode', error);
            }
            
            // Apply emergency restrictions
            const restrictionResult = await this.applyEmergencyRestrictions(guild);
            
            if (!restrictionResult.success) {
                // If restrictions failed to apply, deactivate emergency mode and return error
                this.emergencyMode.delete(guild.id);
                return restrictionResult;
            }
            
            // Set a timeout to disable emergency mode after 30 minutes
            setTimeout(() => this.disableEmergencyMode(guild), 30 * 60 * 1000);
            
            return { success: true };
        } catch (error) {
            console.error('Error enabling emergency mode:', error);
            this.emergencyMode.delete(guild.id); // Clean up if there was an error
            return { 
                success: false, 
                message: 'An unexpected error occurred when enabling emergency mode' 
            };
        }
    }
    
    // Apply emergency restrictions to the server
    async applyEmergencyRestrictions(guild) {
        try {
            // Store current role permissions to restore later
            const rolePermissionsBackup = new Map();
            const failedRoles = [];
            
            // Find all moderator roles (roles with ban, kick, manage roles, etc. permissions)
            const moderationRoles = guild.roles.cache.filter(role => 
                role.permissions.has(PermissionFlagsBits.BanMembers) ||
                role.permissions.has(PermissionFlagsBits.KickMembers) ||
                role.permissions.has(PermissionFlagsBits.ManageRoles) ||
                role.permissions.has(PermissionFlagsBits.ManageChannels) ||
                role.permissions.has(PermissionFlagsBits.Administrator)
            );
            
            // Get bot's role
            const botMember = await guild.members.fetchMe();
            const botRole = botMember.roles.highest;
            console.log(`[DEBUG] Emergency restrictions - Bot's highest role: ${botRole.name} (position: ${botRole.position})`);
            
            // Remove dangerous permissions temporarily
            for (const [id, role] of moderationRoles) {
                // Skip @everyone role and managed roles
                if (role.id === guild.id || role.managed) continue;
                
                console.log(`[DEBUG] Checking role: ${role.name} (position: ${role.position})`);
                
                // Skip roles higher than the bot's role
                if (role.position > botRole.position) {
                    failedRoles.push(role.name);
                    console.log(`[DEBUG] Cannot modify role: ${role.name} (position: ${role.position} > bot's ${botRole.position})`);
                    continue;
                }
                
                // Backup current permissions
                rolePermissionsBackup.set(id, role.permissions.bitfield);
                
                // Remove dangerous permissions
                try {
                    await role.setPermissions(
                        role.permissions.remove([
                            PermissionFlagsBits.BanMembers,
                            PermissionFlagsBits.KickMembers,
                            PermissionFlagsBits.ManageRoles,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.ManageGuild,
                            PermissionFlagsBits.ManageWebhooks,
                            PermissionFlagsBits.Administrator
                        ])
                    );
                    console.log(`[EMERGENCY] Restricted permissions for role ${role.name}`);
                } catch (error) {
                    console.error(`Failed to update permissions for role ${role.name}`, error);
                    failedRoles.push(role.name);
                    
                    // Remove from backup if we couldn't update
                    rolePermissionsBackup.delete(id);
                }
            }
            
            // If we couldn't modify any important roles, return error
            if (rolePermissionsBackup.size === 0) {
                return {
                    success: false,
                    message: failedRoles.length > 0 
                        ? `❌ Failed to modify any roles. Bot needs higher permissions than: ${failedRoles.join(', ')}`
                        : '❌ No moderation roles found to restrict'
                };
            }
            
            // If some roles failed but we were able to modify others, warn but continue
            const partialSuccess = failedRoles.length > 0;
            
            // Store the backup to restore later
            this.lockdownStatus.set(guild.id, {
                rolePermissionsBackup,
                timestamp: Date.now(),
                partialSuccess,
                failedRoles
            });
            
            return {
                success: true,
                partialSuccess,
                failedRoles
            };
        } catch (error) {
            console.error('Error applying emergency restrictions:', error);
            return {
                success: false,
                message: 'Failed to apply emergency restrictions'
            };
        }
    }
    
    // Disable emergency mode and restore permissions
    async disableEmergencyMode(guild) {
        if (!this.emergencyMode.has(guild.id) || !this.lockdownStatus.has(guild.id)) {
            return;
        }
        
        const { rolePermissionsBackup } = this.lockdownStatus.get(guild.id);
        
        try {
            // Restore role permissions
            for (const [roleId, permissionsBitfield] of rolePermissionsBackup.entries()) {
                const role = await guild.roles.fetch(roleId).catch(() => null);
                if (role) {
                    await role.setPermissions(permissionsBitfield);
                    console.log(`[EMERGENCY] Restored permissions for role ${role.name}`);
                }
            }
            
            // Create notification embed
            const notificationEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Emergency Lockdown Deactivated')
                .setDescription('The server emergency lockdown has been lifted')
                .addFields(
                    { name: 'Actions', value: 'Role permissions have been restored to their previous state' }
                )
                .setTimestamp();
                
            // Notify in log channel
            const config = await GuildConfig.findOne({ guildId: guild.id });
            if (config?.moderation?.modLogChannel) {
                try {
                    const logChannel = await guild.channels.fetch(config.moderation.modLogChannel);
                    await logChannel.send({ embeds: [notificationEmbed] });
                } catch (error) {
                    console.error('Failed to send lockdown deactivation log', error);
                }
            }
            
            // Clear the emergency status
            this.emergencyMode.delete(guild.id);
            this.lockdownStatus.delete(guild.id);
            
            console.log(`[EMERGENCY MODE] Disabled for guild ${guild.id}`);
        } catch (error) {
            console.error('Error disabling emergency mode:', error);
        }
    }

    // Apply punishment
    async punish(guild, userId, actionType, config) {
        try {
            const member = await guild.members.fetch(userId);
            if (!member) return;

            // Don't punish bot owner or server owner
            if (userId === guild.ownerId || userId === process.env.BOT_OWNER_ID) return;

            // Double-check whitelist status before punishing
            if (await this.isWhitelisted(userId, guild.id)) {
                console.log(`User ${userId} is whitelisted for anti-nuke, skipping punishment`);
                return;
            }

            const logEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke System Triggered')
                .setDescription(`User triggered anti-nuke system by performing too many ${actionType}`)
                .addFields(
                    { name: 'User', value: `${member.user.tag} (${member.id})` },
                    { name: 'Action Type', value: actionType },
                    { name: 'Punishment', value: config.antiNuke.punishment }
                )
                .setTimestamp();

            switch (config.antiNuke.punishment) {
                case 'BAN':
                    if (member.bannable) {
                        await member.ban({
                            reason: `Anti-Nuke: Exceeded ${actionType} threshold`
                        });
                        logEmbed.addFields({ name: 'Result', value: 'User has been banned' });
                    }
                    break;

                case 'KICK':
                    if (member.kickable) {
                        await member.kick(`Anti-Nuke: Exceeded ${actionType} threshold`);
                        logEmbed.addFields({ name: 'Result', value: 'User has been kicked' });
                    }
                    break;

                case 'STRIP_ROLES':
                    const keepRoles = member.roles.cache.filter(role => 
                        !role.permissions.has(PermissionFlagsBits.Administrator) &&
                        !role.permissions.has(PermissionFlagsBits.BanMembers) &&
                        !role.permissions.has(PermissionFlagsBits.KickMembers) &&
                        !role.permissions.has(PermissionFlagsBits.ManageRoles) &&
                        !role.permissions.has(PermissionFlagsBits.ManageChannels)
                    );
                    await member.roles.set(keepRoles);
                    logEmbed.addFields({ name: 'Result', value: 'Dangerous roles have been removed' });
                    break;
                    
                case 'QUARANTINE':
                    // Create or find quarantine role
                    let quarantineRole = guild.roles.cache.find(r => r.name === 'Quarantined');
                    if (!quarantineRole) {
                        quarantineRole = await guild.roles.create({
                            name: 'Quarantined',
                            color: '#000000',
                            permissions: []
                        });
                        
                        // Set up permissions for all channels
                        await Promise.all(guild.channels.cache.map(channel => 
                            channel.permissionOverwrites.create(quarantineRole, {
                                SendMessages: false,
                                AddReactions: false,
                                AttachFiles: false,
                                CreatePublicThreads: false,
                                CreatePrivateThreads: false,
                                UseApplicationCommands: false
                            })
                        ));
                    }
                    
                    // Save original roles and apply quarantine
                    const originalRoles = member.roles.cache.filter(r => !r.managed && r.id !== guild.id).map(r => r.id);
                    
                    // Store original roles in database if not already there
                    if (!config.antiNuke.quarantinedUsers) {
                        config.antiNuke.quarantinedUsers = {};
                    }
                    
                    config.antiNuke.quarantinedUsers[member.id] = {
                        originalRoles,
                        quarantinedAt: Date.now()
                    };
                    
                    await GuildConfig.set(guild.id, config);
                    
                    // Apply quarantine role
                    await member.roles.set([quarantineRole.id]);
                    logEmbed.addFields({ name: 'Result', value: 'User has been quarantined' });
                    break;
            }

            // Log the action
            if (config.moderation?.modLogChannel) {
                const logChannel = await guild.channels.fetch(config.moderation.modLogChannel);
                if (logChannel) {
                    await logChannel.send({ embeds: [logEmbed] });
                }
            }

            // Clear the action history for this user
            const guildActions = this.recentActions.get(guild.id);
            guildActions[actionType].delete(userId);
        } catch (error) {
            console.error('Error in anti-nuke punishment:', error);
        }
    }

    // Event handlers
    async handleBan(guild) {
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.MemberBan,
                limit: 1
            });
            const banLog = auditLogs.entries.first();
            if (!banLog) return;

            await this.trackAction(guild, banLog.executor.id, this.actionTypes.BAN);
        } catch (error) {
            console.error('Error handling ban:', error);
        }
    }

    async handleKick(guild) {
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.MemberKick,
                limit: 1
            });
            const kickLog = auditLogs.entries.first();
            if (!kickLog) return;

            await this.trackAction(guild, kickLog.executor.id, this.actionTypes.KICK);
        } catch (error) {
            console.error('Error handling kick:', error);
        }
    }

    async handleRoleDelete(guild) {
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.RoleDelete,
                limit: 1
            });
            const roleLog = auditLogs.entries.first();
            if (!roleLog) return;

            await this.trackAction(guild, roleLog.executor.id, this.actionTypes.ROLE_DELETE);
        } catch (error) {
            console.error('Error handling role delete:', error);
        }
    }

    async handleChannelDelete(guild) {
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelDelete,
                limit: 1
            });
            const channelLog = auditLogs.entries.first();
            if (!channelLog) return;

            await this.trackAction(guild, channelLog.executor.id, this.actionTypes.CHANNEL_DELETE);
        } catch (error) {
            console.error('Error handling channel delete:', error);
        }
    }
    
    async handleWebhookDelete(guild) {
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.WebhookDelete,
                limit: 1
            });
            const webhookLog = auditLogs.entries.first();
            if (!webhookLog) return;

            await this.trackAction(guild, webhookLog.executor.id, this.actionTypes.WEBHOOK_DELETE);
        } catch (error) {
            console.error('Error handling webhook delete:', error);
        }
    }
    
    async handleEmojiDelete(guild) {
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.EmojiDelete,
                limit: 1
            });
            const emojiLog = auditLogs.entries.first();
            if (!emojiLog) return;

            await this.trackAction(guild, emojiLog.executor.id, this.actionTypes.EMOJI_DELETE);
        } catch (error) {
            console.error('Error handling emoji delete:', error);
        }
    }
    
    async handleGuildUpdate(guild) {
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.GuildUpdate,
                limit: 1
            });
            const guildLog = auditLogs.entries.first();
            if (!guildLog) return;

            await this.trackAction(guild, guildLog.executor.id, this.actionTypes.GUILD_UPDATE);
        } catch (error) {
            console.error('Error handling guild update:', error);
        }
    }
    
    async handleMemberRoleUpdate(guild, oldMember, newMember) {
        // If admin role was added, track it as a permission update
        const oldAdminRoles = oldMember.roles.cache.filter(role => 
            role.permissions.has(PermissionFlagsBits.Administrator)).size;
            
        const newAdminRoles = newMember.roles.cache.filter(role => 
            role.permissions.has(PermissionFlagsBits.Administrator)).size;
            
        if (newAdminRoles > oldAdminRoles) {
            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: AuditLogEvent.MemberRoleUpdate,
                    limit: 1
                });
                const roleLog = auditLogs.entries.first();
                if (!roleLog) return;

                await this.trackAction(guild, roleLog.executor.id, this.actionTypes.PERMISSION_UPDATES);
            } catch (error) {
                console.error('Error handling member role update:', error);
            }
        }
    }
    
    async handleRoleUpdate(guild, oldRole, newRole) {
        // If permissions changed to add admin/dangerous perms
        const oldDangerousPerms = 
            oldRole.permissions.has(PermissionFlagsBits.Administrator) ||
            oldRole.permissions.has(PermissionFlagsBits.BanMembers) ||
            oldRole.permissions.has(PermissionFlagsBits.KickMembers) ||
            oldRole.permissions.has(PermissionFlagsBits.ManageGuild);
            
        const newDangerousPerms = 
            newRole.permissions.has(PermissionFlagsBits.Administrator) ||
            newRole.permissions.has(PermissionFlagsBits.BanMembers) ||
            newRole.permissions.has(PermissionFlagsBits.KickMembers) ||
            newRole.permissions.has(PermissionFlagsBits.ManageGuild);
            
        if (!oldDangerousPerms && newDangerousPerms) {
            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: AuditLogEvent.RoleUpdate,
                    limit: 1
                });
                const roleLog = auditLogs.entries.first();
                if (!roleLog) return;

                await this.trackAction(guild, roleLog.executor.id, this.actionTypes.PERMISSION_UPDATES);
            } catch (error) {
                console.error('Error handling role update:', error);
            }
        }
    }
    
    async handleBotAdd(guild, member) {
        if (member.user.bot) {
            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: AuditLogEvent.BotAdd,
                    limit: 1
                });
                const botLog = auditLogs.entries.first();
                if (!botLog) return;

                await this.trackAction(guild, botLog.executor.id, this.actionTypes.BOT_ADD);
            } catch (error) {
                console.error('Error handling bot add:', error);
            }
        }
    }
    
    // Handle messages with mass mentions
    async handleMessage(message) {
        if (!message.guild || message.author.bot) return;
        
        // Count mentions in message
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        
        if (mentionCount > 10) { // If more than 10 mentions
            await this.trackAction(message.guild, message.author.id, this.actionTypes.MASS_MENTION);
        }
    }
    
    // Get status for a guild
    async getStatus(guildId) {
        const config = await GuildConfig.findOne({ guildId });
        const isEmergencyMode = this.emergencyMode.has(guildId);
        
        return {
            enabled: config?.antiNuke?.enabled || false,
            emergencyMode: isEmergencyMode,
            emergencySince: isEmergencyMode ? this.emergencyMode.get(guildId).timestamp : null,
            emergencyReason: isEmergencyMode ? this.emergencyMode.get(guildId).reason : null,
            whitelistedUsers: config?.antiNuke?.whitelistedUsers?.length || 0
        };
    }
    
    // Release user from quarantine
    async releaseFromQuarantine(guild, userId) {
        const config = await GuildConfig.findOne({ guildId: guild.id });
        if (!config?.antiNuke?.quarantinedUsers?.[userId]) {
            return false;
        }
        
        try {
            const member = await guild.members.fetch(userId);
            if (!member) return false;
            
            // Restore original roles
            const { originalRoles } = config.antiNuke.quarantinedUsers[userId];
            await member.roles.set(originalRoles);
            
            // Remove from quarantined users list
            delete config.antiNuke.quarantinedUsers[userId];
            await GuildConfig.set(guild.id, config);
            
            // Log action
            if (config.moderation?.modLogChannel) {
                const logChannel = await guild.channels.fetch(config.moderation.modLogChannel);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('🛡️ Quarantine Released')
                        .setDescription(`User released from quarantine`)
                        .addFields(
                            { name: 'User', value: `${member.user.tag} (${member.id})` }
                        )
                        .setTimestamp();
                    
                    await logChannel.send({ embeds: [logEmbed] });
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error releasing user from quarantine:', error);
            return false;
        }
    }
}

module.exports = new AntiNuke(); 