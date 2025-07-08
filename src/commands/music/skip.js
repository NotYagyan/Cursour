const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'skip',
    description: 'Skip current song',
    async execute(message) {
        try {
            const queue = message.client.queues.get(message.guild.id);
            
            if (!queue) {
                return message.reply('There is nothing playing that I could skip!');
            }

            if (!message.member.voice.channel) {
                return message.reply('You need to be in a voice channel to skip music!');
            }

            if (message.member.voice.channel.id !== queue.voiceChannel.id) {
                return message.reply('You need to be in the same voice channel as the bot to skip music!');
            }

            const currentSong = queue.songs[0];
            queue.player.stop(); // This will trigger the 'idle' event which will play the next song

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('⏭️ Skipped Song')
                .addFields(
                    { name: 'Skipped', value: currentSong.title },
                    { name: 'Requested By', value: message.author.tag }
                );

            if (queue.songs[1]) {
                embed.addFields({ name: 'Next Up', value: queue.songs[1].title });
            }

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while trying to skip the song!');
        }
    }
}; 