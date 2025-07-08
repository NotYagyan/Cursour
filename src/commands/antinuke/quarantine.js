const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { GuildConfig } = require('../../utils/database');
const antiNuke = require('../../systems/antiNuke');

module.exports = {
    // Slash command
    data: new SlashCommandBuilder()
        .setName('quarantine')
        .setDescription('Manage the anti-nuke quarantine system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand => 
            subcommand
                .setName('list')
                .setDescription('List all currently quarantined users'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Manually quarantine a user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to quarantine')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('release')
                .setDescription('Release a user from quarantine')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to release')
                        .setRequired(true))),

    // Prefix command
    name: 'quarantine',
    description: 'Manage the anti-nuke quarantine system',

    // Add aliases to the module.exports object
    aliases: ['q', 'quar'],

    async execute(interaction, args, client) {
        // Check if user has admin permissions
        const member = interaction.member || interaction.guild.members.cache.get(interaction.author.id);
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
            const reply = { content: 'You need Administrator permission to use this command!', ephemeral: true };
            if (interaction.reply) {
                return interaction.reply(reply);
            } else {
                return interaction.channel.send(reply.content);
            }
        }

        try {
            const isSlash = interaction.commandName ? true : false;
            const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId || interaction.guild.id });
            
            // Initialize quarantined users if not exists
            if (!guildConfig.antiNuke) {
                guildConfig.antiNuke = { enabled: false };
            }
            
            if (!guildConfig.antiNuke.quarantinedUsers) {
                guildConfig.antiNuke.quarantinedUsers = {};
            }
            
            const quarantinedUsers = guildConfig.antiNuke.quarantinedUsers;
            
            let subcommand;
            let user;
            
            if (isSlash) {
                subcommand = interaction.options.getSubcommand();
                user = interaction.options.getUser('user');
            } else {
                if (!args.length || args[0].toLowerCase() === 'list') {
                    subcommand = 'list';
                } else if (args[0].toLowerCase() === 'add') {
                    subcommand = 'add';
                    user = interaction.mentions.users.first() || 
                           await interaction.client.users.fetch(args[1]).catch(() => null);
                } else if (args[0].toLowerCase() === 'release') {
                    subcommand = 'release';
                    user = interaction.mentions.users.first() || 
                           await interaction.client.users.fetch(args[1]).catch(() => null);
                } else {
                    return interaction.channel.send(
                        '❌ Invalid subcommand. Use `quarantine list`, `quarantine add @user`, or `quarantine release @user`.'
                    );
                }
            }
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🔒 Quarantine Management')
                .setTimestamp();
                
            switch (subcommand) {
                case 'list': {
                    const quarantinedIds = Object.keys(quarantinedUsers);
                    
                    if (!quarantinedIds.length) {
                        const reply = { content: 'There are no users currently in quarantine.', ephemeral: true };
                        if (isSlash) {
                            return interaction.reply(reply);
                        } else {
                            return interaction.channel.send(reply.content);
                        }
                    }
                    
                    embed.setDescription(`**${quarantinedIds.length}** users are currently quarantined:`);
                    
                    // Fetch user data for each quarantined user
                    for (const userId of quarantinedIds) {
                        try {
                            const quarantinedUser = await interaction.client.users.fetch(userId);
                            const quarantineInfo = quarantinedUsers[userId];
                            const quarantineTime = new Date(quarantineInfo.quarantinedAt).toLocaleString();
                            
                            embed.addFields({
                                name: `${quarantinedUser.tag} (${userId})`,
                                value: `Quarantined since: ${quarantineTime}\nOriginal roles: ${quarantineInfo.originalRoles.length}`
                            });
                        } catch (error) {
                            embed.addFields({
                                name: `Unknown User (${userId})`,
                                value: 'Could not fetch user information'
                            });
                        }
                    }
                    break;
                }
                
                case 'add': {
                    if (!user) {
                        const reply = { content: '❌ Please provide a valid user to quarantine.', ephemeral: true };
                        if (isSlash) {
                            return interaction.reply(reply);
                        } else {
                            return interaction.channel.send(reply.content);
                        }
                    }
                    
                    try {
                        const targetMember = await interaction.guild.members.fetch(user.id);
                        
                        // Check if user is already quarantined
                        if (quarantinedUsers[user.id]) {
                            const reply = { content: `❌ ${user.tag} is already quarantined.`, ephemeral: true };
                            if (isSlash) {
                                return interaction.reply(reply);
                            } else {
                                return interaction.channel.send(reply.content);
                            }
                        }
                        
                        // Create or find quarantine role
                        let quarantineRole = interaction.guild.roles.cache.find(r => r.name === 'Quarantined');
                        if (!quarantineRole) {
                            quarantineRole = await interaction.guild.roles.create({
                                name: 'Quarantined',
                                color: '#000000',
                                permissions: []
                            });
                            
                            // Set up permissions for all channels
                            await Promise.all(interaction.guild.channels.cache.map(channel => 
                                channel.permissionOverwrites.create(quarantineRole, {
                                    SendMessages: false,
                                    AddReactions: false,
                                    AttachFiles: false,
                                    CreatePublicThreads: false,
                                    CreatePrivateThreads: false,
                                    UseApplicationCommands: false
                                })
                            ));
                        }
                        
                        // Save original roles
                        const originalRoles = targetMember.roles.cache
                            .filter(r => !r.managed && r.id !== interaction.guild.id)
                            .map(r => r.id);
                        
                        // Store in database
                        quarantinedUsers[user.id] = {
                            originalRoles,
                            quarantinedAt: Date.now()
                        };
                        
                        await GuildConfig.set(guildConfig.guildId, guildConfig);
                        
                        // Apply quarantine role
                        await targetMember.roles.set([quarantineRole.id]);
                        
                        embed
                            .setDescription(`✅ Successfully quarantined ${user.tag}`)
                            .addFields(
                                { name: 'User', value: `${user.tag} (${user.id})` },
                                { name: 'Original Roles', value: originalRoles.length ? `${originalRoles.length} roles saved` : 'None' }
                            );
                    } catch (error) {
                        console.error('Error quarantining user:', error);
                        const reply = { content: `❌ Failed to quarantine user: ${error.message}`, ephemeral: true };
                        if (isSlash) {
                            return interaction.reply(reply);
                        } else {
                            return interaction.channel.send(reply.content);
                        }
                    }
                    break;
                }
                
                case 'release': {
                    if (!user) {
                        const reply = { content: '❌ Please provide a valid user to release.', ephemeral: true };
                        if (isSlash) {
                            return interaction.reply(reply);
                        } else {
                            return interaction.channel.send(reply.content);
                        }
                    }
                    
                    // Check if user is quarantined
                    if (!quarantinedUsers[user.id]) {
                        const reply = { content: `❌ ${user.tag} is not currently quarantined.`, ephemeral: true };
                        if (isSlash) {
                            return interaction.reply(reply);
                        } else {
                            return interaction.channel.send(reply.content);
                        }
                    }
                    
                    const success = await antiNuke.releaseFromQuarantine(interaction.guild, user.id);
                    
                    if (success) {
                        embed
                            .setDescription(`✅ Successfully released ${user.tag} from quarantine`)
                            .addFields({ name: 'User', value: `${user.tag} (${user.id})` });
                    } else {
                        const reply = { content: `❌ Failed to release ${user.tag} from quarantine.`, ephemeral: true };
                        if (isSlash) {
                            return interaction.reply(reply);
                        } else {
                            return interaction.channel.send(reply.content);
                        }
                    }
                    break;
                }
            }
            
            if (isSlash) {
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in quarantine command:', error);
            const errorMessage = 'There was an error while executing this command!';
            if (interaction.reply) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.channel.send(errorMessage);
            }
        }
    }
}; 