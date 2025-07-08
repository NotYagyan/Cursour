const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const { SlashCommandBuilder } = require('discord.js');
const play = require('play-dl');
const GuildConfig = require('../../models/GuildConfig');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from YouTube')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song to play')
                .setRequired(true)),
                
    async execute(interaction, client) {
        try {
            // Check if user provided a song
            if (!interaction.options.getString('query')) {
                return interaction.reply('Please provide a song to play!');
            }

            // Check if user is in a voice channel
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.reply('You need to be in a voice channel to play music!');
            }

            // Initialize queue if it doesn't exist
            if (!client.queues) {
                client.queues = new Map();
            }

            let serverQueue = client.queues.get(interaction.guild.id);
            const query = interaction.options.getString('query');

            // Get guild config
            let guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
            if (!guildConfig) {
                guildConfig = await GuildConfig.create({ guildId: interaction.guild.id });
            }

            // Check for DJ role if configured
            if (guildConfig.musicSystem.djRoles.length > 0) {
                const hasDJRole = interaction.member.roles.cache.some(role => 
                    guildConfig.musicSystem.djRoles.includes(role.id)
                );
                if (!hasDJRole) {
                    return interaction.reply('You need a DJ role to use music commands!');
                }
            }

            await interaction.deferReply();

            // Search for the song
            const searchResults = await play.search(query, { limit: 1 });
            if (!searchResults.length) {
                return interaction.editReply('No results found!');
            }

            const song = {
                title: searchResults[0].title,
                url: searchResults[0].url,
                duration: searchResults[0].durationInSec,
                thumbnail: searchResults[0].thumbnails[0].url,
                requestedBy: interaction.user.tag
            };

            // Create queue if it doesn't exist
            if (!serverQueue) {
                const queueConstruct = {
                    textChannel: interaction.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    songs: [],
                    volume: 50,
                    playing: true,
                    player: null
                };

                client.queues.set(interaction.guild.id, queueConstruct);
                queueConstruct.songs.push(song);

                try {
                    // Join voice channel
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: interaction.guild.id,
                        adapterCreator: interaction.guild.voiceAdapterCreator,
                    });

                    queueConstruct.connection = connection;
                    queueConstruct.player = createAudioPlayer();
                    
                    // Handle connection errors
                    connection.on(VoiceConnectionStatus.Disconnected, async () => {
                        try {
                            await Promise.race([
                                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                            ]);
                        } catch (error) {
                            connection.destroy();
                            client.queues.delete(interaction.guild.id);
                        }
                    });

                    // Play the song
                    await playSong(interaction.guild, queueConstruct.songs[0]);
                } catch (error) {
                    console.error(error);
                    client.queues.delete(interaction.guild.id);
                    return interaction.editReply('There was an error connecting to the voice channel!');
                }
            } else {
                serverQueue.songs.push(song);
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Added to Queue')
                    .setThumbnail(song.thumbnail)
                    .addFields(
                        { name: 'Song Title', value: song.title },
                        { name: 'Duration', value: formatDuration(song.duration) },
                        { name: 'Requested By', value: song.requestedBy },
                        { name: 'Position in Queue', value: serverQueue.songs.length.toString() }
                    );
                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error(error);
            if (interaction.deferred) {
                interaction.editReply('An error occurred while trying to play the song!');
            } else {
                interaction.reply('An error occurred while trying to play the song!');
            }
        }
    },
};

// Add aliases if this is the beginning of the file
module.exports.aliases = ['p', 'add'];

async function playSong(guild, song) {
    const queue = guild.client.queues.get(guild.id);

    if (!song) {
        queue.connection.destroy();
        guild.client.queues.delete(guild.id);
        return;
    }

    try {
        // Get stream
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });
        
        resource.volume.setVolume(queue.volume / 100);
        queue.player.play(resource);
        queue.connection.subscribe(queue.player);

        // Handle audio player states
        queue.player.on(AudioPlayerStatus.Playing, () => {
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Now Playing')
                .setThumbnail(song.thumbnail)
                .addFields(
                    { name: 'Song Title', value: song.title },
                    { name: 'Duration', value: formatDuration(song.duration) },
                    { name: 'Requested By', value: song.requestedBy }
                );
            queue.textChannel.send({ embeds: [embed] });
        });

        queue.player.on(AudioPlayerStatus.Idle, () => {
            queue.songs.shift();
            playSong(guild, queue.songs[0]);
        });

        queue.player.on('error', error => {
            console.error(error);
            queue.songs.shift();
            playSong(guild, queue.songs[0]);
        });

    } catch (error) {
        console.error(error);
        queue.songs.shift();
        playSong(guild, queue.songs[0]);
    }
}

function formatDuration(duration) {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
} 