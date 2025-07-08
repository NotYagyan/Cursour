const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { GuildConfig } = require('../../utils/database');
const antiRaid = require('../../systems/antiRaid');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antiraid')
        .setDescription('Configure anti-raid protection settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable anti-raid protection'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable anti-raid protection'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('settings')
                .setDescription('Configure anti-raid settings')
                .addIntegerOption(option =>
                    option
                        .setName('join_threshold')
                        .setDescription('Number of joins within time window to trigger raid detection')
                        .setMinValue(2)
                        .setMaxValue(50))
                .addIntegerOption(option =>
                    option
                        .setName('join_time')
                        .setDescription('Time window in seconds for join threshold')
                        .setMinValue(1)
                        .setMaxValue(300))
                .addIntegerOption(option =>
                    option
                        .setName('min_account_age')
                        .setDescription('Minimum account age in days')
                        .setMinValue(0)
                        .setMaxValue(365))
                .addIntegerOption(option =>
                    option
                        .setName('new_account_threshold')
                        .setDescription('Number of new accounts to trigger raid detection')
                        .setMinValue(2)
                        .setMaxValue(20))
                .addNumberOption(option =>
                    option
                        .setName('similar_name_threshold')
                        .setDescription('Similarity threshold for usernames (0.0-1.0)')
                        .setMinValue(0)
                        .setMaxValue(1))
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('Action to take on raid detection')
                        .addChoices(
                            { name: 'Ban', value: 'BAN' },
                            { name: 'Kick', value: 'KICK' },
                            { name: 'Verification', value: 'VERIFICATION' }
                        ))
                .addStringOption(option =>
                    option
                        .setName('expired_verification_action')
                        .setDescription('Action when verification expires')
                        .addChoices(
                            { name: 'Kick', value: 'KICK' },
                            { name: 'None (Leave in verification)', value: 'NONE' }
                        ))
                .addStringOption(option =>
                    option
                        .setName('max_failed_verification_action')
                        .setDescription('Action when too many verification attempts fail')
                        .addChoices(
                            { name: 'Kick', value: 'KICK' },
                            { name: 'Ban', value: 'BAN' },
                            { name: 'None', value: 'NONE' }
                        ))
                .addRoleOption(option =>
                    option
                        .setName('alert_role')
                        .setDescription('Role to ping when raid is detected'))
                .addRoleOption(option =>
                    option
                        .setName('default_role')
                        .setDescription('Role to give after verification (if using verification mode)'))
                .addIntegerOption(option =>
                    option
                        .setName('cooldown')
                        .setDescription('Time in minutes before raid mode auto-disables')
                        .setMinValue(1)
                        .setMaxValue(1440)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check current raid status and statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('force')
                .setDescription('Manually enable or disable raid mode')
                .addBooleanOption(option => 
                    option
                        .setName('enabled')
                        .setDescription('Set to true to enable, false to disable')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for manual raid mode change')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option
                        .setName('duration')
                        .setDescription('Duration in minutes before auto-disable (if enabling)')
                        .setMinValue(1)
                        .setMaxValue(1440)
                        .setRequired(false))),

    // Add aliases
    aliases: ['raid', 'ar', 'raidprotection', 'antiraidmode'],

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        let config = await GuildConfig.findOne({ guildId });
        if (!config) {
            config = { guildId };
        }

        if (!config.antiRaid) {
            config.antiRaid = {
                enabled: false,
                joinThreshold: 10,
                joinTime: 30000, // 30 seconds
                minAccountAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                newAccountThreshold: 5,
                similarNameThreshold: 0.8,
                action: 'VERIFICATION',
                raidModeCooldown: 30 * 60 * 1000, // 30 minutes
                expiredVerificationAction: 'NONE',
                maxFailedVerificationAction: 'NONE'
            };
        }

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Anti-Raid Configuration');

        switch (subcommand) {
            case 'enable':
                config.antiRaid.enabled = true;
                await GuildConfig.set(guildId, config);
                embed.setDescription('✅ Anti-Raid protection has been enabled');
                break;

            case 'disable':
                config.antiRaid.enabled = false;
                await GuildConfig.set(guildId, config);
                antiRaid.resetGuild(guildId);
                embed.setDescription('❌ Anti-Raid protection has been disabled');
                break;
                
            case 'status':
                const raidStatus = antiRaid.getRaidModeStatus(guildId);
                const raidStats = antiRaid.getRaidStats(guildId);
                
                embed
                    .setDescription('🛡️ Anti-Raid System Status')
                    .addFields(
                        { name: 'Protection Status', value: config.antiRaid.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                        { name: 'Raid Mode', value: raidStatus.active ? '🚨 **ACTIVE**' : '✅ Inactive', inline: true }
                    );
                    
                if (raidStatus.active) {
                    const duration = Math.floor((Date.now() - raidStatus.since) / (60 * 1000));
                    embed.addFields(
                        { name: 'Raid Duration', value: `${duration} minutes`, inline: true },
                        { name: 'Severity', value: `${raidStatus.severity}/5`, inline: true },
                        { name: 'Reason', value: raidStatus.reason.join('\n'), inline: false }
                    );
                }
                
                embed.addFields(
                    { name: 'Raid Statistics', value: `Total Raids: ${raidStats.totalRaids}\nTotal Suspicious Accounts: ${raidStats.totalRaidAccounts}\nHighest Severity: ${raidStats.highestSeverity}/5` }
                );
                break;
                
            case 'force':
                const enabled = interaction.options.getBoolean('enabled');
                const reason = interaction.options.getString('reason') || (enabled ? 'Manual activation' : 'Manual deactivation');
                const duration = interaction.options.getInteger('duration') || 30;
                
                await antiRaid.setRaidMode(interaction.guild, enabled, reason, duration);
                
                embed
                    .setColor(enabled ? '#FF0000' : '#00FF00')
                    .setDescription(enabled ? 
                        `🚨 Raid mode has been **MANUALLY ENABLED**\nReason: ${reason}\nDuration: ${duration} minutes` : 
                        '✅ Raid mode has been **MANUALLY DISABLED**');
                break;

            case 'settings':
                // Update settings if provided
                const joinThreshold = interaction.options.getInteger('join_threshold');
                const joinTime = interaction.options.getInteger('join_time');
                const minAccountAge = interaction.options.getInteger('min_account_age');
                const newAccountThreshold = interaction.options.getInteger('new_account_threshold');
                const similarNameThreshold = interaction.options.getNumber('similar_name_threshold');
                const action = interaction.options.getString('action');
                const alertRole = interaction.options.getRole('alert_role');
                const defaultRole = interaction.options.getRole('default_role');
                const cooldown = interaction.options.getInteger('cooldown');
                const expiredVerificationAction = interaction.options.getString('expired_verification_action');
                const maxFailedVerificationAction = interaction.options.getString('max_failed_verification_action');

                if (joinThreshold) config.antiRaid.joinThreshold = joinThreshold;
                if (joinTime) config.antiRaid.joinTime = joinTime * 1000; // Convert to milliseconds
                if (minAccountAge) config.antiRaid.minAccountAge = minAccountAge * 24 * 60 * 60 * 1000; // Convert to milliseconds
                if (newAccountThreshold) config.antiRaid.newAccountThreshold = newAccountThreshold;
                if (similarNameThreshold) config.antiRaid.similarNameThreshold = similarNameThreshold;
                if (action) config.antiRaid.action = action;
                if (alertRole) config.antiRaid.alertRole = alertRole.id;
                if (defaultRole) config.antiRaid.defaultRole = defaultRole.id;
                if (cooldown) config.antiRaid.raidModeCooldown = cooldown * 60 * 1000; // Convert to milliseconds
                if (expiredVerificationAction) config.antiRaid.expiredVerificationAction = expiredVerificationAction;
                if (maxFailedVerificationAction) config.antiRaid.maxFailedVerificationAction = maxFailedVerificationAction;

                await GuildConfig.set(guildId, config);

                // Build settings display
                embed
                    .setDescription('Current Anti-Raid Settings:')
                    .addFields(
                        { name: 'Status', value: config.antiRaid.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                        { name: 'Join Threshold', value: `${config.antiRaid.joinThreshold} joins`, inline: true },
                        { name: 'Time Window', value: `${config.antiRaid.joinTime / 1000}s`, inline: true },
                        { name: 'Min Account Age', value: `${config.antiRaid.minAccountAge / (24 * 60 * 60 * 1000)}d`, inline: true },
                        { name: 'New Account Threshold', value: `${config.antiRaid.newAccountThreshold} accounts`, inline: true },
                        { name: 'Name Similarity Threshold', value: `${config.antiRaid.similarNameThreshold}`, inline: true },
                        { name: 'Action', value: config.antiRaid.action, inline: true },
                        { name: 'Alert Role', value: config.antiRaid.alertRole ? `<@&${config.antiRaid.alertRole}>` : 'None', inline: true },
                        { name: 'Default Role', value: config.antiRaid.defaultRole ? `<@&${config.antiRaid.defaultRole}>` : 'None', inline: true },
                        { name: 'Raid Mode Cooldown', value: `${config.antiRaid.raidModeCooldown / (60 * 1000)}m`, inline: true },
                        { name: 'Expired Verification', value: config.antiRaid.expiredVerificationAction || 'NONE', inline: true },
                        { name: 'Failed Verification', value: config.antiRaid.maxFailedVerificationAction || 'NONE', inline: true }
                    );
                break;
        }

        await interaction.reply({ embeds: [embed] });
    },

    // Legacy command support
    async messageRun(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ You need Administrator permission to use this command.');
        }

        const [subcommand, ...options] = args;
        const guildId = message.guild.id;

        let config = await GuildConfig.findOne({ guildId });
        if (!config) {
            config = { guildId };
        }

        if (!config.antiRaid) {
            config.antiRaid = {
                enabled: false,
                joinThreshold: 10,
                joinTime: 30000,
                minAccountAge: 7 * 24 * 60 * 60 * 1000,
                newAccountThreshold: 5,
                similarNameThreshold: 0.8,
                action: 'VERIFICATION',
                raidModeCooldown: 30 * 60 * 1000,
                expiredVerificationAction: 'NONE',
                maxFailedVerificationAction: 'NONE'
            };
        }

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Anti-Raid Configuration');

        switch (subcommand?.toLowerCase()) {
            case 'enable':
                config.antiRaid.enabled = true;
                await GuildConfig.set(guildId, config);
                embed.setDescription('✅ Anti-Raid protection has been enabled');
                break;

            case 'disable':
                config.antiRaid.enabled = false;
                await GuildConfig.set(guildId, config);
                antiRaid.resetGuild(guildId);
                embed.setDescription('❌ Anti-Raid protection has been disabled');
                break;
                
            case 'status':
                const raidStatus = antiRaid.getRaidModeStatus(guildId);
                const raidStats = antiRaid.getRaidStats(guildId);
                
                embed
                    .setDescription('🛡️ Anti-Raid System Status')
                    .addFields(
                        { name: 'Protection Status', value: config.antiRaid.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                        { name: 'Raid Mode', value: raidStatus.active ? '🚨 **ACTIVE**' : '✅ Inactive', inline: true }
                    );
                    
                if (raidStatus.active) {
                    const duration = Math.floor((Date.now() - raidStatus.since) / (60 * 1000));
                    embed.addFields(
                        { name: 'Raid Duration', value: `${duration} minutes`, inline: true },
                        { name: 'Severity', value: `${raidStatus.severity}/5`, inline: true },
                        { name: 'Reason', value: raidStatus.reason.join('\n'), inline: false }
                    );
                }
                
                embed.addFields(
                    { name: 'Raid Statistics', value: `Total Raids: ${raidStats.totalRaids}\nTotal Suspicious Accounts: ${raidStats.totalRaidAccounts}\nHighest Severity: ${raidStats.highestSeverity}/5` }
                );
                break;
                
            case 'force':
                if (options.length < 1) {
                    return message.reply('❌ Please specify whether to enable or disable raid mode: `antiraid force true/false [reason] [duration]`');
                }
                
                const enabled = options[0].toLowerCase() === 'true' || options[0].toLowerCase() === 'on';
                const reason = options[1] || (enabled ? 'Manual activation' : 'Manual deactivation');
                const duration = parseInt(options[2]) || 30;
                
                await antiRaid.setRaidMode(message.guild, enabled, reason, duration);
                
                embed
                    .setColor(enabled ? '#FF0000' : '#00FF00')
                    .setDescription(enabled ? 
                        `🚨 Raid mode has been **MANUALLY ENABLED**\nReason: ${reason}\nDuration: ${duration} minutes` : 
                        '✅ Raid mode has been **MANUALLY DISABLED**');
                break;

            case 'settings':
                if (options.length === 0) {
                    // Display current settings
                    embed
                        .setDescription('Current Anti-Raid Settings:')
                        .addFields(
                            { name: 'Status', value: config.antiRaid.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                            { name: 'Join Threshold', value: `${config.antiRaid.joinThreshold} joins`, inline: true },
                            { name: 'Time Window', value: `${config.antiRaid.joinTime / 1000}s`, inline: true },
                            { name: 'Min Account Age', value: `${config.antiRaid.minAccountAge / (24 * 60 * 60 * 1000)}d`, inline: true },
                            { name: 'New Account Threshold', value: `${config.antiRaid.newAccountThreshold} accounts`, inline: true },
                            { name: 'Name Similarity Threshold', value: `${config.antiRaid.similarNameThreshold}`, inline: true },
                            { name: 'Action', value: config.antiRaid.action, inline: true },
                            { name: 'Alert Role', value: config.antiRaid.alertRole ? `<@&${config.antiRaid.alertRole}>` : 'None', inline: true },
                            { name: 'Default Role', value: config.antiRaid.defaultRole ? `<@&${config.antiRaid.defaultRole}>` : 'None', inline: true },
                            { name: 'Raid Mode Cooldown', value: `${config.antiRaid.raidModeCooldown / (60 * 1000)}m`, inline: true },
                            { name: 'Expired Verification', value: config.antiRaid.expiredVerificationAction || 'NONE', inline: true },
                            { name: 'Failed Verification', value: config.antiRaid.maxFailedVerificationAction || 'NONE', inline: true }
                        );
                } else {
                    // Parse settings
                    const settings = {};
                    for (let i = 0; i < options.length; i += 2) {
                        const key = options[i].toLowerCase();
                        const value = options[i + 1];

                        switch (key) {
                            case 'threshold':
                            case 'join_threshold':
                                settings.joinThreshold = parseInt(value);
                                break;
                            case 'time':
                            case 'join_time':
                                settings.joinTime = parseInt(value) * 1000;
                                break;
                            case 'age':
                            case 'min_account_age':
                                settings.minAccountAge = parseInt(value) * 24 * 60 * 60 * 1000;
                                break;
                            case 'new_accounts':
                            case 'new_account_threshold':
                                settings.newAccountThreshold = parseInt(value);
                                break;
                            case 'similarity':
                            case 'similar_name_threshold':
                                settings.similarNameThreshold = parseFloat(value);
                                break;
                            case 'action':
                                if (['BAN', 'KICK', 'VERIFICATION'].includes(value.toUpperCase())) {
                                    settings.action = value.toUpperCase();
                                }
                                break;
                            case 'alert_role':
                                const alertRole = message.mentions.roles.first() || message.guild.roles.cache.get(value);
                                if (alertRole) settings.alertRole = alertRole.id;
                                break;
                            case 'default_role':
                                const defaultRole = message.mentions.roles.first() || message.guild.roles.cache.get(value);
                                if (defaultRole) settings.defaultRole = defaultRole.id;
                                break;
                            case 'cooldown':
                                settings.raidModeCooldown = parseInt(value) * 60 * 1000;
                                break;
                            case 'expired_verification':
                                if (['KICK', 'NONE'].includes(value.toUpperCase())) {
                                    settings.expiredVerificationAction = value.toUpperCase();
                                }
                                break;
                            case 'failed_verification':
                                if (['KICK', 'BAN', 'NONE'].includes(value.toUpperCase())) {
                                    settings.maxFailedVerificationAction = value.toUpperCase();
                                }
                                break;
                        }
                    }

                    // Update config with valid settings
                    Object.assign(config.antiRaid, settings);
                    await GuildConfig.set(guildId, config);

                    embed.setDescription('✅ Anti-Raid settings have been updated');
                }
                break;

            default:
                embed
                    .setColor('#FF0000')
                    .setDescription('Invalid subcommand. Available subcommands:\n`enable`, `disable`, `settings`, `status`, `force`\n\n**Examples:**\n`antiraid enable` - Enable the system\n`antiraid settings threshold 10 time 30` - Update settings\n`antiraid force true "Suspicious activity"` - Manually enable raid mode');
                break;
        }

        await message.reply({ embeds: [embed] });
    }
}; 