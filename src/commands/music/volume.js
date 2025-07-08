module.exports = {
    name: 'volume',
    description: 'Adjust volume (1-100)',
    async execute(message, args) {
        try {
            const queue = message.client.queues.get(message.guild.id);
            
            if (!queue) {
                return message.reply('There is nothing playing right now!');
            }

            if (!message.member.voice.channel) {
                return message.reply('You need to be in a voice channel to adjust volume!');
            }

            if (message.member.voice.channel.id !== queue.voiceChannel.id) {
                return message.reply('You need to be in the same voice channel as the bot to adjust volume!');
            }

            // If no args, return current volume
            if (!args.length) {
                return message.reply(`🔊 Current volume is: ${queue.volume}%`);
            }

            const volume = parseInt(args[0]);

            if (isNaN(volume)) {
                return message.reply('Please provide a valid number between 1 and 100!');
            }

            if (volume < 1 || volume > 100) {
                return message.reply('Volume must be between 1 and 100!');
            }

            queue.volume = volume;
            queue.player.state.resource.volume.setVolume(volume / 100);

            return message.reply(`🔊 Volume set to: ${volume}%`);
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while trying to adjust the volume!');
        }
    }
}; 