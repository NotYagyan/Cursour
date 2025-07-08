const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { GuildConfig } = require('../../utils/database');

module.exports = {
    // Slash command
    data: new SlashCommandBuilder()
        .setName('antinukewhitelist')
        .setDescription('Manage anti-nuke system whitelist')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user to the anti-nuke whitelist')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to whitelist')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from the anti-nuke whitelist')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to remove from whitelist')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all whitelisted users')),

    // Prefix command
    name: 'whitelist',
    description: 'Manage anti-nuke system whitelist',

    // Add aliases to the module.exports object
    aliases: ['whitelist', 'wl'],

    async execute(interaction) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'You need Administrator permission to use this command!',
                ephemeral: true
            });
        }

        try {
            let guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });

            if (!guildConfig) {
                guildConfig = {
                    guildId: interaction.guild.id,
                    antiNuke: {
                        enabled: false,
                        whitelistedUsers: []
                    }
                };
                // Create new guild config
                await GuildConfig.set(guildConfig.guildId, guildConfig);
            }

            if (!guildConfig.antiNuke) {
                guildConfig.antiNuke = { enabled: false, whitelistedUsers: [] };
            }

            if (!guildConfig.antiNuke.whitelistedUsers) {
                guildConfig.antiNuke.whitelistedUsers = [];
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Anti-Nuke Whitelist Management')
                .setTimestamp();

            const subcommand = interaction.options.getSubcommand();
            switch (subcommand) {
                case 'add': {
                    const user = interaction.options.getUser('user');
                    
                    if (guildConfig.antiNuke.whitelistedUsers.includes(user.id)) {
                        return interaction.reply({
                            content: '❌ This user is already whitelisted!',
                            ephemeral: true
                        });
                    }

                    guildConfig.antiNuke.whitelistedUsers.push(user.id);
                    embed.setDescription(`✅ Added ${user.tag} to the anti-nuke whitelist!`)
                        .addFields({
                            name: 'Whitelisted User',
                            value: `${user.tag} (${user.id})`
                        });
                    break;
                }

                case 'remove': {
                    const user = interaction.options.getUser('user');
                    const index = guildConfig.antiNuke.whitelistedUsers.indexOf(user.id);

                    if (index === -1) {
                        return interaction.reply({
                            content: '❌ This user is not whitelisted!',
                            ephemeral: true
                        });
                    }

                    guildConfig.antiNuke.whitelistedUsers.splice(index, 1);
                    embed.setDescription(`✅ Removed ${user.tag} from the anti-nuke whitelist!`)
                        .addFields({
                            name: 'Removed User',
                            value: `${user.tag} (${user.id})`
                        });
                    break;
                }

                case 'list': {
                    if (!guildConfig.antiNuke.whitelistedUsers.length) {
                        return interaction.reply({
                            content: 'No users are currently whitelisted.',
                            ephemeral: true
                        });
                    }

                    const whitelistedUsers = await Promise.all(
                        guildConfig.antiNuke.whitelistedUsers.map(async userId => {
                            try {
                                const user = await interaction.client.users.fetch(userId);
                                return `${user.tag} (${user.id})`;
                            } catch {
                                return `Unknown User (${userId})`;
                            }
                        })
                    );

                    embed.setDescription('Current whitelisted users:')
                        .addFields({
                            name: 'Users',
                            value: whitelistedUsers.join('\n') || 'None'
                        });
                    break;
                }
            }

            // Update guild config
            await GuildConfig.set(guildConfig.guildId, guildConfig);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in whitelist command:', error);
            await interaction.reply({ 
                content: 'There was an error while executing this command!', 
                ephemeral: true 
            });
        }
    },

    // For prefix and prefixless commands
    async messageRun(message, args) {
        // Check if user has admin permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ You need Administrator permission to use this command!');
        }

        try {
            let guildConfig = await GuildConfig.findOne({ guildId: message.guild.id });

            if (!guildConfig) {
                guildConfig = {
                    guildId: message.guild.id,
                    antiNuke: {
                        enabled: false,
                        whitelistedUsers: []
                    }
                };
                // Create new guild config
                await GuildConfig.set(guildConfig.guildId, guildConfig);
            }

            if (!guildConfig.antiNuke) {
                guildConfig.antiNuke = { enabled: false, whitelistedUsers: [] };
            }

            if (!guildConfig.antiNuke.whitelistedUsers) {
                guildConfig.antiNuke.whitelistedUsers = [];
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Anti-Nuke Whitelist Management')
                .setTimestamp();

            if (!args.length || args[0].toLowerCase() === 'help') {
                embed.setDescription('Anti-Nuke Whitelist Commands')
                    .addFields({
                        name: 'Available Commands',
                        value: `\`whitelist add @user\` - Add user to whitelist
\`whitelist remove @user\` - Remove user from whitelist
\`whitelist list\` - View all whitelisted users`
                    });
                return message.reply({ embeds: [embed] });
            }

            const subcommand = args[0].toLowerCase();
            switch (subcommand) {
                case 'add': {
                    // Check for user mention or ID
                    const userMention = message.mentions.users.first();
                    const userId = userMention ? userMention.id : args[1];
                    
                    if (!userId) {
                        return message.reply('❌ Please mention a user or provide their ID to whitelist!');
                    }

                    try {
                        const user = await message.client.users.fetch(userId);
                        
                        if (guildConfig.antiNuke.whitelistedUsers.includes(user.id)) {
                            return message.reply('❌ This user is already whitelisted!');
                        }

                        guildConfig.antiNuke.whitelistedUsers.push(user.id);
                        embed.setDescription(`✅ Added ${user.tag} to the anti-nuke whitelist!`)
                            .addFields({
                                name: 'Whitelisted User',
                                value: `${user.tag} (${user.id})`
                            });
                    } catch (error) {
                        return message.reply('❌ Invalid user! Please mention a valid user or provide their ID.');
                    }
                    break;
                }

                case 'remove': {
                    // Check for user mention or ID
                    const userMention = message.mentions.users.first();
                    const userId = userMention ? userMention.id : args[1];
                    
                    if (!userId) {
                        return message.reply('❌ Please mention a user or provide their ID to remove from whitelist!');
                    }

                    try {
                        const user = await message.client.users.fetch(userId);
                        const index = guildConfig.antiNuke.whitelistedUsers.indexOf(user.id);

                        if (index === -1) {
                            return message.reply('❌ This user is not whitelisted!');
                        }

                        guildConfig.antiNuke.whitelistedUsers.splice(index, 1);
                        embed.setDescription(`✅ Removed ${user.tag} from the anti-nuke whitelist!`)
                            .addFields({
                                name: 'Removed User',
                                value: `${user.tag} (${user.id})`
                            });
                    } catch (error) {
                        return message.reply('❌ Invalid user! Please mention a valid user or provide their ID.');
                    }
                    break;
                }

                case 'list': {
                    if (!guildConfig.antiNuke.whitelistedUsers.length) {
                        return message.reply('No users are currently whitelisted.');
                    }

                    const whitelistedUsers = await Promise.all(
                        guildConfig.antiNuke.whitelistedUsers.map(async userId => {
                            try {
                                const user = await message.client.users.fetch(userId);
                                return `${user.tag} (${user.id})`;
                            } catch {
                                return `Unknown User (${userId})`;
                            }
                        })
                    );

                    embed.setDescription('Current whitelisted users:')
                        .addFields({
                            name: 'Users',
                            value: whitelistedUsers.join('\n') || 'None'
                        });
                    break;
                }

                default:
                    return message.reply('❌ Invalid subcommand. Use: add, remove, or list');
            }

            // Update guild config
            await GuildConfig.set(guildConfig.guildId, guildConfig);
            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in whitelist command:', error);
            await message.reply('There was an error while executing this command!');
        }
    }
}; 