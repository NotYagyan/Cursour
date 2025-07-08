const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),
    name: 'ping',
    description: 'Check bot latency',
    aliases: ['latency'],

    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Pong!')
            .addFields(
                { name: 'Latency', value: `${latency}ms`, inline: true },
                { name: 'API', value: `${Math.round(interaction.client.ws.ping)}ms`, inline: true }
            );
        await interaction.editReply({ content: null, embeds: [embed] });
    },

    async messageRun(message) {
        const sent = await message.reply('Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Pong!')
            .addFields(
                { name: 'Latency', value: `${latency}ms`, inline: true },
                { name: 'API', value: `${Math.round(message.client.ws.ping)}ms`, inline: true }
            );
        await sent.edit({ content: null, embeds: [embed] });
    }
};
