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
        .setName('claim')
        .setDescription('(Premium) Claims the ticket for support staff')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to claim the ticket for (defaults to you)')
                .setRequired(false)),

    aliases: ['claimticket', 'ticketclaim'],
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

            // Check if user has permission to claim tickets
            const member = interaction.member;
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return interaction.reply({
                    content: '❌ You do not have permission to claim tickets.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            // Check if ticket is already claimed
            if (ticket.claimedBy) {
                return interaction.editReply(`❌ This ticket is already claimed by <@${ticket.claimedBy}> (${ticket.claimedByTag}).`);
            }

            // Determine who's claiming the ticket
            const targetUser = interaction.options.getUser('user') || interaction.user;
            
            // If claiming for someone else, check if you have permission
            if (targetUser.id !== interaction.user.id && !isAdmin) {
                return interaction.editReply('❌ Only administrators can claim tickets on behalf of other users.');
            }
            
            // Check if target user is a valid support staff
            if (targetUser.id !== interaction.user.id) {
                const targetMember = await interaction.guild.members.fetch(targetUser.id);
                const isTargetSupport = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                    targetMember.roles.cache.has(roleId)
                );
                
                if (!isTargetSupport && !targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.editReply('❌ You can only claim tickets for support staff or administrators.');
                }
            }
            
            // Update ticket data with claim information
            ticket.claimedBy = targetUser.id;
            ticket.claimedByTag = targetUser.tag;
            ticket.claimedAt = new Date().toISOString();
            ticket.claimedByAction = interaction.user.id;
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Create claim embed
            const claimEmbed = new EmbedBuilder()
                .setColor('#9900FF')
                .setTitle('Ticket Claimed')
                .setDescription(`This ticket has been claimed by <@${targetUser.id}>.`)
                .addFields(
                    { name: 'Support Agent', value: targetUser.tag, inline: true },
                    { name: 'Claimed At', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [claimEmbed] });

            // Log ticket claim if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await interaction.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#9900FF')
                            .setTitle('Ticket Claimed')
                            .addFields(
                                { name: 'Ticket', value: `${interaction.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Support Agent', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                                { name: 'Action By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                { name: 'Creator', value: `<@${ticket.userId}>`, inline: true }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }
            
            // Update channel name to indicate claim
            try {
                const newName = `claimed-${interaction.channel.name.replace(/^(ticket|claimed)-/, '')}`;
                await interaction.channel.setName(newName);
            } catch (error) {
                console.error('Error renaming channel after claim:', error);
            }
            
            // Notify the channel
            await interaction.channel.send(`🔔 <@${ticket.userId}> Your ticket has been claimed by <@${targetUser.id}>. They will be assisting you with your issue.`);
        } catch (error) {
            console.error('Error claiming ticket:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while claiming the ticket!');
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while claiming the ticket!',
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

            // Check if user has permission to claim tickets
            const member = message.member;
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return message.reply('❌ You do not have permission to claim tickets.');
            }

            // Check if ticket is already claimed
            if (ticket.claimedBy) {
                return message.reply(`❌ This ticket is already claimed by <@${ticket.claimedBy}> (${ticket.claimedByTag}).`);
            }

            // Determine who's claiming the ticket
            let targetUser = message.author;
            
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
            
            // If claiming for someone else, check if you have permission
            if (targetUser.id !== message.author.id && !isAdmin) {
                return message.reply('❌ Only administrators can claim tickets on behalf of other users.');
            }
            
            // Check if target user is a valid support staff
            if (targetUser.id !== message.author.id) {
                const targetMember = await message.guild.members.fetch(targetUser.id);
                const isTargetSupport = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                    targetMember.roles.cache.has(roleId)
                );
                
                if (!isTargetSupport && !targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
                    return message.reply('❌ You can only claim tickets for support staff or administrators.');
                }
            }
            
            const reply = await message.reply(`Claiming ticket for ${targetUser.tag}...`);
            
            // Update ticket data with claim information
            ticket.claimedBy = targetUser.id;
            ticket.claimedByTag = targetUser.tag;
            ticket.claimedAt = new Date().toISOString();
            ticket.claimedByAction = message.author.id;
            
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));

            // Create claim embed
            const claimEmbed = new EmbedBuilder()
                .setColor('#9900FF')
                .setTitle('Ticket Claimed')
                .setDescription(`This ticket has been claimed by <@${targetUser.id}>.`)
                .addFields(
                    { name: 'Support Agent', value: targetUser.tag, inline: true },
                    { name: 'Claimed At', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ text: `Ticket ID: ${ticket.ticketId}` })
                .setTimestamp();

            await reply.edit({ content: null, embeds: [claimEmbed] });

            // Log ticket claim if logs channel exists
            if (guildConfig?.ticketSystem?.logsChannelId) {
                try {
                    const logsChannel = await message.guild.channels.fetch(guildConfig.ticketSystem.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#9900FF')
                            .setTitle('Ticket Claimed')
                            .addFields(
                                { name: 'Ticket', value: `${message.channel.name} (${ticket.ticketId})`, inline: true },
                                { name: 'Support Agent', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                                { name: 'Action By', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                { name: 'Creator', value: `<@${ticket.userId}>`, inline: true }
                            )
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending to logs channel:', error);
                }
            }
            
            // Update channel name to indicate claim
            try {
                const newName = `claimed-${message.channel.name.replace(/^(ticket|claimed)-/, '')}`;
                await message.channel.setName(newName);
            } catch (error) {
                console.error('Error renaming channel after claim:', error);
            }
            
            // Notify the channel
            await message.channel.send(`🔔 <@${ticket.userId}> Your ticket has been claimed by <@${targetUser.id}>. They will be assisting you with your issue.`);
        } catch (error) {
            console.error('Error claiming ticket:', error);
            await message.reply('❌ An error occurred while claiming the ticket!');
        }
    }
}; 