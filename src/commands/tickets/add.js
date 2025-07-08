const { 
    PermissionFlagsBits, 
    SlashCommandBuilder, 
    EmbedBuilder
} = require('discord.js');
const { GuildConfig } = require('../../utils/database');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('Add a user or role to the ticket')
        .addMentionableOption(option =>
            option.setName('target')
                .setDescription('The user or role to add to the ticket')
                .setRequired(true)),

    aliases: ['adduser', 'addrole', 'ticketadd'],

    async execute(interaction) {
        try {
            // Check if the channel is a ticket
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            
            const ticket = Object.values(tickets).find(t => 
                t.channelId === interaction.channel.id
            );

            if (!ticket) {
                return interaction.reply({
                    content: '❌ This command can only be used in a ticket channel.',
                    ephemeral: true
                });
            }

            // Check if user has permission to add users/roles to the ticket
            const member = interaction.member;
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isTicketCreator = ticket.userId === interaction.user.id;
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isTicketCreator && !isSupportRole && !isAdmin) {
                return interaction.reply({
                    content: '❌ You do not have permission to add users/roles to this ticket.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const target = interaction.options.getMentionable('target');
            const isUser = target.user !== undefined;
            const isRole = target.permissions !== undefined;
            
            // Add user/role to the ticket channel
            try {
                await interaction.channel.permissionOverwrites.edit(target, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });
                
                // Update ticket data
                if (!ticket.addedUsers) ticket.addedUsers = [];
                if (!ticket.addedRoles) ticket.addedRoles = [];
                
                const addAction = {
                    targetId: target.id,
                    targetType: isUser ? 'USER' : 'ROLE',
                    targetName: isUser ? target.user.tag : target.name,
                    addedBy: interaction.user.id,
                    addedAt: new Date().toISOString()
                };
                
                if (isUser) {
                    ticket.addedUsers.push(addAction);
                } else if (isRole) {
                    ticket.addedRoles.push(addAction);
                }
                
                fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                // Create add embed
                const addEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(`${isUser ? 'User' : 'Role'} Added to Ticket`)
                    .setDescription(`${isUser ? `<@${target.id}>` : `<@&${target.id}>`} has been added to this ticket.`)
                    .addFields(
                        { name: 'Added By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Target Type', value: isUser ? 'User' : 'Role', inline: true }
                    )
                    .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [addEmbed] });

                // Log action if logs channel exists
                if (guildConfig?.ticketSystem?.logsChannelId) {
                    try {
                        const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                        if (logsChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle(`Ticket ${isUser ? 'User' : 'Role'} Added`)
                                .addFields(
                                    { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                    { name: `${isUser ? 'User' : 'Role'} Added`, value: `${isUser ? `${target.user.tag} (${target.id})` : `${target.name} (${target.id})`}`, inline: true },
                                    { name: 'Added By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true }
                                )
                                .setTimestamp();
                            
                            await logsChannel.send({ embeds: [logEmbed] });
                        }
                    } catch (error) {
                        console.error('Error sending to logs channel:', error);
                    }
                }
                
                // Send notification to the channel
                if (isUser) {
                    await interaction.channel.send(`${target} has been added to this ticket by ${interaction.user}.`);
                } else {
                    await interaction.channel.send(`The role ${target.name} has been added to this ticket by ${interaction.user}.`);
                }
            } catch (error) {
                console.error('Error adding user/role to ticket:', error);
                await interaction.editReply('❌ An error occurred while adding the user/role to the ticket channel.');
            }
        } catch (error) {
            console.error('Error in add command:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while adding user/role to the ticket!');
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while adding user/role to the ticket!',
                    ephemeral: true
                });
            }
        }
    },

    async messageRun(message, args) {
        try {
            // Check if the channel is a ticket
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            
            const ticket = Object.values(tickets).find(t => 
                t.channelId === message.channel.id
            );

            if (!ticket) {
                return message.reply('❌ This command can only be used in a ticket channel.');
            }

            // Check if user has permission to add users/roles to the ticket
            const member = message.member;
            const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isTicketCreator = ticket.userId === message.author.id;
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isTicketCreator && !isSupportRole && !isAdmin) {
                return message.reply('❌ You do not have permission to add users/roles to this ticket.');
            }

            // Check if a target is provided
            if (args.length === 0) {
                return message.reply('❌ Please mention a user or role to add to the ticket.');
            }
            
            // Parse the target from mention
            const userMention = args[0].match(/^<@!?(\d+)>$/);
            const roleMention = args[0].match(/^<@&(\d+)>$/);
            
            if (!userMention && !roleMention) {
                return message.reply('❌ Please provide a valid user or role mention.');
            }
            
            const targetId = userMention ? userMention[1] : roleMention[1];
            const isUser = userMention !== null;
            
            // Get the target
            let target;
            
            try {
                if (isUser) {
                    target = await message.guild.members.fetch(targetId);
                } else {
                    target = await message.guild.roles.fetch(targetId);
                }
            } catch (error) {
                return message.reply('❌ Could not find the specified user or role.');
            }
            
            const reply = await message.reply(`Adding ${isUser ? target.user.tag : target.name} to the ticket...`);
            
            // Add user/role to the ticket channel
            try {
                await message.channel.permissionOverwrites.edit(target, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });
                
                // Update ticket data
                if (!ticket.addedUsers) ticket.addedUsers = [];
                if (!ticket.addedRoles) ticket.addedRoles = [];
                
                const addAction = {
                    targetId: target.id,
                    targetType: isUser ? 'USER' : 'ROLE',
                    targetName: isUser ? target.user.tag : target.name,
                    addedBy: message.author.id,
                    addedAt: new Date().toISOString()
                };
                
                if (isUser) {
                    ticket.addedUsers.push(addAction);
                } else {
                    ticket.addedRoles.push(addAction);
                }
                
                fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                // Create add embed
                const addEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(`${isUser ? 'User' : 'Role'} Added to Ticket`)
                    .setDescription(`${isUser ? `<@${target.id}>` : `<@&${target.id}>`} has been added to this ticket.`)
                    .addFields(
                        { name: 'Added By', value: `<@${message.author.id}>`, inline: true },
                        { name: 'Target Type', value: isUser ? 'User' : 'Role', inline: true }
                    )
                    .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                    .setTimestamp();

                await reply.edit({ content: null, embeds: [addEmbed] });

                // Log action if logs channel exists
                if (guildConfig?.ticketSystem?.logsChannelId) {
                    try {
                        const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                        if (logsChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle(`Ticket ${isUser ? 'User' : 'Role'} Added`)
                                .addFields(
                                    { name: 'Ticket', value: `${message.channel.name} (${ticket.ticketId})`, inline: true },
                                    { name: `${isUser ? 'User' : 'Role'} Added`, value: `${isUser ? `${target.user.tag} (${target.id})` : `${target.name} (${target.id})`}`, inline: true },
                                    { name: 'Added By', value: `${message.author.tag} (${message.author.id})`, inline: true }
                                )
                                .setTimestamp();
                            
                            await logsChannel.send({ embeds: [logEmbed] });
                        }
                    } catch (error) {
                        console.error('Error sending to logs channel:', error);
                    }
                }
                
                // Send notification to the channel
                if (isUser) {
                    await message.channel.send(`${target} has been added to this ticket by ${message.author}.`);
                } else {
                    await message.channel.send(`The role ${target.name} has been added to this ticket by ${message.author}.`);
                }
            } catch (error) {
                console.error('Error adding user/role to ticket:', error);
                await reply.edit('❌ An error occurred while adding the user/role to the ticket channel.');
            }
        } catch (error) {
            console.error('Error in add command:', error);
            await message.reply('❌ An error occurred while adding user/role to the ticket!');
        }
    }
}; 