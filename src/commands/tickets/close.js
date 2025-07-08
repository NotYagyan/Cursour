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
        .setName('close')
        .setDescription('Close a ticket')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for closing the ticket')
                .setRequired(false)),

    aliases: ['closeticket', 'ticketclose'],

    async execute(interaction) {
        try {
            // Check if the channel is a ticket
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            
            const ticket = Object.values(tickets).find(t => 
                t.channelId === interaction.channel.id && 
                t.status === 'OPEN'
            );

            if (!ticket) {
                return interaction.reply({
                    content: '❌ This command can only be used in an open ticket channel.',
                    ephemeral: true
                });
            }

            // Check if user has permission to close the ticket
            const member = interaction.member;
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isTicketCreator = ticket.userId === interaction.user.id;
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isTicketCreator && !isSupportRole && !isAdmin) {
                return interaction.reply({
                    content: '❌ You do not have permission to close this ticket.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Update ticket status
            ticket.status = 'CLOSED';
            ticket.closedAt = new Date().toISOString();
            ticket.closedBy = interaction.user.id;
            ticket.closeReason = reason;
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Create close embed
            const closeEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Ticket Closed')
                .setDescription(`This ticket has been closed and will be archived shortly.`)
                .addFields(
                    { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: true }
                )
                .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [closeEmbed] });

            // Log ticket closure if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('Ticket Closed')
                            .addFields(
                                { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Closed By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                { name: 'Reason', value: reason }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }

            // Archive the channel (remove access for the ticket creator)
            try {
                await interaction.channel.permissionOverwrites.edit(ticket.userId, {
                    ViewChannel: false
                });
                
                // Rename the channel to indicate it's closed
                await interaction.channel.setName(`closed-${interaction.channel.name.replace('ticket-', '')}`);
                
                // Send a follow-up message that the channel will be deleted in 24 hours
                setTimeout(async () => {
                    try {
                        await interaction.channel.delete('Ticket closed and auto-deleted after 24 hours');
                    } catch (error) {
                        console.error('Error deleting ticket channel:', error);
                    }
                }, 24 * 60 * 60 * 1000); // 24 hours
                
                await interaction.channel.send('This channel will be automatically deleted in 24 hours.');
            } catch (error) {
                console.error('Error archiving ticket channel:', error);
                await interaction.channel.send('❌ Failed to archive the ticket channel. Please archive it manually.');
            }
        } catch (error) {
            console.error('Error closing ticket:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while closing the ticket!');
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while closing the ticket!',
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
                t.channelId === message.channel.id && 
                t.status === 'OPEN'
            );

            if (!ticket) {
                return message.reply('❌ This command can only be used in an open ticket channel.');
            }

            // Check if user has permission to close the ticket
            const member = message.member;
            const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isTicketCreator = ticket.userId === message.author.id;
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isTicketCreator && !isSupportRole && !isAdmin) {
                return message.reply('❌ You do not have permission to close this ticket.');
            }

            const reply = await message.reply('Closing ticket...');
            const reason = args.join(' ') || 'No reason provided';
            
            // Update ticket status
            ticket.status = 'CLOSED';
            ticket.closedAt = new Date().toISOString();
            ticket.closedBy = message.author.id;
            ticket.closeReason = reason;
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Create close embed
            const closeEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Ticket Closed')
                .setDescription(`This ticket has been closed and will be archived shortly.`)
                .addFields(
                    { name: 'Closed By', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: true }
                )
                .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                .setTimestamp();

            await reply.edit({ content: null, embeds: [closeEmbed] });

            // Log ticket closure if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('Ticket Closed')
                            .addFields(
                                { name: 'Ticket', value: `${message.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Closed By', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                { name: 'Reason', value: reason }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }

            // Archive the channel (remove access for the ticket creator)
            try {
                await message.channel.permissionOverwrites.edit(ticket.userId, {
                    ViewChannel: false
                });
                
                // Rename the channel to indicate it's closed
                await message.channel.setName(`closed-${message.channel.name.replace('ticket-', '')}`);
                
                // Send a follow-up message that the channel will be deleted in 24 hours
                setTimeout(async () => {
                    try {
                        await message.channel.delete('Ticket closed and auto-deleted after 24 hours');
                    } catch (error) {
                        console.error('Error deleting ticket channel:', error);
                    }
                }, 24 * 60 * 60 * 1000); // 24 hours
                
                await message.channel.send('This channel will be automatically deleted in 24 hours.');
            } catch (error) {
                console.error('Error archiving ticket channel:', error);
                await message.channel.send('❌ Failed to archive the ticket channel. Please archive it manually.');
            }
        } catch (error) {
            console.error('Error closing ticket:', error);
            await message.reply('❌ An error occurred while closing the ticket!');
        }
    }
}; 