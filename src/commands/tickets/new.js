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
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('new')
        .setDescription('Create a new ticket')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for creating the ticket')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to assign as the ticket owner (staff only)')
                .setRequired(false)),

    aliases: ['newticket', 'ticketnew', 'createticket'],

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

            // Get target user (optional)
            const targetUser = interaction.options.getUser('user');
            let ticketOwner = interaction.user;
            
            // If a target user is specified, check if the command issuer has permission to create tickets for others
            if (targetUser) {
                const member = interaction.member;
                const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                    member.roles.cache.has(roleId)
                );
                const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
                
                if (!isSupportRole && !isAdmin) {
                    return interaction.reply({
                        content: '❌ You do not have permission to create tickets for other users.',
                        ephemeral: true
                    });
                }
                
                ticketOwner = targetUser;
            }

            // Check if user already has an open ticket
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            const userTickets = Object.values(tickets).filter(t => 
                t.guildId === interaction.guild.id && 
                t.userId === ticketOwner.id && 
                t.status === 'OPEN'
            );

            if (userTickets.length > 0) {
                return interaction.reply({
                    content: `${ticketOwner.id === interaction.user.id ? 'You' : ticketOwner.tag} already ${ticketOwner.id === interaction.user.id ? 'have' : 'has'} an open ticket! <#${userTickets[0].channelId}>`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            // Generate ticket ID and determine ticket number
            const ticketId = `ticket-${Date.now().toString(36)}`;
            const ticketNumber = Object.keys(tickets).length + 1;
            const channelName = `ticket-${ticketNumber}`;

            // Create ticket channel
            let categoryId = guildConfig.ticketSystem.categoryId;
            
            // If no category is set, create one
            if (!categoryId) {
                const category = await interaction.guild.channels.create({
                    name: '📝 Support Tickets',
                    type: ChannelType.GuildCategory,
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
                    id: ticketOwner.id,
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
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites: permissionOverwrites
            });

            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Create welcome embed
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`Ticket #${ticketNumber}`)
                .setDescription(`Thank you for creating a ticket! Please describe your issue and wait for a staff member to assist you.`)
                .addFields(
                    { name: 'User', value: `<@${ticketOwner.id}>`, inline: true },
                    { name: 'Created By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setFooter({ text: `Ticket ID: ${ticketId}` })
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
                content: `<@${ticketOwner.id}> Welcome to your ticket!`,
                embeds: [welcomeEmbed],
                components: [buttons],
                allowedMentions: { users: [ticketOwner.id] }
            });

            // Save ticket in tickets.json
            const ticketData = {
                ticketId,
                guildId: interaction.guild.id,
                channelId: ticketChannel.id,
                userId: ticketOwner.id,
                userTag: ticketOwner.tag,
                createdBy: interaction.user.id,
                creatorTag: interaction.user.tag,
                createdAt: new Date().toISOString(),
                reason,
                status: 'OPEN'
            };

            tickets[ticketId] = ticketData;
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            await interaction.editReply({ content: `✅ Ticket created successfully! <#${ticketChannel.id}>` });

            // Send log message if logs channel is set
            if (guildConfig.ticketSystem.logsChannelId) {
                try {
                    const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#0099FF')
                            .setTitle('Ticket Created')
                            .addFields(
                                { name: 'Ticket', value: `<#${ticketChannel.id}> (#${ticketNumber})`, inline: true },
                                { name: 'User', value: `${ticketOwner.tag} (${ticketOwner.id})`, inline: true },
                                { name: 'Created By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                { name: 'Reason', value: reason }
                            )
                            .setFooter({ text: `Ticket ID: ${ticketId}` })
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }
        } catch (error) {
            console.error('Error creating ticket:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while creating the ticket!');
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

            // Parse arguments
            let reason = '';
            let targetUser = null;

            // Check for user mention at the end
            const userMentions = message.mentions.users;
            
            if (userMentions.size > 0) {
                // Get the last mentioned user
                const mentionedUsers = Array.from(userMentions.values());
                targetUser = mentionedUsers[0]; // Take the first mentioned user
                
                // Remove user mention from reason
                const mentionRegex = new RegExp(`<@!?${targetUser.id}>`, 'g');
                reason = args.join(' ').replace(mentionRegex, '').trim();
            } else {
                // No user mentioned, use all args as reason
                reason = args.join(' ');
            }

            // If reason is empty, set to default
            if (!reason) reason = 'No reason provided';

            let ticketOwner = message.author;
            
            // If a target user is specified, check if the command issuer has permission to create tickets for others
            if (targetUser && targetUser.id !== message.author.id) {
                const member = message.member;
                const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                    member.roles.cache.has(roleId)
                );
                const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
                
                if (!isSupportRole && !isAdmin) {
                    return message.reply('❌ You do not have permission to create tickets for other users.');
                }
                
                ticketOwner = targetUser;
            } else if (targetUser) {
                // If target user is the same as message author
                reason = args.join(' ');
            }

            // Check if user already has an open ticket
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            const userTickets = Object.values(tickets).filter(t => 
                t.guildId === message.guild.id && 
                t.userId === ticketOwner.id && 
                t.status === 'OPEN'
            );

            if (userTickets.length > 0) {
                return message.reply(`${ticketOwner.id === message.author.id ? 'You' : ticketOwner.tag} already ${ticketOwner.id === message.author.id ? 'have' : 'has'} an open ticket! <#${userTickets[0].channelId}>`);
            }

            const reply = await message.reply('Creating ticket...');

            // Generate ticket ID and determine ticket number
            const ticketId = `ticket-${Date.now().toString(36)}`;
            const ticketNumber = Object.keys(tickets).length + 1;
            const channelName = `ticket-${ticketNumber}`;

            // Create ticket channel
            let categoryId = guildConfig.ticketSystem.categoryId;
            
            // If no category is set, create one
            if (!categoryId) {
                const category = await message.guild.channels.create({
                    name: '📝 Support Tickets',
                    type: ChannelType.GuildCategory,
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
                    id: ticketOwner.id,
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
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites: permissionOverwrites
            });
            
            // Create welcome embed
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`Ticket #${ticketNumber}`)
                .setDescription(`Thank you for creating a ticket! Please describe your issue and wait for a staff member to assist you.`)
                .addFields(
                    { name: 'User', value: `<@${ticketOwner.id}>`, inline: true },
                    { name: 'Created By', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setFooter({ text: `Ticket ID: ${ticketId}` })
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
                content: `<@${ticketOwner.id}> Welcome to your ticket!`,
                embeds: [welcomeEmbed],
                components: [buttons],
                allowedMentions: { users: [ticketOwner.id] }
            });

            // Save ticket in tickets.json
            const ticketData = {
                ticketId,
                guildId: message.guild.id,
                channelId: ticketChannel.id,
                userId: ticketOwner.id,
                userTag: ticketOwner.tag,
                createdBy: message.author.id,
                creatorTag: message.author.tag,
                createdAt: new Date().toISOString(),
                reason,
                status: 'OPEN'
            };

            tickets[ticketId] = ticketData;
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            await reply.edit(`✅ Ticket created successfully! <#${ticketChannel.id}>`);

            // Send log message if logs channel is set
            if (guildConfig.ticketSystem.logsChannelId) {
                try {
                    const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#0099FF')
                            .setTitle('Ticket Created')
                            .addFields(
                                { name: 'Ticket', value: `<#${ticketChannel.id}> (#${ticketNumber})`, inline: true },
                                { name: 'User', value: `${ticketOwner.tag} (${ticketOwner.id})`, inline: true },
                                { name: 'Created By', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                { name: 'Reason', value: reason }
                            )
                            .setFooter({ text: `Ticket ID: ${ticketId}` })
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }
        } catch (error) {
            console.error('Error creating ticket:', error);
            await message.reply('❌ An error occurred while creating the ticket!');
        }
    }
}; 