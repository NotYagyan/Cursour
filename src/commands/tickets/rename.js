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
        .setName('rename')
        .setDescription('Rename a ticket channel')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('New name for the ticket channel (without ticket- prefix)')
                .setRequired(true)),

    aliases: ['renameticket', 'ticketrename'],

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

            // Check if user has permission to rename the ticket
            const member = interaction.member;
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return interaction.reply({
                    content: '❌ You do not have permission to rename this ticket.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            // Get the new name and sanitize it
            let newName = interaction.options.getString('name');
            
            // Remove spaces and special characters
            newName = newName.replace(/[^\w-]/g, '-').toLowerCase();
            
            // Add ticket- prefix if it doesn't exist
            if (!newName.startsWith('ticket-')) {
                // Check if the ticket is closed
                if (interaction.channel.name.startsWith('closed-')) {
                    newName = `closed-${newName}`;
                } else {
                    newName = `ticket-${newName}`;
                }
            }
            
            const oldName = interaction.channel.name;

            // Rename the channel
            try {
                await interaction.channel.setName(newName, 'Renamed by ' + interaction.user.tag);
                
                // Update ticket data
                ticket.renamedAt = new Date().toISOString();
                ticket.renamedBy = interaction.user.id;
                ticket.oldName = oldName;
                ticket.newName = newName;
                
                fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                // Create rename embed
                const renameEmbed = new EmbedBuilder()
                    .setColor('#00FFFF')
                    .setTitle('Ticket Renamed')
                    .addFields(
                        { name: 'Old Name', value: oldName, inline: true },
                        { name: 'New Name', value: newName, inline: true },
                        { name: 'Renamed By', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [renameEmbed] });

                // Log ticket rename if logs channel exists
                if (guildConfig?.ticketSystem?.logsChannelId) {
                    try {
                        const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                        if (logsChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor('#00FFFF')
                                .setTitle('Ticket Renamed')
                                .addFields(
                                    { name: 'Ticket ID', value: ticket.ticketId, inline: true },
                                    { name: 'Old Name', value: oldName, inline: true },
                                    { name: 'New Name', value: newName, inline: true },
                                    { name: 'Renamed By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true }
                                )
                                .setTimestamp();
                            
                            await logsChannel.send({ embeds: [logEmbed] });
                        }
                    } catch (error) {
                        console.error('Error sending to logs channel:', error);
                    }
                }
            } catch (error) {
                console.error('Error renaming ticket channel:', error);
                await interaction.editReply('❌ An error occurred while renaming the ticket channel.');
            }
        } catch (error) {
            console.error('Error in rename command:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while renaming the ticket!');
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while renaming the ticket!',
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

            // Check if user has permission to rename the ticket
            const member = message.member;
            const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return message.reply('❌ You do not have permission to rename this ticket.');
            }

            // Get the new name and sanitize it
            if (args.length === 0) {
                return message.reply('❌ Please provide a new name for the ticket.');
            }

            let newName = args.join('-');
            
            // Remove spaces and special characters
            newName = newName.replace(/[^\w-]/g, '-').toLowerCase();
            
            // Add ticket- prefix if it doesn't exist
            if (!newName.startsWith('ticket-')) {
                // Check if the ticket is closed
                if (message.channel.name.startsWith('closed-')) {
                    newName = `closed-${newName}`;
                } else {
                    newName = `ticket-${newName}`;
                }
            }
            
            const oldName = message.channel.name;
            const reply = await message.reply(`Renaming ticket from "${oldName}" to "${newName}"...`);

            // Rename the channel
            try {
                await message.channel.setName(newName, 'Renamed by ' + message.author.tag);
                
                // Update ticket data
                ticket.renamedAt = new Date().toISOString();
                ticket.renamedBy = message.author.id;
                ticket.oldName = oldName;
                ticket.newName = newName;
                
                fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                // Create rename embed
                const renameEmbed = new EmbedBuilder()
                    .setColor('#00FFFF')
                    .setTitle('Ticket Renamed')
                    .addFields(
                        { name: 'Old Name', value: oldName, inline: true },
                        { name: 'New Name', value: newName, inline: true },
                        { name: 'Renamed By', value: `<@${message.author.id}>`, inline: true }
                    )
                    .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                    .setTimestamp();

                await reply.edit({ content: null, embeds: [renameEmbed] });

                // Log ticket rename if logs channel exists
                if (guildConfig?.ticketSystem?.logsChannelId) {
                    try {
                        const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                        if (logsChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor('#00FFFF')
                                .setTitle('Ticket Renamed')
                                .addFields(
                                    { name: 'Ticket ID', value: ticket.ticketId, inline: true },
                                    { name: 'Old Name', value: oldName, inline: true },
                                    { name: 'New Name', value: newName, inline: true },
                                    { name: 'Renamed By', value: `${message.author.tag} (${message.author.id})`, inline: true }
                                )
                                .setTimestamp();
                            
                            await logsChannel.send({ embeds: [logEmbed] });
                        }
                    } catch (error) {
                        console.error('Error sending to logs channel:', error);
                    }
                }
            } catch (error) {
                console.error('Error renaming ticket channel:', error);
                await reply.edit('❌ An error occurred while renaming the ticket channel.');
            }
        } catch (error) {
            console.error('Error in rename command:', error);
            await message.reply('❌ An error occurred while renaming the ticket!');
        }
    }
}; 