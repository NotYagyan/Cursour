const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display information about this server'),
    name: 'serverinfo',
    description: 'Display information about the current server',
    aliases: ['server', 'guildinfo'],

    async execute(interaction) {
        const guild = interaction.guild;
        const embed = buildEmbed(guild);
        await interaction.reply({ embeds: [embed] });
    },

    async messageRun(message) {
        const embed = buildEmbed(message.guild);
        await message.reply({ embeds: [embed] });
    }
};

function buildEmbed(guild) {
    return new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`${guild.name}`)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Members', value: guild.memberCount.toString(), inline: true },
            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:R>`, inline: true },
            { name: 'ID', value: guild.id }
        );
}
