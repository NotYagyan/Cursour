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
        .setName('open')
        .setDescription('Re-open a closed ticket')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for re-opening the ticket')
                .setRequired(false)),

    aliases: ['reopen', 'reopenticket', 'ticketopen'],

    async execute(interaction) {
        try {
            // Check if the channel is a closed ticket
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            
            const ticket = Object.values(tickets).find(t => 
                t.channelId === interaction.channel.id && 
                t.status === 'CLOSED'
            );

            if (!ticket) {
                return interaction.reply({
                    content: '❌ This command can only be used in a closed ticket channel.',
                    ephemeral: true
                });
            }

            // Check if user has permission to re-open the ticket
            const member = interaction.member;
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return interaction.reply({
                    content: '❌ You do not have permission to re-open this ticket.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Update ticket status
            ticket.status = 'OPEN';
            ticket.reopenedAt = new Date().toISOString();
            ticket.reopenedBy = interaction.user.id;
            ticket.reopenReason = reason;
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Create re-open embed
            const reopenEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Ticket Re-opened')
                .setDescription(`This ticket has been re-opened.`)
                .addFields(
                    { name: 'Re-opened By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: true }
                )
                .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [reopenEmbed] });

            // Log ticket re-opening if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('Ticket Re-opened')
                            .addFields(
                                { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Re-opened By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                { name: 'Reason', value: reason }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }

            // Restore access for the ticket creator and rename the channel
            try {
                await interaction.channel.permissionOverwrites.edit(ticket.userId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });
                
                // Rename the channel to remove closed- prefix
                const channelName = `ticket-${interaction.channel.name.replace('closed-', '')}`;
                await interaction.channel.setName(channelName);
                
                // Notify the ticket creator
                await interaction.channel.send(`<@${ticket.userId}> Your ticket has been re-opened.`);
            } catch (error) {
                console.error('Error restoring ticket channel:', error);
                await interaction.channel.send('⚠️ There was an issue restoring full access to this ticket. Some permissions may need to be fixed manually.');
            }
        } catch (error) {
            console.error('Error reopening ticket:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while reopening the ticket!');
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while reopening the ticket!',
                    ephemeral: true
                });
            }
        }
    },

    async messageRun(message, args) {
        try {
            // Check if the channel is a closed ticket
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            
            const ticket = Object.values(tickets).find(t => 
                t.channelId === message.channel.id && 
                t.status === 'CLOSED'
            );

            if (!ticket) {
                return message.reply('❌ This command can only be used in a closed ticket channel.');
            }

            // Check if user has permission to re-open the ticket
            const member = message.member;
            const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return message.reply('❌ You do not have permission to re-open this ticket.');
            }

            const reply = await message.reply('Re-opening ticket...');
            const reason = args.join(' ') || 'No reason provided';
            
            // Update ticket status
            ticket.status = 'OPEN';
            ticket.reopenedAt = new Date().toISOString();
            ticket.reopenedBy = message.author.id;
            ticket.reopenReason = reason;
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Create re-open embed
            const reopenEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Ticket Re-opened')
                .setDescription(`This ticket has been re-opened.`)
                .addFields(
                    { name: 'Re-opened By', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: true }
                )
                .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                .setTimestamp();

            await reply.edit({ content: null, embeds: [reopenEmbed] });

            // Log ticket re-opening if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('Ticket Re-opened')
                            .addFields(
                                { name: 'Ticket', value: `${message.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Re-opened By', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                { name: 'Reason', value: reason }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }

            // Restore access for the ticket creator and rename the channel
            try {
                await message.channel.permissionOverwrites.edit(ticket.userId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });
                
                // Rename the channel to remove closed- prefix
                const channelName = `ticket-${message.channel.name.replace('closed-', '')}`;
                await message.channel.setName(channelName);
                
                // Notify the ticket creator
                await message.channel.send(`<@${ticket.userId}> Your ticket has been re-opened.`);
            } catch (error) {
                console.error('Error restoring ticket channel:', error);
                await message.channel.send('⚠️ There was an issue restoring full access to this ticket. Some permissions may need to be fixed manually.');
            }
        } catch (error) {
            console.error('Error reopening ticket:', error);
            await message.reply('❌ An error occurred while reopening the ticket!');
        }
    }
}; 