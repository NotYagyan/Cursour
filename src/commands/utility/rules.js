const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { GuildConfig } = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('Configure bot command rules and prefixes')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('prefix')
                .setDescription('Set or view the command prefix for this server')
                .addStringOption(option =>
                    option
                        .setName('prefix')
                        .setDescription('The new prefix to use (e.g., !, ., >, $)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('prefixless')
                .setDescription('Configure prefixless commands for whitelisted users')
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable or disable prefixless commands for whitelisted users')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('slash')
                .setDescription('Configure slash commands')
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable or disable slash commands')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current command rules configuration')),

    // Add aliases
    aliases: ['botrules', 'cmdrules', 'commandrules'],

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        // Get guild config
        let config = await GuildConfig.findOne({ guildId });
        if (!config) {
            config = { guildId };
        }

        // Initialize rules if they don't exist
        if (!config.rules) {
            config.rules = {
                prefix: '!',
                prefixlessEnabled: true,
                slashEnabled: true
            };
        }

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Bot Command Rules')
            .setFooter({ text: 'Changes apply immediately' });

        switch (subcommand) {
            case 'prefix':
                const newPrefix = interaction.options.getString('prefix');
                
                if (newPrefix) {
                    // Validate prefix
                    if (newPrefix.length > 3) {
                        embed.setColor('#FF0000')
                            .setDescription('❌ Prefix must be 3 characters or less');
                        return interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                    
                    // Update prefix
                    config.rules.prefix = newPrefix;
                    await GuildConfig.set(guildId, config);
                    
                    embed.setDescription(`✅ Command prefix has been set to \`${newPrefix}\``);
                } else {
                    // Display current prefix
                    embed.setDescription(`Current command prefix is \`${config.rules.prefix}\``);
                }
                break;
                
            case 'prefixless':
                const prefixlessEnabled = interaction.options.getBoolean('enabled');
                
                config.rules.prefixlessEnabled = prefixlessEnabled;
                await GuildConfig.set(guildId, config);
                
                embed.setDescription(`${prefixlessEnabled ? '✅ Enabled' : '❌ Disabled'} prefixless commands for users in the global prefixless whitelist`)
                    .addFields({
                        name: 'Note',
                        value: 'The prefixless whitelist is managed via the WHITELISTED_USERS environment variable and is separate from the anti-nuke whitelist.'
                    });
                break;
                
            case 'slash':
                const slashEnabled = interaction.options.getBoolean('enabled');
                
                config.rules.slashEnabled = slashEnabled;
                await GuildConfig.set(guildId, config);
                
                embed.setDescription(`${slashEnabled ? '✅ Enabled' : '❌ Disabled'} slash commands`);
                break;
                
            case 'view':
                // Get global prefixless whitelist count
                const globalPrefixlessWhitelist = process.env.WHITELISTED_USERS?.split(',').filter(id => id.trim() !== '') || [];
                const prefixlessWhitelistCount = globalPrefixlessWhitelist.length;
                
                embed.setDescription('Current Command Rules Configuration')
                    .addFields(
                        { name: 'Command Prefix', value: `\`${config.rules.prefix}\``, inline: true },
                        { name: 'Prefixless Commands', value: config.rules.prefixlessEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                        { name: 'Slash Commands', value: config.rules.slashEnabled ? '✅ Enabled' : '❌ Disabled', inline: true }
                    );

                // Add info about prefixless whitelist
                embed.addFields({
                    name: '🌟 Prefixless Command Users',
                    value: `There are ${prefixlessWhitelistCount} users in the global prefixless whitelist who ${config.rules.prefixlessEnabled ? 'can' : 'cannot'} use commands without prefix`
                });
                
                // Add info about anti-nuke whitelist
                if (config.antiNuke?.whitelistedUsers?.length > 0) {
                    embed.addFields({
                        name: '🛡️ Anti-Nuke Whitelisted Users',
                        value: `There are ${config.antiNuke.whitelistedUsers.length} users whitelisted from anti-nuke/anti-raid protections`
                    });
                }
                break;
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    // For traditional prefix commands
    async messageRun(message, args) {
        // Check for admin permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ You need Administrator permission to use this command.');
        }

        const guildId = message.guild.id;
        
        // Get guild config
        let config = await GuildConfig.findOne({ guildId });
        if (!config) {
            config = { guildId };
        }

        // Initialize rules if they don't exist
        if (!config.rules) {
            config.rules = {
                prefix: '!',
                prefixlessEnabled: true,
                slashEnabled: true
            };
        }

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Bot Command Rules')
            .setFooter({ text: 'Changes apply immediately' });

        const subcommand = args[0]?.toLowerCase();
        
        if (!subcommand || subcommand === 'view') {
            // Get global prefixless whitelist count
            const globalPrefixlessWhitelist = process.env.WHITELISTED_USERS?.split(',').filter(id => id.trim() !== '') || [];
            const prefixlessWhitelistCount = globalPrefixlessWhitelist.length;
            
            embed.setDescription('Current Command Rules Configuration')
                .addFields(
                    { name: 'Command Prefix', value: `\`${config.rules.prefix}\``, inline: true },
                    { name: 'Prefixless Commands', value: config.rules.prefixlessEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Slash Commands', value: config.rules.slashEnabled ? '✅ Enabled' : '❌ Disabled', inline: true }
                );

            // Add info about prefixless whitelist
            embed.addFields({
                name: '🌟 Prefixless Command Users',
                value: `There are ${prefixlessWhitelistCount} users in the global prefixless whitelist who ${config.rules.prefixlessEnabled ? 'can' : 'cannot'} use commands without prefix`
            });
            
            // Add info about anti-nuke whitelist
            if (config.antiNuke?.whitelistedUsers?.length > 0) {
                embed.addFields({
                    name: '🛡️ Anti-Nuke Whitelisted Users',
                    value: `There are ${config.antiNuke.whitelistedUsers.length} users whitelisted from anti-nuke/anti-raid protections`
                });
            }
        } else if (subcommand === 'prefix') {
            const newPrefix = args[1];
            
            if (newPrefix) {
                // Validate prefix
                if (newPrefix.length > 3) {
                    embed.setColor('#FF0000')
                        .setDescription('❌ Prefix must be 3 characters or less');
                    return message.reply({ embeds: [embed] });
                }
                
                // Update prefix
                config.rules.prefix = newPrefix;
                await GuildConfig.set(guildId, config);
                
                embed.setDescription(`✅ Command prefix has been set to \`${newPrefix}\``);
            } else {
                // Display current prefix
                embed.setDescription(`Current command prefix is \`${config.rules.prefix}\``);
            }
        } else if (subcommand === 'prefixless') {
            const enableArg = args[1]?.toLowerCase();
            
            if (enableArg === 'true' || enableArg === 'enable' || enableArg === 'on' || enableArg === 'yes') {
                config.rules.prefixlessEnabled = true;
                await GuildConfig.set(guildId, config);
                embed.setDescription('✅ Enabled prefixless commands for users in the global prefixless whitelist')
                    .addFields({
                        name: 'Note',
                        value: 'The prefixless whitelist is managed via the WHITELISTED_USERS environment variable and is separate from the anti-nuke whitelist.'
                    });
            } else if (enableArg === 'false' || enableArg === 'disable' || enableArg === 'off' || enableArg === 'no') {
                config.rules.prefixlessEnabled = false;
                await GuildConfig.set(guildId, config);
                embed.setDescription('❌ Disabled prefixless commands for users in the global prefixless whitelist');
            } else {
                embed.setColor('#FF0000')
                    .setDescription('❌ Invalid option. Use `enable` or `disable`');
            }
        } else if (subcommand === 'slash') {
            const enableArg = args[1]?.toLowerCase();
            
            if (enableArg === 'true' || enableArg === 'enable' || enableArg === 'on' || enableArg === 'yes') {
                config.rules.slashEnabled = true;
                await GuildConfig.set(guildId, config);
                embed.setDescription('✅ Enabled slash commands');
            } else if (enableArg === 'false' || enableArg === 'disable' || enableArg === 'off' || enableArg === 'no') {
                config.rules.slashEnabled = false;
                await GuildConfig.set(guildId, config);
                embed.setDescription('❌ Disabled slash commands');
            } else {
                embed.setColor('#FF0000')
                    .setDescription('❌ Invalid option. Use `enable` or `disable`');
            }
        } else {
            embed.setColor('#FF0000')
                .setDescription('❌ Unknown subcommand. Available subcommands: `view`, `prefix`, `prefixless`, `slash`');
        }

        await message.reply({ embeds: [embed] });
    }
}; 