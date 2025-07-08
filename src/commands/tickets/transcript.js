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
        .setName('transcript')
        .setDescription('Generate a transcript of a ticket')
        .addStringOption(option =>
            option.setName('ticket')
                .setDescription('The ticket ID to generate a transcript for (current channel if not specified)')
                .setRequired(false)),

    aliases: ['tickettranscript', 'getlog'],

    async execute(interaction) {
        try {
            await interaction.deferReply();

            // Get ticket ID or use current channel
            const ticketId = interaction.options.getString('ticket');
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            
            let ticket;
            
            if (ticketId) {
                // Find ticket by ID
                ticket = tickets[ticketId];
                
                if (!ticket) {
                    return interaction.editReply('❌ Ticket not found. Please provide a valid ticket ID.');
                }
            } else {
                // Use current channel
                ticket = Object.values(tickets).find(t => t.channelId === interaction.channel.id);
                
                if (!ticket) {
                    return interaction.editReply('❌ This is not a ticket channel. Please provide a ticket ID.');
                }
            }

            // Check permissions
            const member = interaction.member;
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isTicketCreator = ticket.userId === interaction.user.id;
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isTicketCreator && !isSupportRole && !isAdmin) {
                return interaction.editReply('❌ You do not have permission to generate a transcript for this ticket.');
            }

            // Try to fetch the channel
            let ticketChannel;
            try {
                ticketChannel = await interaction.guild.channels.fetch(ticket.channelId);
            } catch (error) {
                console.log(`Channel for ticket ${ticket.ticketId} no longer exists.`);
            }

            // Fetch messages if channel exists
            let allMessages = [];
            if (ticketChannel) {
                let lastId;
                
                while (true) {
                    const options = { limit: 100 };
                    if (lastId) {
                        options.before = lastId;
                    }
                    
                    const messages = await ticketChannel.messages.fetch(options);
                    if (messages.size === 0) break;
                    
                    allMessages = [...allMessages, ...messages.values()];
                    lastId = messages.last().id;
                    
                    if (messages.size < 100) break;
                }

                // Sort messages by timestamp
                allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
            }

            // Format transcript
            let transcript = `# Ticket Transcript\n\n`;
            transcript += `**Ticket ID:** ${ticket.ticketId}\n`;
            transcript += `**Created By:** ${ticket.userTag} (${ticket.userId})\n`;
            transcript += `**Created At:** ${new Date(ticket.createdAt).toUTCString()}\n`;
            transcript += `**Reason:** ${ticket.reason || 'No reason provided'}\n`;
            
            if (ticket.claimedBy) {
                const claimedByUser = await interaction.client.users.fetch(ticket.claimedBy).catch(() => null);
                transcript += `**Claimed By:** ${claimedByUser ? claimedByUser.tag : ticket.claimedBy}\n`;
                transcript += `**Claimed At:** ${new Date(ticket.claimedAt).toUTCString()}\n`;
            }
            
            if (ticket.closedAt) {
                transcript += `**Closed At:** ${new Date(ticket.closedAt).toUTCString()}\n`;
                const closedByUser = await interaction.client.users.fetch(ticket.closedBy).catch(() => null);
                transcript += `**Closed By:** ${closedByUser ? closedByUser.tag : ticket.closedBy}\n`;
                transcript += `**Close Reason:** ${ticket.closeReason || 'No reason provided'}\n`;
            }
            
            transcript += `**Status:** ${ticket.status}\n`;
            transcript += `\n## Messages\n\n`;

            // Add messages to transcript
            if (allMessages.length > 0) {
                for (const message of allMessages) {
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
                    
                    // Add embeds
                    if (message.embeds.length > 0) {
                        transcript += `**Embeds:** ${message.embeds.length}\n`;
                    }
                    
                    transcript += `\n`;
                }
            } else if (ticket.transcript && ticket.transcript.length > 0) {
                // Use saved transcript if available
                const latestTranscript = ticket.transcript[ticket.transcript.length - 1];
                transcript = latestTranscript.content;
            } else {
                transcript += `*No messages available*\n`;
            }

            // Save transcript
            const transcriptPath = path.join(__dirname, '../../data/transcripts');
            if (!fs.existsSync(transcriptPath)) {
                fs.mkdirSync(transcriptPath, { recursive: true });
            }
            
            const transcriptFilename = `${ticket.ticketId}-${Date.now()}.txt`;
            fs.writeFileSync(path.join(transcriptPath, transcriptFilename), transcript);

            // Save transcript to ticket
            if (!ticket.transcript) {
                ticket.transcript = [];
            }
            
            ticket.transcript.push({
                generatedBy: interaction.user.id,
                generatedAt: new Date().toISOString(),
                content: transcript
            });
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Ticket Transcript: ${ticket.ticketId}`)
                .setDescription(`Transcript generated for ticket ${ticket.ticketId}`)
                .addFields(
                    { name: 'Created By', value: ticket.userTag, inline: true },
                    { name: 'Status', value: ticket.status, inline: true }
                )
                .setFooter({ text: `Generated by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            // Send transcript
            await interaction.editReply({
                embeds: [embed],
                files: [{
                    attachment: path.join(transcriptPath, transcriptFilename),
                    name: `transcript-${ticket.ticketId}.txt`
                }]
            });

            // Log transcript generation if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle('Ticket Transcript Generated')
                            .addFields(
                                { name: 'Ticket', value: ticket.ticketId, inline: true },
                                { name: 'Generated By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ 
                            embeds: [logEmbed],
                            files: [{
                                attachment: path.join(transcriptPath, transcriptFilename),
                                name: `transcript-${ticket.ticketId}.txt`
                            }]
                        });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }
        } catch (error) {
            console.error('Error generating transcript:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while generating the transcript.');
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while generating the transcript.',
                    ephemeral: true
                });
            }
        }
    },

    async messageRun(message, args) {
        try {
            const reply = await message.reply('Generating transcript...');

            // Get ticket ID or use current channel
            const ticketId = args[0];
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            
            let ticket;
            
            if (ticketId) {
                // Find ticket by ID
                ticket = tickets[ticketId];
                
                if (!ticket) {
                    return reply.edit('❌ Ticket not found. Please provide a valid ticket ID.');
                }
            } else {
                // Use current channel
                ticket = Object.values(tickets).find(t => t.channelId === message.channel.id);
                
                if (!ticket) {
                    return reply.edit('❌ This is not a ticket channel. Please provide a ticket ID.');
                }
            }

            // Check permissions
            const member = message.member;
            const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isTicketCreator = ticket.userId === message.author.id;
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isTicketCreator && !isSupportRole && !isAdmin) {
                return reply.edit('❌ You do not have permission to generate a transcript for this ticket.');
            }

            // Try to fetch the channel
            let ticketChannel;
            try {
                ticketChannel = await message.guild.channels.fetch(ticket.channelId);
            } catch (error) {
                console.log(`Channel for ticket ${ticket.ticketId} no longer exists.`);
            }

            // Fetch messages if channel exists
            let allMessages = [];
            if (ticketChannel) {
                let lastId;
                
                while (true) {
                    const options = { limit: 100 };
                    if (lastId) {
                        options.before = lastId;
                    }
                    
                    const messages = await ticketChannel.messages.fetch(options);
                    if (messages.size === 0) break;
                    
                    allMessages = [...allMessages, ...messages.values()];
                    lastId = messages.last().id;
                    
                    if (messages.size < 100) break;
                }

                // Sort messages by timestamp
                allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
            }

            // Format transcript
            let transcript = `# Ticket Transcript\n\n`;
            transcript += `**Ticket ID:** ${ticket.ticketId}\n`;
            transcript += `**Created By:** ${ticket.userTag} (${ticket.userId})\n`;
            transcript += `**Created At:** ${new Date(ticket.createdAt).toUTCString()}\n`;
            transcript += `**Reason:** ${ticket.reason || 'No reason provided'}\n`;
            
            if (ticket.claimedBy) {
                const claimedByUser = await message.client.users.fetch(ticket.claimedBy).catch(() => null);
                transcript += `**Claimed By:** ${claimedByUser ? claimedByUser.tag : ticket.claimedBy}\n`;
                transcript += `**Claimed At:** ${new Date(ticket.claimedAt).toUTCString()}\n`;
            }
            
            if (ticket.closedAt) {
                transcript += `**Closed At:** ${new Date(ticket.closedAt).toUTCString()}\n`;
                const closedByUser = await message.client.users.fetch(ticket.closedBy).catch(() => null);
                transcript += `**Closed By:** ${closedByUser ? closedByUser.tag : ticket.closedBy}\n`;
                transcript += `**Close Reason:** ${ticket.closeReason || 'No reason provided'}\n`;
            }
            
            transcript += `**Status:** ${ticket.status}\n`;
            transcript += `\n## Messages\n\n`;

            // Add messages to transcript
            if (allMessages.length > 0) {
                for (const message of allMessages) {
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
                    
                    // Add embeds
                    if (message.embeds.length > 0) {
                        transcript += `**Embeds:** ${message.embeds.length}\n`;
                    }
                    
                    transcript += `\n`;
                }
            } else if (ticket.transcript && ticket.transcript.length > 0) {
                // Use saved transcript if available
                const latestTranscript = ticket.transcript[ticket.transcript.length - 1];
                transcript = latestTranscript.content;
            } else {
                transcript += `*No messages available*\n`;
            }

            // Save transcript
            const transcriptPath = path.join(__dirname, '../../data/transcripts');
            if (!fs.existsSync(transcriptPath)) {
                fs.mkdirSync(transcriptPath, { recursive: true });
            }
            
            const transcriptFilename = `${ticket.ticketId}-${Date.now()}.txt`;
            fs.writeFileSync(path.join(transcriptPath, transcriptFilename), transcript);

            // Save transcript to ticket
            if (!ticket.transcript) {
                ticket.transcript = [];
            }
            
            ticket.transcript.push({
                generatedBy: message.author.id,
                generatedAt: new Date().toISOString(),
                content: transcript
            });
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Ticket Transcript: ${ticket.ticketId}`)
                .setDescription(`Transcript generated for ticket ${ticket.ticketId}`)
                .addFields(
                    { name: 'Created By', value: ticket.userTag, inline: true },
                    { name: 'Status', value: ticket.status, inline: true }
                )
                .setFooter({ text: `Generated by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            // Send transcript
            await reply.edit({
                content: null,
                embeds: [embed],
                files: [{
                    attachment: path.join(transcriptPath, transcriptFilename),
                    name: `transcript-${ticket.ticketId}.txt`
                }]
            });

            // Log transcript generation if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle('Ticket Transcript Generated')
                            .addFields(
                                { name: 'Ticket', value: ticket.ticketId, inline: true },
                                { name: 'Generated By', value: `${message.author.tag} (${message.author.id})`, inline: true }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ 
                            embeds: [logEmbed],
                            files: [{
                                attachment: path.join(transcriptPath, transcriptFilename),
                                name: `transcript-${ticket.ticketId}.txt`
                            }]
                        });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }
        } catch (error) {
            console.error('Error generating transcript:', error);
            await message.reply('❌ An error occurred while generating the transcript.');
        }
    }
}; 