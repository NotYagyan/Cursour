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
        .setName('remove')
        .setDescription('Remove a user or role from the ticket')
        .addMentionableOption(option =>
            option.setName('target')
                .setDescription('The user or role to remove from the ticket')
                .setRequired(true)),

    aliases: ['removeuser', 'removerole', 'ticketremove'],

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

            // Check if user has permission to remove users/roles from the ticket
            const member = interaction.member;
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isTicketCreator = ticket.userId === interaction.user.id;
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isTicketCreator && !isSupportRole && !isAdmin) {
                return interaction.reply({
                    content: '❌ You do not have permission to remove users/roles from this ticket.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const target = interaction.options.getMentionable('target');
            const isUser = target.user !== undefined;
            const isRole = target.permissions !== undefined;
            
            // Prevent removing ticket creator
            if (isUser && target.id === ticket.userId) {
                return interaction.editReply('❌ You cannot remove the ticket creator from the ticket.');
            }
            
            // Prevent removing support roles
            if (isRole && guildConfig?.ticketSystem?.supportRoles?.includes(target.id)) {
                return interaction.editReply('❌ You cannot remove support roles from the ticket.');
            }
            
            // Remove user/role from the ticket channel
            try {
                await interaction.channel.permissionOverwrites.edit(target, {
                    ViewChannel: false
                });
                
                // Update ticket data
                if (!ticket.removedUsers) ticket.removedUsers = [];
                if (!ticket.removedRoles) ticket.removedRoles = [];
                
                const removeAction = {
                    targetId: target.id,
                    targetType: isUser ? 'USER' : 'ROLE',
                    targetName: isUser ? target.user.tag : target.name,
                    removedBy: interaction.user.id,
                    removedAt: new Date().toISOString()
                };
                
                if (isUser) {
                    ticket.removedUsers.push(removeAction);
                } else if (isRole) {
                    ticket.removedRoles.push(removeAction);
                }
                
                fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                // Create remove embed
                const removeEmbed = new EmbedBuilder()
                    .setColor('#FF9900')
                    .setTitle(`${isUser ? 'User' : 'Role'} Removed from Ticket`)
                    .setDescription(`${isUser ? `<@${target.id}>` : `<@&${target.id}>`} has been removed from this ticket.`)
                    .addFields(
                        { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Target Type', value: isUser ? 'User' : 'Role', inline: true }
                    )
                    .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [removeEmbed] });

                // Log action if logs channel exists
                if (guildConfig?.ticketSystem?.logsChannelId) {
                    try {
                        const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                        if (logsChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor('#FF9900')
                                .setTitle(`Ticket ${isUser ? 'User' : 'Role'} Removed`)
                                .addFields(
                                    { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                    { name: `${isUser ? 'User' : 'Role'} Removed`, value: `${isUser ? `${target.user.tag} (${target.id})` : `${target.name} (${target.id})`}`, inline: true },
                                    { name: 'Removed By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true }
                                )
                                .setTimestamp();
                            
                            await logsChannel.send({ embeds: [logEmbed] });
                        }
                    } catch (error) {
                        console.error('Error sending to logs channel:', error);
                    }
                }
            } catch (error) {
                console.error('Error removing user/role from ticket:', error);
                await interaction.editReply('❌ An error occurred while removing the user/role from the ticket channel.');
            }
        } catch (error) {
            console.error('Error in remove command:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while removing user/role from the ticket!');
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while removing user/role from the ticket!',
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

            // Check if user has permission to remove users/roles from the ticket
            const member = message.member;
            const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isTicketCreator = ticket.userId === message.author.id;
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isTicketCreator && !isSupportRole && !isAdmin) {
                return message.reply('❌ You do not have permission to remove users/roles from this ticket.');
            }

            // Check if a target is provided
            if (args.length === 0) {
                return message.reply('❌ Please mention a user or role to remove from the ticket.');
            }
            
            // Parse the target from mention
            const userMention = args[0].match(/^<@!?(\d+)>$/);
            const roleMention = args[0].match(/^<@&(\d+)>$/);
            
            if (!userMention && !roleMention) {
                return message.reply('❌ Please provide a valid user or role mention.');
            }
            
            const targetId = userMention ? userMention[1] : roleMention[1];
            const isUser = userMention !== null;
            
            // Prevent removing ticket creator
            if (isUser && targetId === ticket.userId) {
                return message.reply('❌ You cannot remove the ticket creator from the ticket.');
            }
            
            // Prevent removing support roles
            if (!isUser && guildConfig?.ticketSystem?.supportRoles?.includes(targetId)) {
                return message.reply('❌ You cannot remove support roles from the ticket.');
            }
            
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
            
            const reply = await message.reply(`Removing ${isUser ? target.user.tag : target.name} from the ticket...`);
            
            // Remove user/role from the ticket channel
            try {
                await message.channel.permissionOverwrites.edit(target, {
                    ViewChannel: false
                });
                
                // Update ticket data
                if (!ticket.removedUsers) ticket.removedUsers = [];
                if (!ticket.removedRoles) ticket.removedRoles = [];
                
                const removeAction = {
                    targetId: target.id,
                    targetType: isUser ? 'USER' : 'ROLE',
                    targetName: isUser ? target.user.tag : target.name,
                    removedBy: message.author.id,
                    removedAt: new Date().toISOString()
                };
                
                if (isUser) {
                    ticket.removedUsers.push(removeAction);
                } else {
                    ticket.removedRoles.push(removeAction);
                }
                
                fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                // Create remove embed
                const removeEmbed = new EmbedBuilder()
                    .setColor('#FF9900')
                    .setTitle(`${isUser ? 'User' : 'Role'} Removed from Ticket`)
                    .setDescription(`${isUser ? `<@${target.id}>` : `<@&${target.id}>`} has been removed from this ticket.`)
                    .addFields(
                        { name: 'Removed By', value: `<@${message.author.id}>`, inline: true },
                        { name: 'Target Type', value: isUser ? 'User' : 'Role', inline: true }
                    )
                    .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                    .setTimestamp();

                await reply.edit({ content: null, embeds: [removeEmbed] });

                // Log action if logs channel exists
                if (guildConfig?.ticketSystem?.logsChannelId) {
                    try {
                        const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                        if (logsChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor('#FF9900')
                                .setTitle(`Ticket ${isUser ? 'User' : 'Role'} Removed`)
                                .addFields(
                                    { name: 'Ticket', value: `${message.channel.name} (${ticket.ticketId})`, inline: true },
                                    { name: `${isUser ? 'User' : 'Role'} Removed`, value: `${isUser ? `${target.user.tag} (${target.id})` : `${target.name} (${target.id})`}`, inline: true },
                                    { name: 'Removed By', value: `${message.author.tag} (${message.author.id})`, inline: true }
                                )
                                .setTimestamp();
                            
                            await logsChannel.send({ embeds: [logEmbed] });
                        }
                    } catch (error) {
                        console.error('Error sending to logs channel:', error);
                    }
                }
            } catch (error) {
                console.error('Error removing user/role from ticket:', error);
                await reply.edit('❌ An error occurred while removing the user/role from the ticket channel.');
            }
        } catch (error) {
            console.error('Error in remove command:', error);
            await message.reply('❌ An error occurred while removing user/role from the ticket!');
        }
    }
};