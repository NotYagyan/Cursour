module.exports = {
    name: 'stop',
    description: 'Stop playback and clear queue',
    async execute(message) {
        try {
            const queue = message.client.queues.get(message.guild.id);
            
            if (!queue) {
                return message.reply('There is nothing playing right now!');
            }

            if (!message.member.voice.channel) {
                return message.reply('You need to be in a voice channel to stop music!');
            }

            if (message.member.voice.channel.id !== queue.voiceChannel.id) {
                return message.reply('You need to be in the same voice channel as the bot to stop music!');
            }

            // Clear queue and destroy connection
            queue.songs = [];
            queue.player.stop();
            queue.connection.destroy();
            message.client.queues.delete(message.guild.id);

            return message.reply('⏹️ Stopped the music and cleared the queue!');
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while trying to stop the music!');
        }
    }
}; 