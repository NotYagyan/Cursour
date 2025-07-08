const { 
    PermissionFlagsBits, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require('discord.js');
const { GuildConfig } = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticketsetup')
        .setDescription('Configure the ticket system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable or disable the ticket system')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Whether the ticket system should be enabled')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('category')
                .setDescription('Set the category for ticket channels')
                .addChannelOption(option =>
                    option.setName('category')
                        .setDescription('The category to create tickets in')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('logs')
                .setDescription('Set the channel for ticket logs')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send ticket logs to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('addrole')
                .setDescription('Add a support role to the ticket system')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to add as a support role')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('removerole')
                .setDescription('Remove a support role from the ticket system')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to remove as a support role')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Create a ticket panel in the current channel')
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('The title of the ticket panel')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('The description of the ticket panel')
                        .setRequired(false))),

    aliases: ['setupticket', 'ticketconfig'],

    async execute(interaction) {
        try {
            // Get guild config
            let guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            if (!guildConfig) {
                guildConfig = {
                    guildId: interaction.guild.id,
                    ticketSystem: {
                        enabled: true,
                        categoryId: null,
                        logsChannelId: null,
                        supportRoles: []
                    }
                };
            }

            if (!guildConfig.ticketSystem) {
                guildConfig.ticketSystem = {
                    enabled: true,
                    categoryId: null,
                    logsChannelId: null,
                    supportRoles: []
                };
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'enable': {
                    const enabled = interaction.options.getBoolean('enabled');
                    guildConfig.ticketSystem.enabled = enabled;
                    await GuildConfig.set(interaction.guild.id, guildConfig);
                    
                    return interaction.reply({
                        content: `✅ Ticket system has been ${enabled ? 'enabled' : 'disabled'}.`,
                        ephemeral: true
                    });
                }

                case 'category': {
                    const category = interaction.options.getChannel('category');
                    guildConfig.ticketSystem.categoryId = category.id;
                    await GuildConfig.set(interaction.guild.id, guildConfig);
                    
                    return interaction.reply({
                        content: `✅ Ticket category has been set to ${category.name}.`,
                        ephemeral: true
                    });
                }

                case 'logs': {
                    const channel = interaction.options.getChannel('channel');
                    guildConfig.ticketSystem.logsChannelId = channel.id;
                    await GuildConfig.set(interaction.guild.id, guildConfig);
                    
                    return interaction.reply({
                        content: `✅ Ticket logs channel has been set to ${channel.name}.`,
                        ephemeral: true
                    });
                }

                case 'addrole': {
                    const role = interaction.options.getRole('role');
                    
                    if (!guildConfig.ticketSystem.supportRoles) {
                        guildConfig.ticketSystem.supportRoles = [];
                    }
                    
                    if (guildConfig.ticketSystem.supportRoles.includes(role.id)) {
                        return interaction.reply({
                            content: `❌ ${role.name} is already a support role.`,
                            ephemeral: true
                        });
                    }
                    
                    guildConfig.ticketSystem.supportRoles.push(role.id);
                    await GuildConfig.set(interaction.guild.id, guildConfig);
                    
                    return interaction.reply({
                        content: `✅ Added ${role.name} as a support role.`,
                        ephemeral: true
                    });
                }

                case 'removerole': {
                    const role = interaction.options.getRole('role');
                    
                    if (!guildConfig.ticketSystem.supportRoles) {
                        guildConfig.ticketSystem.supportRoles = [];
                    }
                    
                    if (!guildConfig.ticketSystem.supportRoles.includes(role.id)) {
                        return interaction.reply({
                            content: `❌ ${role.name} is not a support role.`,
                            ephemeral: true
                        });
                    }
                    
                    guildConfig.ticketSystem.supportRoles = guildConfig.ticketSystem.supportRoles.filter(id => id !== role.id);
                    await GuildConfig.set(interaction.guild.id, guildConfig);
                    
                    return interaction.reply({
                        content: `✅ Removed ${role.name} from support roles.`,
                        ephemeral: true
                    });
                }

                case 'panel': {
                    const title = interaction.options.getString('title') || 'Support Tickets';
                    const description = interaction.options.getString('description') || 
                        'Click the button below to create a support ticket. Our team will assist you as soon as possible.';
                    
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(title)
                        .setDescription(description)
                        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() })
                        .setTimestamp();
                    
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('create_ticket')
                                .setLabel('Create Ticket')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('🎫')
                        );
                    
                    await interaction.channel.send({ embeds: [embed], components: [row] });
                    
                    return interaction.reply({
                        content: '✅ Ticket panel has been created.',
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error in ticket setup command:', error);
            return interaction.reply({
                content: '❌ An error occurred while setting up the ticket system.',
                ephemeral: true
            });
        }
    },

    async messageRun(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ You need Administrator permission to use this command.');
        }

        try {
            // Get guild config
            let guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            if (!guildConfig) {
                guildConfig = {
                    guildId: message.guild.id,
                    ticketSystem: {
                        enabled: true,
                        categoryId: null,
                        logsChannelId: null,
                        supportRoles: []
                    }
                };
            }

            if (!guildConfig.ticketSystem) {
                guildConfig.ticketSystem = {
                    enabled: true,
                    categoryId: null,
                    logsChannelId: null,
                    supportRoles: []
                };
            }

            if (!args.length) {
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Ticket System Configuration')
                    .addFields(
                        { name: 'Status', value: guildConfig.ticketSystem.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                        { name: 'Category', value: guildConfig.ticketSystem.categoryId ? `<#${guildConfig.ticketSystem.categoryId}>` : 'Not set', inline: true },
                        { name: 'Logs Channel', value: guildConfig.ticketSystem.logsChannelId ? `<#${guildConfig.ticketSystem.logsChannelId}>` : 'Not set', inline: true },
                        { name: 'Support Roles', value: guildConfig.ticketSystem.supportRoles?.length > 0 ? 
                            guildConfig.ticketSystem.supportRoles.map(id => `<@&${id}>`).join(', ') : 'None' }
                    )
                    .setDescription('Use `ticketsetup <option> <value>` to configure the ticket system.\nOptions: enable, category, logs, addrole, removerole, panel');
                
                return message.reply({ embeds: [embed] });
            }

            const subcommand = args[0].toLowerCase();

            switch (subcommand) {
                case 'enable': {
                    const enableArg = args[1]?.toLowerCase();
                    
                    if (!enableArg || (enableArg !== 'true' && enableArg !== 'false' && enableArg !== 'yes' && enableArg !== 'no')) {
                        return message.reply('❌ Please specify whether to enable or disable the ticket system (true/false).');
                    }
                    
                    const enabled = enableArg === 'true' || enableArg === 'yes';
                    guildConfig.ticketSystem.enabled = enabled;
                    await GuildConfig.set(message.guild.id, guildConfig);
                    
                    return message.reply(`✅ Ticket system has been ${enabled ? 'enabled' : 'disabled'}.`);
                }

                case 'category': {
                    const categoryId = args[1]?.match(/^<#(\d+)>$/) ? args[1].match(/^<#(\d+)>$/)[1] : args[1];
                    
                    if (!categoryId) {
                        return message.reply('❌ Please specify a category ID or mention.');
                    }
                    
                    try {
                        const category = await message.guild.channels.fetch(categoryId);
                        
                        if (!category || category.type !== 4) { // 4 is category channel type
                            return message.reply('❌ Invalid category channel.');
                        }
                        
                        guildConfig.ticketSystem.categoryId = category.id;
                        await GuildConfig.set(message.guild.id, guildConfig);
                        
                        return message.reply(`✅ Ticket category has been set to ${category.name}.`);
                    } catch (error) {
                        return message.reply('❌ Invalid category channel.');
                    }
                }

                case 'logs': {
                    const channelId = args[1]?.match(/^<#(\d+)>$/) ? args[1].match(/^<#(\d+)>$/)[1] : args[1];
                    
                    if (!channelId) {
                        return message.reply('❌ Please specify a channel ID or mention.');
                    }
                    
                    try {
                        const channel = await message.guild.channels.fetch(channelId);
                        
                        if (!channel || channel.type !== 0) { // 0 is text channel type
                            return message.reply('❌ Invalid text channel.');
                        }
                        
                        guildConfig.ticketSystem.logsChannelId = channel.id;
                        await GuildConfig.set(message.guild.id, guildConfig);
                        
                        return message.reply(`✅ Ticket logs channel has been set to ${channel.name}.`);
                    } catch (error) {
                        return message.reply('❌ Invalid text channel.');
                    }
                }

                case 'addrole': {
                    const roleId = args[1]?.match(/^<@&(\d+)>$/) ? args[1].match(/^<@&(\d+)>$/)[1] : args[1];
                    
                    if (!roleId) {
                        return message.reply('❌ Please specify a role ID or mention.');
                    }
                    
                    try {
                        const role = await message.guild.roles.fetch(roleId);
                        
                        if (!role) {
                            return message.reply('❌ Invalid role.');
                        }
                        
                        if (!guildConfig.ticketSystem.supportRoles) {
                            guildConfig.ticketSystem.supportRoles = [];
                        }
                        
                        if (guildConfig.ticketSystem.supportRoles.includes(role.id)) {
                            return message.reply(`❌ ${role.name} is already a support role.`);
                        }
                        
                        guildConfig.ticketSystem.supportRoles.push(role.id);
                        await GuildConfig.set(message.guild.id, guildConfig);
                        
                        return message.reply(`✅ Added ${role.name} as a support role.`);
                    } catch (error) {
                        return message.reply('❌ Invalid role.');
                    }
                }

                case 'removerole': {
                    const roleId = args[1]?.match(/^<@&(\d+)>$/) ? args[1].match(/^<@&(\d+)>$/)[1] : args[1];
                    
                    if (!roleId) {
                        return message.reply('❌ Please specify a role ID or mention.');
                    }
                    
                    try {
                        const role = await message.guild.roles.fetch(roleId);
                        
                        if (!role) {
                            return message.reply('❌ Invalid role.');
                        }
                        
                        if (!guildConfig.ticketSystem.supportRoles) {
                            guildConfig.ticketSystem.supportRoles = [];
                        }
                        
                        if (!guildConfig.ticketSystem.supportRoles.includes(role.id)) {
                            return message.reply(`❌ ${role.name} is not a support role.`);
                        }
                        
                        guildConfig.ticketSystem.supportRoles = guildConfig.ticketSystem.supportRoles.filter(id => id !== role.id);
                        await GuildConfig.set(message.guild.id, guildConfig);
                        
                        return message.reply(`✅ Removed ${role.name} from support roles.`);
                    } catch (error) {
                        return message.reply('❌ Invalid role.');
                    }
                }

                case 'panel': {
                    const title = args.length > 1 ? args.slice(1).join(' ') : 'Support Tickets';
                    const description = 'Click the button below to create a support ticket. Our team will assist you as soon as possible.';
                    
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(title)
                        .setDescription(description)
                        .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() })
                        .setTimestamp();
                    
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('create_ticket')
                                .setLabel('Create Ticket')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('🎫')
                        );
                    
                    await message.channel.send({ embeds: [embed], components: [row] });
                    
                    return message.reply('✅ Ticket panel has been created.');
                }

                default:
                    return message.reply('❌ Invalid subcommand. Use `ticketsetup` to see available options.');
            }
        } catch (error) {
            console.error('Error in ticket setup command:', error);
            return message.reply('❌ An error occurred while setting up the ticket system.');
        }
    }
}; 