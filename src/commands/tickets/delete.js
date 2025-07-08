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
        .setName('delete')
        .setDescription('Delete a ticket channel')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for deleting the ticket')
                .setRequired(false)),

    aliases: ['deleteticket', 'ticketdelete', 'removeticket'],

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

            // Check if user has permission to delete the ticket
            const member = interaction.member;
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return interaction.reply({
                    content: '❌ You do not have permission to delete this ticket.',
                    ephemeral: true
                });
            }

            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Update ticket status to deleted
            ticket.status = 'DELETED';
            ticket.deletedAt = new Date().toISOString();
            ticket.deletedBy = interaction.user.id;
            ticket.deleteReason = reason;
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Log ticket deletion if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        // Create delete log embed
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('Ticket Deleted')
                            .addFields(
                                { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Deleted By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                { name: 'Reason', value: reason },
                                { name: 'Creator', value: `${ticket.userTag} (${ticket.userId})`, inline: true },
                                { name: 'Created At', value: new Date(ticket.createdAt).toUTCString(), inline: true }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }

            // Send confirmation before deleting
            await interaction.reply({
                content: `🗑️ Ticket will be deleted in 5 seconds. Reason: ${reason}`,
                ephemeral: false
            });
            
            // Generate transcript before deletion if possible
            try {
                // Fetch messages from the channel
                let allMessages = [];
                let lastId;
                
                while (true) {
                    const options = { limit: 100 };
                    if (lastId) {
                        options.before = lastId;
                    }
                    
                    const messages = await interaction.channel.messages.fetch(options);
                    if (messages.size === 0) break;
                    
                    allMessages = [...allMessages, ...messages.values()];
                    lastId = messages.last().id;
                    
                    if (messages.size < 100) break;
                }

                // Sort messages by timestamp
                allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

                // Format transcript
                let transcript = `# Ticket Transcript (Auto-generated before deletion)\n\n`;
                transcript += `**Ticket ID:** ${ticket.ticketId}\n`;
                transcript += `**Created By:** ${ticket.userTag} (${ticket.userId})\n`;
                transcript += `**Created At:** ${new Date(ticket.createdAt).toUTCString()}\n`;
                transcript += `**Deleted At:** ${new Date().toUTCString()}\n`;
                transcript += `**Deleted By:** ${interaction.user.tag} (${interaction.user.id})\n`;
                transcript += `**Delete Reason:** ${reason}\n`;
                transcript += `\n## Messages\n\n`;

                // Add messages to transcript (max 500 for performance)
                const maxMessages = Math.min(allMessages.length, 500);
                for (let i = 0; i < maxMessages; i++) {
                    const message = allMessages[i];
                    const timestamp = new Date(message.createdTimestamp).toUTCString();
                    transcript += `**${message.author.tag}** (${timestamp}):\n`;
                    transcript += `${message.content || '*No text content*'}\n`;
                    
                    // Add attachments
                    if (message.attachments.size > 0) {
                        transcript += `**Attachments:**\n`;
                        message.attachments.forEach(attachment => {
                            transcript += `- ${attachment.url}\n`;
                        });
                    }
                    
                    transcript += `\n`;
                }

                // Save transcript
                const transcriptPath = path.join(__dirname, '../../data/transcripts');
                if (!fs.existsSync(transcriptPath)) {
                    fs.mkdirSync(transcriptPath, { recursive: true });
                }
                
                const transcriptFilename = `${ticket.ticketId}-${Date.now()}.txt`;
                fs.writeFileSync(path.join(transcriptPath, transcriptFilename), transcript);

                // Store in ticket object
                if (!ticket.transcript) ticket.transcript = [];
                ticket.transcript.push({
                    generatedBy: 'AUTO-DELETE',
                    generatedAt: new Date().toISOString(),
                    filename: transcriptFilename
                });
                
                fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                // Send transcript to logs
                if (guildConfig?.ticketSystem?.logsChannelId) {
                    try {
                        const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                        if (logsChannel) {
                            await logsChannel.send({
                                content: `📝 Auto-generated transcript for deleted ticket ${ticket.ticketId}:`,
                                files: [{
                                    attachment: path.join(transcriptPath, transcriptFilename),
                                    name: `transcript-${ticket.ticketId}.txt`
                                }]
                            });
                        }
                    } catch (error) {
                        console.error('Error sending transcript to logs:', error);
                    }
                }
            } catch (error) {
                console.error('Error generating transcript before deletion:', error);
            }

            // Wait 5 seconds, then delete the channel
            setTimeout(async () => {
                try {
                    await interaction.channel.delete(`Ticket deleted by ${interaction.user.tag}: ${reason}`);
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                }
            }, 5000);
        } catch (error) {
            console.error('Error deleting ticket:', error);
            await interaction.reply({
                content: '❌ An error occurred while deleting the ticket!',
                ephemeral: true
            });
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

            // Check if user has permission to delete the ticket
            const member = message.member;
            const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return message.reply('❌ You do not have permission to delete this ticket.');
            }

            const reason = args.join(' ') || 'No reason provided';
            
            // Update ticket status to deleted
            ticket.status = 'DELETED';
            ticket.deletedAt = new Date().toISOString();
            ticket.deletedBy = message.author.id;
            ticket.deleteReason = reason;
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Log ticket deletion if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        // Create delete log embed
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('Ticket Deleted')
                            .addFields(
                                { name: 'Ticket', value: `${message.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Deleted By', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                { name: 'Reason', value: reason },
                                { name: 'Creator', value: `${ticket.userTag} (${ticket.userId})`, inline: true },
                                { name: 'Created At', value: new Date(ticket.createdAt).toUTCString(), inline: true }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }

            // Send confirmation before deleting
            await message.channel.send(`🗑️ Ticket will be deleted in 5 seconds. Reason: ${reason}`);
            
            // Generate transcript before deletion if possible
            try {
                // Fetch messages from the channel
                let allMessages = [];
                let lastId;
                
                while (true) {
                    const options = { limit: 100 };
                    if (lastId) {
                        options.before = lastId;
                    }
                    
                    const messages = await message.channel.messages.fetch(options);
                    if (messages.size === 0) break;
                    
                    allMessages = [...allMessages, ...messages.values()];
                    lastId = messages.last().id;
                    
                    if (messages.size < 100) break;
                }

                // Sort messages by timestamp
                allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

                // Format transcript
                let transcript = `# Ticket Transcript (Auto-generated before deletion)\n\n`;
                transcript += `**Ticket ID:** ${ticket.ticketId}\n`;
                transcript += `**Created By:** ${ticket.userTag} (${ticket.userId})\n`;
                transcript += `**Created At:** ${new Date(ticket.createdAt).toUTCString()}\n`;
                transcript += `**Deleted At:** ${new Date().toUTCString()}\n`;
                transcript += `**Deleted By:** ${message.author.tag} (${message.author.id})\n`;
                transcript += `**Delete Reason:** ${reason}\n`;
                transcript += `\n## Messages\n\n`;

                // Add messages to transcript (max 500 for performance)
                const maxMessages = Math.min(allMessages.length, 500);
                for (let i = 0; i < maxMessages; i++) {
                    const msg = allMessages[i];
                    const timestamp = new Date(msg.createdTimestamp).toUTCString();
                    transcript += `**${msg.author.tag}** (${timestamp}):\n`;
                    transcript += `${msg.content || '*No text content*'}\n`;
                    
                    // Add attachments
                    if (msg.attachments.size > 0) {
                        transcript += `**Attachments:**\n`;
                        msg.attachments.forEach(attachment => {
                            transcript += `- ${attachment.url}\n`;
                        });
                    }
                    
                    transcript += `\n`;
                }

                // Save transcript
                const transcriptPath = path.join(__dirname, '../../data/transcripts');
                if (!fs.existsSync(transcriptPath)) {
                    fs.mkdirSync(transcriptPath, { recursive: true });
                }
                
                const transcriptFilename = `${ticket.ticketId}-${Date.now()}.txt`;
                fs.writeFileSync(path.join(transcriptPath, transcriptFilename), transcript);

                // Store in ticket object
                if (!ticket.transcript) ticket.transcript = [];
                ticket.transcript.push({
                    generatedBy: 'AUTO-DELETE',
                    generatedAt: new Date().toISOString(),
                    filename: transcriptFilename
                });
                
                fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                // Send transcript to logs
                if (guildConfig?.ticketSystem?.logsChannelId) {
                    try {
                        const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                        if (logsChannel) {
                            await logsChannel.send({
                                content: `📝 Auto-generated transcript for deleted ticket ${ticket.ticketId}:`,
                                files: [{
                                    attachment: path.join(transcriptPath, transcriptFilename),
                                    name: `transcript-${ticket.ticketId}.txt`
                                }]
                            });
                        }
                    } catch (error) {
                        console.error('Error sending transcript to logs:', error);
                    }
                }
            } catch (error) {
                console.error('Error generating transcript before deletion:', error);
            }

            // Wait 5 seconds, then delete the channel
            setTimeout(async () => {
                try {
                    await message.channel.delete(`Ticket deleted by ${message.author.tag}: ${reason}`);
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                }
            }, 5000);
        } catch (error) {
            console.error('Error deleting ticket:', error);
            await message.reply('❌ An error occurred while deleting the ticket!');
        }
    }
}; 