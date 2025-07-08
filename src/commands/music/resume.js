const { AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    name: 'resume',
    description: 'Resume playback',
    async execute(message) {
        try {
            const queue = message.client.queues.get(message.guild.id);
            
            if (!queue) {
                return message.reply('There is nothing to resume!');
            }

            if (!message.member.voice.channel) {
                return message.reply('You need to be in a voice channel to resume music!');
            }

            if (message.member.voice.channel.id !== queue.voiceChannel.id) {
                return message.reply('You need to be in the same voice channel as the bot to resume music!');
            }

            if (queue.player.state.status === AudioPlayerStatus.Playing) {
                return message.reply('The music is already playing!');
            }

            queue.player.unpause();
            return message.reply('▶️ Resumed the music!');
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while trying to resume the music!');
        }
    }
}; 