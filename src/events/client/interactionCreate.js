const { Events, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { GuildConfig } = require('../../utils/database');
const antiRaid = require('../../systems/antiRaid');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        // Handle button interactions
        if (interaction.isButton()) {
            // Handle verification button
            if (interaction.customId === 'verification_button') {
                try {
                    // Get guild config
                    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
                    
                    // Check if user is already verified
                    const verificationRole = interaction.guild.roles.cache.find(r => r.name === 'Pending Verification');
                    if (!verificationRole || !interaction.member.roles.cache.has(verificationRole.id)) {
                        // Generate verification code
                        const verificationCode = await antiRaid.generateVerificationCodeForUser(interaction.member);
                        
                        if (!verificationCode) {
                            return await interaction.reply({ 
                                content: '✅ You do not need verification at this time.',
                                ephemeral: true
                            });
                        }
                        
                        // Create verification embed
                        const verificationEmbed = new EmbedBuilder()
                            .setColor('#FF9900')
                            .setTitle('Verification Required')
                            .setDescription(`Please use the verification code below to verify yourself:\n\n**Your unique verification code:**\n\`${verificationCode}\`\n\nUse this code with the /verify command or reply with "!verify ${verificationCode}" to gain access to the server.`)
                            .setFooter({ text: 'This code will expire in 30 minutes' });
                            
                        // Create verification modal
                        const modal = new ModalBuilder()
                            .setCustomId('verification_modal')
                            .setTitle('Server Verification');
                            
                        // Add text input for code
                        const codeInput = new TextInputBuilder()
                            .setCustomId('verification_code')
                            .setLabel('Enter your verification code')
                            .setPlaceholder('Type your verification code here')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMaxLength(10);
                            
                        // Add input to modal
                        const actionRow = new ActionRowBuilder().addComponents(codeInput);
                        modal.addComponents(actionRow);
                        
                        // Try to DM the user first with their code
                        try {
                            await interaction.user.send({ embeds: [verificationEmbed] });
                            await interaction.reply({ 
                                content: '✅ I\'ve sent you a DM with your verification code! Please check your messages.',
                                ephemeral: true
                            });
                            
                            // Show modal for verification
                            await interaction.showModal(modal);
                        } catch (error) {
                            // If DM fails, show the verification code in the ephemeral message
                            await interaction.reply({
                                embeds: [verificationEmbed],
                                ephemeral: true
                            });
                            
                            // Show modal for verification
                            await interaction.showModal(modal);
                        }
                    } else {
                        await interaction.reply({ 
                            content: '❓ You are already in the verification process. Please check your DMs for the verification code or use the /verify command.',
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('Error handling verification button:', error);
                    await interaction.reply({ 
                        content: '❌ An error occurred while processing verification. Please try again or contact a server administrator.',
                        ephemeral: true
                    });
                }
                return;
            }
            
            // Handle ticket buttons
            if (interaction.customId === 'create_ticket') {
                // Create a new ticket
                const ticketCommand = client.commands.get('ticket');
                if (ticketCommand) {
                    await ticketCommand.execute(interaction);
                }
                return;
            }
            
            if (interaction.customId === 'ticket_close') {
                // Close the ticket
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
                            content: '❌ This is not an open ticket channel.',
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
                    const isAdmin = member.permissions.has('Administrator');
                    
                    if (!isTicketCreator && !isSupportRole && !isAdmin) {
                        return interaction.reply({
                            content: '❌ You do not have permission to close this ticket.',
                            ephemeral: true
                        });
                    }

                    await interaction.deferReply();

                    const reason = 'Closed via button';
                    
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
                return;
            }
            
            if (interaction.customId === 'ticket_claim') {
                // Claim the ticket
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
                            content: '❌ This is not an open ticket channel.',
                            ephemeral: true
                        });
                    }

                    // Check if user has permission to claim the ticket
                    const member = interaction.member;
                    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
                    
                    const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                        member.roles.cache.has(roleId)
                    );
                    
                    const isAdmin = member.permissions.has('Administrator');
                    
                    if (!isSupportRole && !isAdmin) {
                        return interaction.reply({
                            content: '❌ You do not have permission to claim this ticket.',
                            ephemeral: true
                        });
                    }

                    // Check if ticket is already claimed
                    if (ticket.claimedBy) {
                        const claimedByUser = await interaction.client.users.fetch(ticket.claimedBy).catch(() => null);
                        return interaction.reply({
                            content: `❌ This ticket is already claimed by ${claimedByUser ? claimedByUser.tag : 'a staff member'}.`,
                            ephemeral: true
                        });
                    }

                    // Claim the ticket
                    ticket.claimedBy = interaction.user.id;
                    ticket.claimedAt = new Date().toISOString();
                    
                    fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                    // Create claim embed
                    const claimEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('Ticket Claimed')
                        .setDescription(`This ticket has been claimed by <@${interaction.user.id}>`)
                        .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                        .setTimestamp();

                    await interaction.reply({ embeds: [claimEmbed] });

                    // Log ticket claim if logs channel exists
                    if (guildConfig?.ticketSystem?.logsChannelId) {
                        try {
                            const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                            if (logsChannel) {
                                const logEmbed = new EmbedBuilder()
                                    .setColor('#00FF00')
                                    .setTitle('Ticket Claimed')
                                    .addFields(
                                        { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                        { name: 'Claimed By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true }
                                    )
                                    .setTimestamp();
                                
                                await logsChannel.send({ embeds: [logEmbed] });
                            }
                        } catch (error) {
                            console.error('Error sending to logs channel:', error);
                        }
                    }
                } catch (error) {
                    console.error('Error claiming ticket:', error);
                    await interaction.reply({
                        content: '❌ An error occurred while claiming the ticket.',
                        ephemeral: true
                    });
                }
                return;
            }
            
            if (interaction.customId === 'ticket_transcript') {
                // Generate transcript
                try {
                    // Check if the channel is a ticket
                    const ticketsPath = path.join(__dirname, '../../data/tickets.json');
                    const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
                    
                    const ticket = Object.values(tickets).find(t => 
                        t.channelId === interaction.channel.id
                    );
        
                    if (!ticket) {
                        return interaction.reply({
                            content: '❌ This is not a ticket channel.',
                            ephemeral: true
                        });
                    }

                    await interaction.deferReply();

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
                    let transcript = `# Ticket Transcript\n\n`;
                    transcript += `**Ticket ID:** ${ticket.ticketId}\n`;
                    transcript += `**Created By:** ${ticket.userTag} (${ticket.userId})\n`;
                    transcript += `**Created At:** ${new Date(ticket.createdAt).toUTCString()}\n`;
                    if (ticket.closedAt) {
                        transcript += `**Closed At:** ${new Date(ticket.closedAt).toUTCString()}\n`;
                        transcript += `**Closed By:** <@${ticket.closedBy}>\n`;
                        transcript += `**Close Reason:** ${ticket.closeReason || 'No reason provided'}\n`;
                    }
                    transcript += `\n## Messages\n\n`;

                    // Add messages to transcript
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

                    // Save transcript to ticket
                    ticket.transcript.push({
                        generatedBy: interaction.user.id,
                        generatedAt: new Date().toISOString(),
                        content: transcript
                    });
                    
                    fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                    // Create transcript file
                    const transcriptPath = path.join(__dirname, '../../data/transcripts');
                    if (!fs.existsSync(transcriptPath)) {
                        fs.mkdirSync(transcriptPath, { recursive: true });
                    }
                    
                    const transcriptFilename = `${ticket.ticketId}-${Date.now()}.txt`;
                    fs.writeFileSync(path.join(transcriptPath, transcriptFilename), transcript);

                    // Send transcript
                    await interaction.editReply({
                        content: '✅ Transcript generated successfully!',
                        files: [{
                            attachment: path.join(transcriptPath, transcriptFilename),
                            name: `transcript-${ticket.ticketId}.txt`
                        }]
                    });

                    // Log transcript generation if logs channel exists
                    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
                    if (guildConfig?.ticketSystem?.logsChannelId) {
                        try {
                            const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                            if (logsChannel) {
                                const logEmbed = new EmbedBuilder()
                                    .setColor('#0099ff')
                                    .setTitle('Ticket Transcript Generated')
                                    .addFields(
                                        { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
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
                return;
            }

            // Add handlers for ticket_close_confirm and ticket_close_deny buttons
            if (interaction.customId === 'ticket_close_confirm') {
                // Handle the ticket closure confirmation button
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
                            content: '❌ This is not an open ticket channel.',
                            ephemeral: true
                        });
                    }

                    // Check if the user is the ticket creator
                    if (ticket.userId !== interaction.user.id) {
                        return interaction.reply({
                            content: '❌ Only the ticket creator can confirm the closure.',
                            ephemeral: true
                        });
                    }

                    await interaction.deferReply();

                    // Get the guild config for logging
                    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });

                    // Update ticket status
                    ticket.status = 'CLOSED';
                    ticket.closedAt = new Date().toISOString();
                    ticket.closedBy = interaction.user.id;
                    ticket.closeReason = 'User confirmed close request';
                    ticket.userConfirmedClose = true;
                    
                    fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                    // Create close embed
                    const closeEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('Ticket Closed')
                        .setDescription(`This ticket has been closed by the creator and will be archived shortly.`)
                        .addFields(
                            { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                            { name: 'Reason', value: 'User confirmed close request', inline: true }
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
                                    .setTitle('Ticket Closed by User')
                                    .addFields(
                                        { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                        { name: 'Closed By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                        { name: 'Reason', value: 'User confirmed close request' }
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
                                await interaction.channel.delete('Ticket closed by user and auto-deleted after 24 hours');
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
                    console.error('Error handling ticket_close_confirm:', error);
                    if (interaction.deferred) {
                        await interaction.editReply('❌ An error occurred while closing the ticket!');
                    } else {
                        await interaction.reply({
                            content: '❌ An error occurred while closing the ticket!',
                            ephemeral: true
                        });
                    }
                }
            }

            if (interaction.customId === 'ticket_close_deny') {
                // Handle the ticket closure denial button
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
                            content: '❌ This is not an open ticket channel.',
                            ephemeral: true
                        });
                    }

                    // Check if the user is the ticket creator
                    if (ticket.userId !== interaction.user.id) {
                        return interaction.reply({
                            content: '❌ Only the ticket creator can deny the closure.',
                            ephemeral: true
                        });
                    }

                    await interaction.deferReply();

                    // Record the denial in the ticket data
                    if (!ticket.closeDenials) ticket.closeDenials = [];
                    
                    ticket.closeDenials.push({
                        deniedAt: new Date().toISOString(),
                        deniedBy: interaction.user.id
                    });
                    
                    fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

                    // Create denial embed
                    const denyEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('Ticket Remains Open')
                        .setDescription(`<@${interaction.user.id}> has indicated that their issue is not yet resolved.`)
                        .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                        .setTimestamp();

                    await interaction.editReply({ embeds: [denyEmbed] });

                    // Get the guild config for additional mentions
                    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });

                    // Notify any support staff who are involved with the ticket
                    if (ticket.claimedBy) {
                        await interaction.channel.send(`<@${ticket.claimedBy}> The user has indicated that their issue is not yet resolved.`);
                    } else if (guildConfig?.ticketSystem?.supportRoles && guildConfig.ticketSystem.supportRoles.length > 0) {
                        // If no staff claimed the ticket, ping the first support role
                        await interaction.channel.send(`<@&${guildConfig.ticketSystem.supportRoles[0]}> The user has indicated that their issue is not yet resolved.`);
                    }

                    // Log the denial if logs channel exists
                    if (guildConfig?.ticketSystem?.logsChannelId) {
                        try {
                            const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                            if (logsChannel) {
                                const logEmbed = new EmbedBuilder()
                                    .setColor('#00FF00')
                                    .setTitle('Ticket Close Request Denied')
                                    .addFields(
                                        { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                        { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                        { name: 'Message', value: 'User indicated their issue is not resolved' }
                                    )
                                    .setTimestamp();
                                
                                await logsChannel.send({ embeds: [logEmbed] });
                            }
                        } catch (error) {
                            console.error('Error sending to logs channel:', error);
                        }
                    }
                } catch (error) {
                    console.error('Error handling ticket_close_deny:', error);
                    if (interaction.deferred) {
                        await interaction.editReply('❌ An error occurred while processing your response!');
                    } else {
                        await interaction.reply({
                            content: '❌ An error occurred while processing your response!',
                            ephemeral: true
                        });
                    }
                }
            }
        }

        // Handle modal submissions
        if (interaction.isModalSubmit()) {
            // Handle verification modal
            if (interaction.customId === 'verification_modal') {
                const code = interaction.fields.getTextInputValue('verification_code');
                try {
                    const result = await antiRaid.verifyUser(interaction.member, code);

                    let embed = new EmbedBuilder()
                        .setTitle('Verification');

                    if (result.success) {
                        embed
                            .setColor('#00FF00')
                            .setDescription('✅ You have been successfully verified!')
                            .addFields({ name: 'Access Granted', value: 'You now have access to the server channels.' });
                    } else {
                        embed.setColor('#FF0000');
                        
                        // Handle different error types
                        switch (result.reason) {
                            case 'NO_VERIFICATION_NEEDED':
                                embed.setDescription('❌ You do not need verification at this time.');
                                break;
                                
                            case 'TOO_MANY_ATTEMPTS':
                                embed.setDescription('❌ Too many failed verification attempts.\nPlease contact a server administrator.');
                                break;
                                
                            case 'INVALID_CODE':
                            default:
                                embed.setDescription('❌ Invalid verification code. Please try again.');
                                break;
                        }
                    }

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } catch (error) {
                    console.error('Error in verification modal:', error);
                    await interaction.reply({ 
                        content: '❌ An error occurred while verifying. Please try again or contact a server administrator.',
                        ephemeral: true
                    });
                }
                return;
            }
        }

        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            // Only check for guild commands
            if (interaction.guild) {
                // Check if slash commands are enabled for this guild
                const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
                const slashEnabled = config?.rules?.slashEnabled !== false; // Default to true if not set
                
                // If slash commands are disabled, inform the user
                if (!slashEnabled) {
                    return interaction.reply({ 
                        content: '❌ Slash commands are currently disabled in this server. Please use prefix commands instead.',
                        ephemeral: true 
                    });
                }
            }

            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ 
                        content: 'There was an error while executing this command!',
                        ephemeral: true 
                    });
                } else {
                    await interaction.reply({ 
                        content: 'There was an error while executing this command!',
                        ephemeral: true 
                    });
                }
            }
        }
    },
}; 