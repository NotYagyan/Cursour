const { 
    PermissionFlagsBits, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { GuildConfig } = require('../../utils/database');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('closerequest')
        .setDescription('Sends a "Close Ask" message in the ticket channel')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Custom message to include with the close request')
                .setRequired(false)),

    aliases: ['ca', 'closeask', 'askclose'],

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

            // Check if user has permission to send close request
            const member = interaction.member;
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return interaction.reply({
                    content: '❌ You do not have permission to send close requests.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            // Get custom message if provided
            const customMessage = interaction.options.getString('message');
            
            // Create close request embed
            const closeRequestEmbed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('Ticket Close Request')
                .setDescription('The support team is requesting to close this ticket.')
                .addFields(
                    { name: 'Requested By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Ticket ID', value: ticket.ticketId, inline: true }
                )
                .setFooter({ text: 'Click the buttons below to indicate if your issue has been resolved.' })
                .setTimestamp();
            
            // Add custom message if provided
            if (customMessage) {
                closeRequestEmbed.addFields({ name: 'Message', value: customMessage });
            }

            // Create buttons
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_close_confirm')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId('ticket_close_deny')
                        .setLabel('Keep Open')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('❌')
                );

            // Log the close request
            if (!ticket.closeRequests) ticket.closeRequests = [];
            
            ticket.closeRequests.push({
                requestedBy: interaction.user.id,
                requestedByTag: interaction.user.tag,
                requestedAt: new Date().toISOString(),
                message: customMessage || null
            });
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Send the close request message
            await interaction.channel.send({
                content: `<@${ticket.userId}>, the support team is asking if your issue has been resolved.`,
                embeds: [closeRequestEmbed],
                components: [buttons]
            });
            
            await interaction.editReply('Close request sent successfully.');
            
            // Log ticket close request if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FFAA00')
                            .setTitle('Ticket Close Request Sent')
                            .addFields(
                                { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Requested By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                { name: 'User', value: `<@${ticket.userId}> (${ticket.userTag})`, inline: true }
                            )
                            .setTimestamp();
                        
                        if (customMessage) {
                            logEmbed.addFields({ name: 'Message', value: customMessage });
                        }
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }
        } catch (error) {
            console.error('Error sending close request:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while sending the close request!');
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while sending the close request!',
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

            // Check if user has permission to send close request
            const member = message.member;
            const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return message.reply('❌ You do not have permission to send close requests.');
            }

            // Get custom message if provided
            const customMessage = args.join(' ') || null;
            
            const reply = await message.reply('Sending close request...');
            
            // Create close request embed
            const closeRequestEmbed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('Ticket Close Request')
                .setDescription('The support team is requesting to close this ticket.')
                .addFields(
                    { name: 'Requested By', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Ticket ID', value: ticket.ticketId, inline: true }
                )
                .setFooter({ text: 'Click the buttons below to indicate if your issue has been resolved.' })
                .setTimestamp();
            
            // Add custom message if provided
            if (customMessage) {
                closeRequestEmbed.addFields({ name: 'Message', value: customMessage });
            }

            // Create buttons
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_close_confirm')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId('ticket_close_deny')
                        .setLabel('Keep Open')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('❌')
                );

            // Log the close request
            if (!ticket.closeRequests) ticket.closeRequests = [];
            
            ticket.closeRequests.push({
                requestedBy: message.author.id,
                requestedByTag: message.author.tag,
                requestedAt: new Date().toISOString(),
                message: customMessage
            });
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Send the close request message
            await message.channel.send({
                content: `<@${ticket.userId}>, the support team is asking if your issue has been resolved.`,
                embeds: [closeRequestEmbed],
                components: [buttons]
            });
            
            await reply.edit('Close request sent successfully.');
            
            // Log ticket close request if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FFAA00')
                            .setTitle('Ticket Close Request Sent')
                            .addFields(
                                { name: 'Ticket', value: `${message.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Requested By', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                { name: 'User', value: `<@${ticket.userId}> (${ticket.userTag})`, inline: true }
                            )
                            .setTimestamp();
                        
                        if (customMessage) {
                            logEmbed.addFields({ name: 'Message', value: customMessage });
                        }
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }
        } catch (error) {
            console.error('Error sending close request:', error);
            await message.reply('❌ An error occurred while sending the close request!');
        }
    }
}; 