const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check the bot\'s latency'),
    aliases: ['latency'],
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const heartbeat = Math.round(interaction.client.ws.ping);
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Pong!')
            .addFields(
                { name: 'Message Latency', value: `${latency}ms`, inline: true },
                { name: 'Heartbeat', value: `${heartbeat}ms`, inline: true }
            );
        await interaction.editReply({ content: null, embeds: [embed] });
    },
    async messageRun(message) {
        const sent = await message.reply('Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        const heartbeat = Math.round(message.client.ws.ping);
        await sent.edit(`Pong! Latency: ${latency}ms | Heartbeat: ${heartbeat}ms`);
    }
};
