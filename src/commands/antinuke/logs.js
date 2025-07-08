const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { GuildConfig } = require('../../utils/database');

module.exports = {
    // Slash command
    data: new SlashCommandBuilder()
        .setName('antinukelogs')
        .setDescription('View anti-nuke system logs')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(option =>
            option
                .setName('limit')
                .setDescription('Number of logs to show (default: 10)')
                .setMinValue(1)
                .setMaxValue(25)),

    // Prefix command
    name: 'logs',
    description: 'View anti-nuke system logs',

    // Add aliases to the module.exports object
    aliases: ['logs', 'auditlogs', 'nukelogs'],

    async execute(interaction, args, client) {
        // Check if user has admin permissions
        const member = interaction.member || interaction.guild.members.cache.get(interaction.author.id);
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
            const reply = { content: 'You need Administrator permission to use this command!', ephemeral: true };
            if (interaction.reply) {
                return interaction.reply(reply);
            } else {
                return interaction.channel.send(reply.content);
            }
        }

        try {
            const isSlash = interaction.commandName ? true : false;
            let limit;

            if (isSlash) {
                limit = interaction.options.getInteger('limit') || 10;
            } else {
                limit = parseInt(args[0]) || 10;
                if (limit < 1 || limit > 25) {
                    return interaction.channel.send('❌ Limit must be between 1 and 25 logs!');
                }
            }

            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId || interaction.guild.id });

            if (!guildConfig?.antiNuke?.enabled) {
                const reply = { content: '❌ Anti-Nuke system is not enabled for this server.', ephemeral: true };
                if (isSlash) {
                    return interaction.reply(reply);
                } else {
                    return interaction.channel.send(reply.content);
                }
            }

            // Fetch audit logs for relevant actions
            const auditLogs = await interaction.guild.fetchAuditLogs({
                limit: limit,
                type: [
                    AuditLogEvent.MemberBan,
                    AuditLogEvent.MemberKick,
                    AuditLogEvent.RoleDelete,
                    AuditLogEvent.ChannelDelete
                ]
            });

            if (!auditLogs.entries.size) {
                const reply = { content: 'No anti-nuke related logs found.', ephemeral: true };
                if (isSlash) {
                    return interaction.reply(reply);
                } else {
                    return interaction.channel.send(reply.content);
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Anti-Nuke System Logs')
                .setDescription(`Last ${Math.min(auditLogs.entries.size, limit)} anti-nuke related actions:`)
                .setTimestamp();

            auditLogs.entries.forEach(log => {
                let actionType;
                let target;

                switch (log.action) {
                    case AuditLogEvent.MemberBan:
                        actionType = 'Ban';
                        target = log.target ? `${log.target.tag} (${log.target.id})` : 'Unknown User';
                        break;
                    case AuditLogEvent.MemberKick:
                        actionType = 'Kick';
                        target = log.target ? `${log.target.tag} (${log.target.id})` : 'Unknown User';
                        break;
                    case AuditLogEvent.RoleDelete:
                        actionType = 'Role Deletion';
                        target = log.changes[0]?.old?.name || 'Unknown Role';
                        break;
                    case AuditLogEvent.ChannelDelete:
                        actionType = 'Channel Deletion';
                        target = log.changes[0]?.old?.name || 'Unknown Channel';
                        break;
                }

                const executor = log.executor ? `${log.executor.tag} (${log.executor.id})` : 'Unknown';
                const timestamp = `<t:${Math.floor(log.createdTimestamp / 1000)}:R>`;

                embed.addFields({
                    name: `${actionType} - ${timestamp}`,
                    value: `**Executor:** ${executor}\n**Target:** ${target}\n**Reason:** ${log.reason || 'No reason provided'}`
                });
            });

            if (isSlash) {
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in logs command:', error);
            const errorMessage = 'There was an error while fetching the logs!';
            if (interaction.reply) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.channel.send(errorMessage);
            }
        }
    }
}; 