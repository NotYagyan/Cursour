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
        .setName('tickets')
        .setDescription('List all tickets')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Filter tickets by status')
                .setRequired(false)
                .addChoices(
                    { name: 'Open', value: 'OPEN' },
                    { name: 'Closed', value: 'CLOSED' },
                    { name: 'All', value: 'ALL' }
                ))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Filter tickets by user')
                .setRequired(false)),

    aliases: ['listtickets', 'ticketlist'],

    async execute(interaction) {
        try {
            // Check if user has permission to list tickets
            const member = interaction.member;
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return interaction.reply({
                    content: '❌ You do not have permission to list tickets.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            // Get tickets
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            
            // Apply filters
            const status = interaction.options.getString('status') || 'OPEN';
            const user = interaction.options.getUser('user');
            
            let filteredTickets = Object.values(tickets).filter(ticket => 
                ticket.guildId === interaction.guild.id
            );
            
            if (status !== 'ALL') {
                filteredTickets = filteredTickets.filter(ticket => ticket.status === status);
            }
            
            if (user) {
                filteredTickets = filteredTickets.filter(ticket => ticket.userId === user.id);
            }

            // Sort tickets by creation date (newest first)
            filteredTickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Ticket List')
                .setDescription(`Found ${filteredTickets.length} tickets${status !== 'ALL' ? ` with status: ${status}` : ''}${user ? ` created by ${user.tag}` : ''}`)
                .setFooter({ text: `Server: ${interaction.guild.name}`, iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            // Add tickets to embed (max 25)
            const maxTickets = Math.min(filteredTickets.length, 25);
            for (let i = 0; i < maxTickets; i++) {
                const ticket = filteredTickets[i];
                const createdAt = new Date(ticket.createdAt).toLocaleDateString();
                const channelExists = interaction.guild.channels.cache.has(ticket.channelId) ? `<#${ticket.channelId}>` : 'Channel deleted';
                
                embed.addFields({
                    name: `${i + 1}. ${ticket.ticketId}`,
                    value: `**Creator:** <@${ticket.userId}> (${ticket.userTag})\n**Created:** ${createdAt}\n**Status:** ${ticket.status}\n**Channel:** ${channelExists}`,
                    inline: false
                });
            }

            // Add note if there are more tickets
            if (filteredTickets.length > 25) {
                embed.addFields({
                    name: 'Note',
                    value: `Only showing 25/${filteredTickets.length} tickets. Please use more specific filters to narrow down results.`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error listing tickets:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while listing tickets.');
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while listing tickets.',
                    ephemeral: true
                });
            }
        }
    },

    async messageRun(message, args) {
        try {
            // Check if user has permission to list tickets
            const member = message.member;
            const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });
            
            const isSupportRole = guildConfig?.ticketSystem?.supportRoles?.some(roleId => 
                member.roles.cache.has(roleId)
            );
            
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isSupportRole && !isAdmin) {
                return message.reply('❌ You do not have permission to list tickets.');
            }

            const reply = await message.reply('Fetching tickets...');

            // Get tickets
            const ticketsPath = path.join(__dirname, '../../data/tickets.json');
            const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
            
            // Parse arguments
            let status = 'OPEN';
            let userId = null;
            
            if (args.length > 0) {
                for (const arg of args) {
                    if (arg.toLowerCase() === 'open' || arg.toLowerCase() === 'closed' || arg.toLowerCase() === 'all') {
                        status = arg.toUpperCase();
                    } else if (arg.match(/^<@!?(\d+)>$/)) {
                        userId = arg.match(/^<@!?(\d+)>$/)[1];
                    }
                }
            }
            
            // Apply filters
            let filteredTickets = Object.values(tickets).filter(ticket => 
                ticket.guildId === message.guild.id
            );
            
            if (status !== 'ALL') {
                filteredTickets = filteredTickets.filter(ticket => ticket.status === status);
            }
            
            if (userId) {
                filteredTickets = filteredTickets.filter(ticket => ticket.userId === userId);
            }

            // Sort tickets by creation date (newest first)
            filteredTickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Ticket List')
                .setDescription(`Found ${filteredTickets.length} tickets${status !== 'ALL' ? ` with status: ${status}` : ''}${userId ? ` created by <@${userId}>` : ''}`)
                .setFooter({ text: `Server: ${message.guild.name}`, iconURL: message.guild.iconURL() })
                .setTimestamp();

            // Add tickets to embed (max 25)
            const maxTickets = Math.min(filteredTickets.length, 25);
            for (let i = 0; i < maxTickets; i++) {
                const ticket = filteredTickets[i];
                const createdAt = new Date(ticket.createdAt).toLocaleDateString();
                const channelExists = message.guild.channels.cache.has(ticket.channelId) ? `<#${ticket.channelId}>` : 'Channel deleted';
                
                embed.addFields({
                    name: `${i + 1}. ${ticket.ticketId}`,
                    value: `**Creator:** <@${ticket.userId}> (${ticket.userTag})\n**Created:** ${createdAt}\n**Status:** ${ticket.status}\n**Channel:** ${channelExists}`,
                    inline: false
                });
            }

            // Add note if there are more tickets
            if (filteredTickets.length > 25) {
                embed.addFields({
                    name: 'Note',
                    value: `Only showing 25/${filteredTickets.length} tickets. Please use more specific filters to narrow down results.`,
                    inline: false
                });
            }

            await reply.edit({ content: null, embeds: [embed] });
        } catch (error) {
            console.error('Error listing tickets:', error);
            await message.reply('❌ An error occurred while listing tickets.');
        }
    }
}; 