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
        .setName('unclaim')
        .setDescription('(Premium) Unclaims a claimed ticket')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose claim to remove (defaults to any claim)')
                .setRequired(false)),

    aliases: ['unclaimticket', 'ticketunclaim'],
    premium: true,

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

            // Check if this is a premium guild
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            
            if (!guildConfig?.premium) {
                return interaction.reply({
                    content: '❌ This command is only available for premium servers. Upgrade to premium to use this feature!',
                    ephemeral: true
                });
            }

            // Check if ticket is claimed
            if (!ticket.claimedBy) {
                return interaction.reply({
                    content: '❌ This ticket is not claimed by anyone.',
                    ephemeral: true
                });
            }

            // Check if user has permission to unclaim tickets
            const member = interaction.member;
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            const isClaimant = ticket.claimedBy === interaction.user.id;
            
            if (!isSupportRole && !isAdmin && !isClaimant) {
                return interaction.reply({
                    content: '❌ You do not have permission to unclaim tickets.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            // Check if a specific user's claim is being removed
            const targetUser = interaction.options.getUser('user');
            
            if (targetUser && targetUser.id !== ticket.claimedBy) {
                return interaction.editReply(`❌ This ticket is not claimed by ${targetUser.tag}. It is claimed by <@${ticket.claimedBy}>.`);
            }

            // If not admin or the claimant, check permissions
            if (!isAdmin && !isClaimant) {
                return interaction.editReply('❌ Only administrators or the person who claimed the ticket can unclaim it.');
            }
            
            // Store the old claim information for the logs
            const oldClaim = {
                userId: ticket.claimedBy,
                userTag: ticket.claimedByTag,
                claimedAt: ticket.claimedAt
            };
            
            // Update ticket data to remove claim
            delete ticket.claimedBy;
            delete ticket.claimedByTag;
            delete ticket.claimedAt;
            
            // Add unclaim info
            ticket.unclaimedAt = new Date().toISOString();
            ticket.unclaimedBy = interaction.user.id;
            ticket.unclaimedByTag = interaction.user.tag;
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Create unclaim embed
            const unclaimEmbed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setTitle('Ticket Unclaimed')
                .setDescription(`This ticket has been unclaimed by <@${interaction.user.id}>.`)
                .addFields(
                    { name: 'Previous Support Agent', value: `<@${oldClaim.userId}> (${oldClaim.userTag})`, inline: true },
                    { name: 'Unclaimed At', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [unclaimEmbed] });

            // Log ticket unclaim if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#00FFFF')
                            .setTitle('Ticket Unclaimed')
                            .addFields(
                                { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Previous Support Agent', value: `${oldClaim.userTag} (${oldClaim.userId})`, inline: true },
                                { name: 'Unclaimed By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                { name: 'Creator', value: `<@${ticket.userId}>`, inline: true }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }
            
            // Update channel name to remove claimed status
            try {
                const newName = `ticket-${interaction.channel.name.replace(/^(ticket|claimed)-/, '')}`;
                await interaction.channel.setName(newName);
            } catch (error) {
                console.error('Error renaming channel after unclaim:', error);
            }
            
            // Notify the channel
            await interaction.channel.send(`🔔 <@${ticket.userId}> This ticket is no longer claimed by a specific support agent. Another agent will assist you soon.`);
        } catch (error) {
            console.error('Error unclaiming ticket:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while unclaiming the ticket!');
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while unclaiming the ticket!',
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

            // Check if this is a premium guild
            const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            
            if (!guildConfig?.premium) {
                return message.reply('❌ This command is only available for premium servers. Upgrade to premium to use this feature!');
            }

            // Check if ticket is claimed
            if (!ticket.claimedBy) {
                return message.reply('❌ This ticket is not claimed by anyone.');
            }

            // Check if user has permission to unclaim tickets
            const member = message.member;
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            const isClaimant = ticket.claimedBy === message.author.id;
            
            if (!isSupportRole && !isAdmin && !isClaimant) {
                return message.reply('❌ You do not have permission to unclaim tickets.');
            }

            // Check if a specific user's claim is being removed
            let targetUser = null;
            
            if (args.length > 0) {
                // Check for user mention
                const userMention = args[0].match(/^<@!?(\d+)>$/);
                if (userMention) {
                    try {
                        targetUser = await message.client.users.fetch(userMention[1]);
                    } catch (error) {
                        return message.reply('❌ Could not find the specified user.');
                    }
                }
            }
            
            if (targetUser && targetUser.id !== ticket.claimedBy) {
                return message.reply(`❌ This ticket is not claimed by ${targetUser.tag}. It is claimed by <@${ticket.claimedBy}>.`);
            }

            // If not admin or the claimant, check permissions
            if (!isAdmin && !isClaimant) {
                return message.reply('❌ Only administrators or the person who claimed the ticket can unclaim it.');
            }
            
            const reply = await message.reply('Unclaiming ticket...');
            
            // Store the old claim information for the logs
            const oldClaim = {
                userId: ticket.claimedBy,
                userTag: ticket.claimedByTag,
                claimedAt: ticket.claimedAt
            };
            
            // Update ticket data to remove claim
            delete ticket.claimedBy;
            delete ticket.claimedByTag;
            delete ticket.claimedAt;
            
            // Add unclaim info
            ticket.unclaimedAt = new Date().toISOString();
            ticket.unclaimedBy = message.author.id;
            ticket.unclaimedByTag = message.author.tag;
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Create unclaim embed
            const unclaimEmbed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setTitle('Ticket Unclaimed')
                .setDescription(`This ticket has been unclaimed by <@${message.author.id}>.`)
                .addFields(
                    { name: 'Previous Support Agent', value: `<@${oldClaim.userId}> (${oldClaim.userTag})`, inline: true },
                    { name: 'Unclaimed At', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                .setTimestamp();

            await reply.edit({ content: null, embeds: [unclaimEmbed] });

            // Log ticket unclaim if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#00FFFF')
                            .setTitle('Ticket Unclaimed')
                            .addFields(
                                { name: 'Ticket', value: `${message.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Previous Support Agent', value: `${oldClaim.userTag} (${oldClaim.userId})`, inline: true },
                                { name: 'Unclaimed By', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                { name: 'Creator', value: `<@${ticket.userId}>`, inline: true }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }
            
            // Update channel name to remove claimed status
            try {
                const newName = `ticket-${message.channel.name.replace(/^(ticket|claimed)-/, '')}`;
                await message.channel.setName(newName);
            } catch (error) {
                console.error('Error renaming channel after unclaim:', error);
            }
            
            // Notify the channel
            await message.channel.send(`🔔 <@${ticket.userId}> This ticket is no longer claimed by a specific support agent. Another agent will assist you soon.`);
        } catch (error) {
            console.error('Error unclaiming ticket:', error);
            await message.reply('❌ An error occurred while unclaiming the ticket!');
        }
    }
}; 