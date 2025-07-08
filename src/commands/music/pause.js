const { AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    name: 'pause',
    description: 'Pause current playback',
    async execute(message) {
        try {
            const queue = message.client.queues.get(message.guild.id);
            
            if (!queue) {
                return message.reply('There is nothing playing right now!');
            }

            if (!message.member.voice.channel) {
                return message.reply('You need to be in a voice channel to pause music!');
            }

            if (message.member.voice.channel.id !== queue.voiceChannel.id) {
                return message.reply('You need to be in the same voice channel as the bot to pause music!');
            }

            if (queue.player.state.status === AudioPlayerStatus.Paused) {
                return message.reply('The music is already paused!');
            }

            queue.player.pause();
            return message.reply('⏸️ Paused the music!');
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while trying to pause the music!');
        }
    }
}; 