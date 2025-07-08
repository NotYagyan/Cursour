const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'queue',
    description: 'View song queue',
    async execute(message) {
        try {
            const queue = message.client.queues.get(message.guild.id);
            
            if (!queue || !queue.songs.length) {
                return message.reply('There are no songs in the queue!');
            }

            const currentSong = queue.songs[0];
            const upcomingSongs = queue.songs.slice(1);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Music Queue')
                .setThumbnail(currentSong.thumbnail);

            // Add current song
            embed.addFields({
                name: '🎵 Now Playing',
                value: `${currentSong.title}\nRequested by: ${currentSong.requestedBy}\nDuration: ${formatDuration(currentSong.duration)}`
            });

            // Add upcoming songs
            if (upcomingSongs.length) {
                const queueList = upcomingSongs
                    .slice(0, 10) // Show only next 10 songs
                    .map((song, index) => 
                        `${index + 1}. ${song.title} | ${formatDuration(song.duration)} | Requested by: ${song.requestedBy}`
                    )
                    .join('\n');

                embed.addFields({
                    name: '📋 Up Next',
                    value: queueList
                });

                if (upcomingSongs.length > 10) {
                    embed.addFields({
                        name: 'And more...',
                        value: `${upcomingSongs.length - 10} more songs in queue`
                    });
                }
            }

            // Add total duration
            const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
            embed.setFooter({ 
                text: `Total songs: ${queue.songs.length} | Total duration: ${formatDuration(totalDuration)}`
            });

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while trying to show the queue!');
        }
    }
};

function formatDuration(duration) {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
} 