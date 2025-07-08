const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { GuildConfig } = require('../../utils/database');

module.exports = {
    // Slash command
    data: new SlashCommandBuilder()
        .setName('antinuke')
        .setDescription('Configure the anti-nuke system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable the anti-nuke system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable the anti-nuke system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Configure anti-nuke settings')
                .addStringOption(option =>
                    option
                        .setName('punishment')
                        .setDescription('Action to take when threshold is exceeded')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Ban', value: 'BAN' },
                            { name: 'Kick', value: 'KICK' },
                            { name: 'Strip Roles', value: 'STRIP_ROLES' },
                            { name: 'Quarantine', value: 'QUARANTINE' }
                        ))
                .addIntegerOption(option =>
                    option
                        .setName('max_bans')
                        .setDescription('Maximum bans allowed within threshold (1-10)')
                        .setMinValue(1)
                        .setMaxValue(10))
                .addIntegerOption(option =>
                    option
                        .setName('max_kicks')
                        .setDescription('Maximum kicks allowed within threshold (1-10)')
                        .setMinValue(1)
                        .setMaxValue(10))
                .addIntegerOption(option =>
                    option
                        .setName('max_role_deletes')
                        .setDescription('Maximum role deletions allowed within threshold (1-10)')
                        .setMinValue(1)
                        .setMaxValue(10))
                .addIntegerOption(option =>
                    option
                        .setName('max_channel_deletes')
                        .setDescription('Maximum channel deletions allowed within threshold (1-10)')
                        .setMinValue(1)
                        .setMaxValue(10))
                .addIntegerOption(option =>
                    option
                        .setName('max_webhook_deletes')
                        .setDescription('Maximum webhook deletions allowed within threshold (1-10)')
                        .setMinValue(1)
                        .setMaxValue(10))
                .addIntegerOption(option =>
                    option
                        .setName('max_emoji_deletes')
                        .setDescription('Maximum emoji deletions allowed within threshold (1-10)')
                        .setMinValue(1)
                        .setMaxValue(10))
                .addIntegerOption(option =>
                    option
                        .setName('max_permission_updates')
                        .setDescription('Maximum permission updates allowed within threshold (1-15)')
                        .setMinValue(1)
                        .setMaxValue(15))
                .addIntegerOption(option =>
                    option
                        .setName('max_mass_mentions')
                        .setDescription('Maximum mass mention messages allowed within threshold (1-10)')
                        .setMinValue(1)
                        .setMaxValue(10))
                .addIntegerOption(option =>
                    option
                        .setName('max_bot_adds')
                        .setDescription('Maximum bot additions allowed within threshold (1-5)')
                        .setMinValue(1)
                        .setMaxValue(5))
                .addIntegerOption(option =>
                    option
                        .setName('threshold')
                        .setDescription('Time window in seconds to track actions (30-300)')
                        .setMinValue(30)
                        .setMaxValue(300))
                .addBooleanOption(option =>
                    option
                        .setName('emergency_mode')
                        .setDescription('Enable emergency mode features (automatically restrict roles when suspicious activity detected)')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current anti-nuke status and configuration')),

    // Prefix command
    name: 'antinuke',
    description: 'Configure the anti-nuke system',

    // Add aliases to the module.exports object
    aliases: ['antinuke', 'an', 'nuke', 'anti'],

    async execute(interaction, args, client) {
        // Check if user has admin permissions
        const member = interaction.member || interaction.guild.members.cache.get(interaction.author.id);
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
            const reply = { content: 'You need Administrator permission to use this command!', ephemeral: true };
            if (interaction.reply) {
                return interaction.reply(reply);
            } else {
                return interaction.channel.send(reply.content);
            }
        }

        try {
            let guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId || interaction.guild.id });
            const isSlash = interaction.commandName ? true : false;

            if (!guildConfig) {
                guildConfig = {
                    guildId: interaction.guildId || interaction.guild.id,
                    antiNuke: {
                        enabled: false,
                        punishment: 'BAN',
                        maxBans: 3,
                        maxKicks: 3,
                        maxRoleDeletes: 2,
                        maxChannelDeletes: 2,
                        maxWebhookDeletes: 3,
                        maxEmojiDeletes: 5,
                        maxPermissionUpdates: 5,
                        maxMassMentions: 3,
                        maxBotAdds: 2,
                        maxGuildUpdates: 2,
                        maxMemberPrunes: 2,
                        actionThreshold: 60000, // 60 seconds in milliseconds
                        emergencyModeEnabled: false
                    }
                };
                // Create new guild config
                await GuildConfig.set(guildConfig.guildId, guildConfig);
            }
            
            // Initialize anti-nuke config with new fields if needed
            if (!guildConfig.antiNuke) {
                guildConfig.antiNuke = {
                    enabled: false,
                    punishment: 'BAN',
                    maxBans: 3,
                    maxKicks: 3,
                    maxRoleDeletes: 2,
                    maxChannelDeletes: 2,
                    actionThreshold: 60000 // 60 seconds in milliseconds
                };
            }
            
            // Add new fields with defaults if they don't exist
            if (!guildConfig.antiNuke.maxWebhookDeletes) guildConfig.antiNuke.maxWebhookDeletes = 3;
            if (!guildConfig.antiNuke.maxEmojiDeletes) guildConfig.antiNuke.maxEmojiDeletes = 5;
            if (!guildConfig.antiNuke.maxPermissionUpdates) guildConfig.antiNuke.maxPermissionUpdates = 5;
            if (!guildConfig.antiNuke.maxMassMentions) guildConfig.antiNuke.maxMassMentions = 3;
            if (!guildConfig.antiNuke.maxBotAdds) guildConfig.antiNuke.maxBotAdds = 2;
            if (!guildConfig.antiNuke.maxGuildUpdates) guildConfig.antiNuke.maxGuildUpdates = 2;
            if (!guildConfig.antiNuke.maxMemberPrunes) guildConfig.antiNuke.maxMemberPrunes = 2;
            if (guildConfig.antiNuke.emergencyModeEnabled === undefined) guildConfig.antiNuke.emergencyModeEnabled = false;
            if (!guildConfig.antiNuke.quarantinedUsers) guildConfig.antiNuke.quarantinedUsers = {};

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Anti-Nuke System Configuration')
                .setTimestamp();

            if (isSlash) {
                // Handle slash command
                const subcommand = interaction.options.getSubcommand();
                switch (subcommand) {
                    case 'enable':
                        guildConfig.antiNuke.enabled = true;
                        embed.setDescription('✅ Anti-Nuke system has been enabled!')
                            .addFields({ name: 'Current Settings', value: this.formatSettings(guildConfig.antiNuke) });
                        break;

                    case 'disable':
                        guildConfig.antiNuke.enabled = false;
                        embed.setDescription('❌ Anti-Nuke system has been disabled!')
                            .setColor('#FF0000');
                        break;
                        
                    case 'status':
                        const antiNuke = require('../../systems/antiNuke');
                        const status = await antiNuke.getStatus(guildConfig.guildId);
                        
                        embed.setDescription('🛡️ Anti-Nuke System Status')
                            .addFields(
                                { name: 'Enabled', value: status.enabled ? '✅ Yes' : '❌ No', inline: true },
                                { name: 'Emergency Mode', value: status.emergencyMode ? '🚨 Active' : '✅ Inactive', inline: true },
                                { name: 'Whitelisted Users', value: `${status.whitelistedUsers}`, inline: true }
                            );
                            
                        if (status.emergencyMode) {
                            const duration = Math.floor((Date.now() - status.emergencySince) / (60 * 1000));
                            embed.addFields(
                                { name: 'Emergency Mode Duration', value: `${duration} minutes`, inline: true },
                                { name: 'Reason', value: status.emergencyReason, inline: true }
                            );
                        }
                        
                        embed.addFields({ name: 'Current Settings', value: this.formatSettings(guildConfig.antiNuke) });
                        break;

                    case 'config':
                        const punishment = interaction.options.getString('punishment');
                        const maxBans = interaction.options.getInteger('max_bans');
                        const maxKicks = interaction.options.getInteger('max_kicks');
                        const maxRoleDeletes = interaction.options.getInteger('max_role_deletes');
                        const maxChannelDeletes = interaction.options.getInteger('max_channel_deletes');
                        const maxWebhookDeletes = interaction.options.getInteger('max_webhook_deletes');
                        const maxEmojiDeletes = interaction.options.getInteger('max_emoji_deletes');
                        const maxPermissionUpdates = interaction.options.getInteger('max_permission_updates');
                        const maxMassMentions = interaction.options.getInteger('max_mass_mentions');
                        const maxBotAdds = interaction.options.getInteger('max_bot_adds');
                        const threshold = interaction.options.getInteger('threshold');
                        const emergencyMode = interaction.options.getBoolean('emergency_mode');

                        if (punishment) guildConfig.antiNuke.punishment = punishment;
                        if (maxBans) guildConfig.antiNuke.maxBans = maxBans;
                        if (maxKicks) guildConfig.antiNuke.maxKicks = maxKicks;
                        if (maxRoleDeletes) guildConfig.antiNuke.maxRoleDeletes = maxRoleDeletes;
                        if (maxChannelDeletes) guildConfig.antiNuke.maxChannelDeletes = maxChannelDeletes;
                        if (maxWebhookDeletes) guildConfig.antiNuke.maxWebhookDeletes = maxWebhookDeletes;
                        if (maxEmojiDeletes) guildConfig.antiNuke.maxEmojiDeletes = maxEmojiDeletes;
                        if (maxPermissionUpdates) guildConfig.antiNuke.maxPermissionUpdates = maxPermissionUpdates;
                        if (maxMassMentions) guildConfig.antiNuke.maxMassMentions = maxMassMentions;
                        if (maxBotAdds) guildConfig.antiNuke.maxBotAdds = maxBotAdds;
                        if (threshold) guildConfig.antiNuke.actionThreshold = threshold * 1000;
                        if (emergencyMode !== null) guildConfig.antiNuke.emergencyModeEnabled = emergencyMode;

                        embed.setDescription('⚙️ Anti-Nuke configuration updated!')
                            .addFields({ name: 'New Settings', value: this.formatSettings(guildConfig.antiNuke) });
                        break;
                }
            } else {
                // Handle prefix command
                if (!args.length) {
                    embed.setDescription('Current Anti-Nuke System Status')
                        .addFields({ name: 'Settings', value: this.formatSettings(guildConfig.antiNuke) })
                        .addFields({
                            name: 'Available Commands',
                            value: `\`antinuke enable\` - Enable the system
\`antinuke disable\` - Disable the system
\`antinuke status\` - View detailed system status
\`antinuke config <setting> <value>\` - Configure settings

**Available settings:**
- punishment (BAN/KICK/STRIP_ROLES/QUARANTINE)
- maxbans (1-10)
- maxkicks (1-10)
- maxroledeletes (1-10)
- maxchanneldeletes (1-10)
- maxwebhookdeletes (1-10)
- maxemojiDeletes (1-10)
- maxpermissionupdates (1-15)
- maxmassmentions (1-10)
- maxbotadds (1-5)
- threshold (30-300 seconds)
- emergencymode (true/false)`
                        });
                } else {
                    const subcommand = args[0].toLowerCase();
                    switch (subcommand) {
                        case 'enable':
                            guildConfig.antiNuke.enabled = true;
                            embed.setDescription('✅ Anti-Nuke system has been enabled!')
                                .addFields({ name: 'Current Settings', value: this.formatSettings(guildConfig.antiNuke) });
                            break;

                        case 'disable':
                            guildConfig.antiNuke.enabled = false;
                            embed.setDescription('❌ Anti-Nuke system has been disabled!')
                                .setColor('#FF0000');
                            break;
                            
                        case 'status':
                            const antiNuke = require('../../systems/antiNuke');
                            const status = await antiNuke.getStatus(guildConfig.guildId);
                            
                            embed.setDescription('🛡️ Anti-Nuke System Status')
                                .addFields(
                                    { name: 'Enabled', value: status.enabled ? '✅ Yes' : '❌ No', inline: true },
                                    { name: 'Emergency Mode', value: status.emergencyMode ? '🚨 Active' : '✅ Inactive', inline: true },
                                    { name: 'Whitelisted Users', value: `${status.whitelistedUsers}`, inline: true }
                                );
                                
                            if (status.emergencyMode) {
                                const duration = Math.floor((Date.now() - status.emergencySince) / (60 * 1000));
                                embed.addFields(
                                    { name: 'Emergency Mode Duration', value: `${duration} minutes`, inline: true },
                                    { name: 'Reason', value: status.emergencyReason, inline: true }
                                );
                            }
                            
                            embed.addFields({ name: 'Current Settings', value: this.formatSettings(guildConfig.antiNuke) });
                            break;

                        case 'config':
                            if (args.length < 3) {
                                return interaction.channel.send('❌ Please provide both setting and value. Example: `antinuke config punishment BAN`');
                            }

                            const setting = args[1].toLowerCase();
                            const value = args[2].toUpperCase();

                            switch (setting) {
                                case 'punishment':
                                    if (!['BAN', 'KICK', 'STRIP_ROLES', 'QUARANTINE'].includes(value)) {
                                        return interaction.channel.send('❌ Invalid punishment type. Use: BAN, KICK, STRIP_ROLES, or QUARANTINE');
                                    }
                                    guildConfig.antiNuke.punishment = value;
                                    break;

                                case 'maxbans':
                                    const maxBans = parseInt(value);
                                    if (isNaN(maxBans) || maxBans < 1 || maxBans > 10) {
                                        return interaction.channel.send('❌ Max bans must be between 1 and 10');
                                    }
                                    guildConfig.antiNuke.maxBans = maxBans;
                                    break;

                                case 'maxkicks':
                                    const maxKicks = parseInt(value);
                                    if (isNaN(maxKicks) || maxKicks < 1 || maxKicks > 10) {
                                        return interaction.channel.send('❌ Max kicks must be between 1 and 10');
                                    }
                                    guildConfig.antiNuke.maxKicks = maxKicks;
                                    break;

                                case 'maxroledeletes':
                                    const maxRoleDeletes = parseInt(value);
                                    if (isNaN(maxRoleDeletes) || maxRoleDeletes < 1 || maxRoleDeletes > 10) {
                                        return interaction.channel.send('❌ Max role deletes must be between 1 and 10');
                                    }
                                    guildConfig.antiNuke.maxRoleDeletes = maxRoleDeletes;
                                    break;

                                case 'maxchanneldeletes':
                                    const maxChannelDeletes = parseInt(value);
                                    if (isNaN(maxChannelDeletes) || maxChannelDeletes < 1 || maxChannelDeletes > 10) {
                                        return interaction.channel.send('❌ Max channel deletes must be between 1 and 10');
                                    }
                                    guildConfig.antiNuke.maxChannelDeletes = maxChannelDeletes;
                                    break;
                                    
                                case 'maxwebhookdeletes':
                                    const maxWebhookDeletes = parseInt(value);
                                    if (isNaN(maxWebhookDeletes) || maxWebhookDeletes < 1 || maxWebhookDeletes > 10) {
                                        return interaction.channel.send('❌ Max webhook deletes must be between 1 and 10');
                                    }
                                    guildConfig.antiNuke.maxWebhookDeletes = maxWebhookDeletes;
                                    break;
                                    
                                case 'maxemojiDeletes':
                                    const maxEmojiDeletes = parseInt(value);
                                    if (isNaN(maxEmojiDeletes) || maxEmojiDeletes < 1 || maxEmojiDeletes > 10) {
                                        return interaction.channel.send('❌ Max emoji deletes must be between 1 and 10');
                                    }
                                    guildConfig.antiNuke.maxEmojiDeletes = maxEmojiDeletes;
                                    break;
                                    
                                case 'maxpermissionupdates':
                                    const maxPermissionUpdates = parseInt(value);
                                    if (isNaN(maxPermissionUpdates) || maxPermissionUpdates < 1 || maxPermissionUpdates > 15) {
                                        return interaction.channel.send('❌ Max permission updates must be between 1 and 15');
                                    }
                                    guildConfig.antiNuke.maxPermissionUpdates = maxPermissionUpdates;
                                    break;
                                    
                                case 'maxmassmentions':
                                    const maxMassMentions = parseInt(value);
                                    if (isNaN(maxMassMentions) || maxMassMentions < 1 || maxMassMentions > 10) {
                                        return interaction.channel.send('❌ Max mass mentions must be between 1 and 10');
                                    }
                                    guildConfig.antiNuke.maxMassMentions = maxMassMentions;
                                    break;
                                    
                                case 'maxbotadds':
                                    const maxBotAdds = parseInt(value);
                                    if (isNaN(maxBotAdds) || maxBotAdds < 1 || maxBotAdds > 5) {
                                        return interaction.channel.send('❌ Max bot adds must be between 1 and 5');
                                    }
                                    guildConfig.antiNuke.maxBotAdds = maxBotAdds;
                                    break;

                                case 'threshold':
                                    const threshold = parseInt(value);
                                    if (isNaN(threshold) || threshold < 30 || threshold > 300) {
                                        return interaction.channel.send('❌ Threshold must be between 30 and 300 seconds');
                                    }
                                    guildConfig.antiNuke.actionThreshold = threshold * 1000;
                                    break;
                                    
                                case 'emergencymode':
                                    if (!['TRUE', 'FALSE'].includes(value)) {
                                        return interaction.channel.send('❌ Emergency mode must be TRUE or FALSE');
                                    }
                                    guildConfig.antiNuke.emergencyModeEnabled = (value === 'TRUE');
                                    break;

                                default:
                                    return interaction.channel.send('❌ Invalid setting. Use: punishment, maxbans, maxkicks, maxroledeletes, maxchanneldeletes, maxwebhookdeletes, maxemojiDeletes, maxpermissionupdates, maxmassmentions, maxbotadds, threshold, emergencymode');
                            }

                            embed.setDescription('⚙️ Anti-Nuke configuration updated!')
                                .addFields({ name: 'New Settings', value: this.formatSettings(guildConfig.antiNuke) });
                            break;

                        default:
                            return interaction.channel.send('❌ Invalid subcommand. Use: enable, disable, status, or config');
                    }
                }
            }

            // Update guild config
            await GuildConfig.set(guildConfig.guildId, guildConfig);

            if (isSlash) {
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in antinuke command:', error);
            const errorMessage = 'There was an error while executing this command!';
            if (interaction.reply) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.channel.send(errorMessage);
            }
        }
    },

    formatSettings(settings) {
        const enabled = settings.enabled ? '✅ Enabled' : '❌ Disabled';
        const emergencyMode = settings.emergencyModeEnabled ? '✅ Enabled' : '❌ Disabled';
        
        return `**Status:** ${enabled}
**Punishment:** ${settings.punishment}
**Max Bans:** ${settings.maxBans}
**Max Kicks:** ${settings.maxKicks}
**Max Role Deletes:** ${settings.maxRoleDeletes}
**Max Channel Deletes:** ${settings.maxChannelDeletes}
**Max Webhook Deletes:** ${settings.maxWebhookDeletes || 3}
**Max Emoji Deletes:** ${settings.maxEmojiDeletes || 5}
**Max Permission Updates:** ${settings.maxPermissionUpdates || 5}
**Max Mass Mentions:** ${settings.maxMassMentions || 3}
**Max Bot Additions:** ${settings.maxBotAdds || 2}
**Action Threshold:** ${settings.actionThreshold / 1000}s
**Emergency Mode:** ${emergencyMode}`;
    }
}; 