const { 
    PermissionFlagsBits, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { Ticket, GuildConfig } = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Create a new support ticket')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('The reason for creating this ticket')
                .setRequired(false)),

    aliases: ['createticket', 'newticket', 'support'],

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
                await GuildConfig.set(interaction.guild.id, guildConfig);
            }

            if (!guildConfig.ticketSystem) {
                guildConfig.ticketSystem = {
                    enabled: true,
                    categoryId: null,
                    logsChannelId: null,
                    supportRoles: []
                };
                await GuildConfig.set(interaction.guild.id, guildConfig);
            }

            if (!guildConfig.ticketSystem.enabled) {
                return interaction.reply({ 
                    content: '❌ The ticket system is currently disabled on this server.',
                    ephemeral: true
                });
            }

            // Check if user already has an open ticket
            const tickets = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../../data/tickets.json'), 'utf-8'));
            const userTickets = Object.values(tickets).filter(t => 
                t.guildId === interaction.guild.id && 
                t.userId === interaction.user.id && 
                t.status === 'OPEN'
            );

            if (userTickets.length > 0) {
                return interaction.reply({
                    content: `You already have an open ticket! <#${userTickets[0].channelId}>`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            // Generate ticket ID
            const ticketId = `ticket-${Date.now().toString(36)}`;
            const ticketNumber = Object.keys(tickets).length + 1;
            const channelName = `ticket-${ticketNumber}`;

            // Create ticket channel
            let categoryId = guildConfig.ticketSystem.categoryId;
            
            // If no category is set, create one
            if (!categoryId) {
                const category = await interaction.guild.channels.create({
                    name: '📝 Support Tickets',
                    type: 4, // Category channel
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        }
                    ]
                });
                categoryId = category.id;
                guildConfig.ticketSystem.categoryId = categoryId;
                await GuildConfig.set(interaction.guild.id, guildConfig);
            }

            // Create permission overwrites
            const permissionOverwrites = [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                }
            ];

            // Add support roles if they exist
            if (guildConfig.ticketSystem.supportRoles && guildConfig.ticketSystem.supportRoles.length > 0) {
                for (const roleId of guildConfig.ticketSystem.supportRoles) {
                    permissionOverwrites.push({
                        id: roleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.AttachFiles
                        ]
                    });
                }
            }

            const ticketChannel = await interaction.guild.channels.create({
                name: channelName,
                type: 0, // Text channel
                parent: categoryId,
                permissionOverwrites: permissionOverwrites
            });

            const reason = interaction.options.getString('reason') || 'No reason provided';

            // Create ticket in database
            const ticket = {
                ticketId: ticketId,
                guildId: interaction.guild.id,
                channelId: ticketChannel.id,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                reason: reason,
                status: 'OPEN',
                createdAt: new Date().toISOString(),
                transcript: []
            };

            tickets[ticketId] = ticket;
            require('fs').writeFileSync(
                require('path').join(__dirname, '../../data/tickets.json'), 
                JSON.stringify(tickets, null, 2)
            );

            // Create welcome embed
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Ticket #${ticketNumber}`)
                .setDescription(`Thank you for creating a ticket. Support staff will be with you shortly.`)
                .addFields(
                    { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: true },
                    { name: 'Ticket ID', value: ticketId, inline: true }
                )
                .setFooter({ text: 'Use the buttons below to manage this ticket' })
                .setTimestamp();

            // Create buttons
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_close')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒'),
                    new ButtonBuilder()
                        .setCustomId('ticket_claim')
                        .setLabel('Claim Ticket')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('👋'),
                    new ButtonBuilder()
                        .setCustomId('ticket_transcript')
                        .setLabel('Save Transcript')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📝')
                );

            // Send initial message in ticket channel
            await ticketChannel.send({
                content: `<@${interaction.user.id}> Welcome to your ticket!`,
                embeds: [welcomeEmbed],
                components: [buttons],
                allowedMentions: { users: [interaction.user.id] }
            });

            // Log ticket creation if logs channel exists
            if (guildConfig.ticketSystem.logsChannelId) {
                try {
                    const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('Ticket Created')
                            .addFields(
                                { name: 'Ticket', value: `#${ticketNumber} (${ticketId})`, inline: true },
                                { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                { name: 'Reason', value: reason }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }

            await interaction.editReply({
                content: `✅ Your ticket has been created: <#${ticketChannel.id}>`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error creating ticket:', error);
            if (interaction.deferred) {
                await interaction.editReply({ 
                    content: '❌ An error occurred while creating the ticket!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({ 
                    content: '❌ An error occurred while creating the ticket!',
                    ephemeral: true
                });
            }
        }
    },

    async messageRun(message, args) {
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
                await GuildConfig.set(message.guild.id, guildConfig);
            }

            if (!guildConfig.ticketSystem) {
                guildConfig.ticketSystem = {
                    enabled: true,
                    categoryId: null,
                    logsChannelId: null,
                    supportRoles: []
                };
                await GuildConfig.set(message.guild.id, guildConfig);
            }

            if (!guildConfig.ticketSystem.enabled) {
                return message.reply('❌ The ticket system is currently disabled on this server.');
            }

            // Check if user already has an open ticket
            const tickets = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../../data/tickets.json'), 'utf-8'));
            const userTickets = Object.values(tickets).filter(t => 
                t.guildId === message.guild.id && 
                t.userId === message.author.id && 
                t.status === 'OPEN'
            );

            if (userTickets.length > 0) {
                return message.reply(`You already have an open ticket! <#${userTickets[0].channelId}>`);
            }

            const reply = await message.reply('Creating your ticket...');

            // Generate ticket ID
            const ticketId = `ticket-${Date.now().toString(36)}`;
            const ticketNumber = Object.keys(tickets).length + 1;
            const channelName = `ticket-${ticketNumber}`;

            // Create ticket channel
            let categoryId = guildConfig.ticketSystem.categoryId;
            
            // If no category is set, create one
            if (!categoryId) {
                const category = await message.guild.channels.create({
                    name: '📝 Support Tickets',
                    type: 4, // Category channel
                    permissionOverwrites: [
                        {
                            id: message.guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        }
                    ]
                });
                categoryId = category.id;
                guildConfig.ticketSystem.categoryId = categoryId;
                await GuildConfig.set(message.guild.id, guildConfig);
            }

            // Create permission overwrites
            const permissionOverwrites = [
                {
                    id: message.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: message.author.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                }
            ];

            // Add support roles if they exist
            if (guildConfig.ticketSystem.supportRoles && guildConfig.ticketSystem.supportRoles.length > 0) {
                for (const roleId of guildConfig.ticketSystem.supportRoles) {
                    permissionOverwrites.push({
                        id: roleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.AttachFiles
                        ]
                    });
                }
            }

            const ticketChannel = await message.guild.channels.create({
                name: channelName,
                type: 0, // Text channel
                parent: categoryId,
                permissionOverwrites: permissionOverwrites
            });

            const reason = args.join(' ') || 'No reason provided';

            // Create ticket in database
            const ticket = {
                ticketId: ticketId,
                guildId: message.guild.id,
                channelId: ticketChannel.id,
                userId: message.author.id,
                userTag: message.author.tag,
                reason: reason,
                status: 'OPEN',
                createdAt: new Date().toISOString(),
                transcript: []
            };

            tickets[ticketId] = ticket;
            require('fs').writeFileSync(
                require('path').join(__dirname, '../../data/tickets.json'), 
                JSON.stringify(tickets, null, 2)
            );

            // Create welcome embed
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Ticket #${ticketNumber}`)
                .setDescription(`Thank you for creating a ticket. Support staff will be with you shortly.`)
                .addFields(
                    { name: 'User', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: true },
                    { name: 'Ticket ID', value: ticketId, inline: true }
                )
                .setFooter({ text: 'Use the buttons below to manage this ticket' })
                .setTimestamp();

            // Create buttons
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_close')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒'),
                    new ButtonBuilder()
                        .setCustomId('ticket_claim')
                        .setLabel('Claim Ticket')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('👋'),
                    new ButtonBuilder()
                        .setCustomId('ticket_transcript')
                        .setLabel('Save Transcript')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📝')
                );

            // Send initial message in ticket channel
            await ticketChannel.send({
                content: `<@${message.author.id}> Welcome to your ticket!`,
                embeds: [welcomeEmbed],
                components: [buttons],
                allowedMentions: { users: [message.author.id] }
            });

            // Log ticket creation if logs channel exists
            if (guildConfig.ticketSystem.logsChannelId) {
                try {
                    const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('Ticket Created')
                            .addFields(
                                { name: 'Ticket', value: `#${ticketNumber} (${ticketId})`, inline: true },
                                { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                { name: 'Reason', value: reason }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }

            await reply.edit(`✅ Your ticket has been created: <#${ticketChannel.id}>`);

        } catch (error) {
            console.error('Error creating ticket:', error);
            await message.reply('❌ An error occurred while creating the ticket!');
        }
    }
}; 