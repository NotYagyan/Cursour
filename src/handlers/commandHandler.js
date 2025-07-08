const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

module.exports = (client) => {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFolders = fs.readdirSync(commandsPath);

    console.log('Loading commands...');

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

        console.log(`Loading commands from ${folder} folder...`);

        for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            const command = require(filePath);

            // Load command
            if ('data' in command && ('execute' in command || 'messageRun' in command)) {
                // Register main command name
                console.log(`Loading command: ${command.data.name}`);
                
                // Add messageRun method if only execute exists (for backward compatibility)
                if (!command.messageRun && command.execute) {
                    command.messageRun = async (message, args) => {
                        // Create a mock interaction object for compatibility
                        const mockInteraction = {
                            options: {
                                getString: (name) => args.shift() || null,
                                getUser: (name) => message.mentions.users.first() || null,
                                getMember: (name) => message.mentions.members.first() || null,
                                getChannel: (name) => message.mentions.channels.first() || null,
                                getRole: (name) => message.mentions.roles.first() || null,
                                getInteger: (name) => {
                                    const val = args.shift();
                                    return val ? parseInt(val) : null;
                                },
                                getNumber: (name) => {
                                    const val = args.shift();
                                    return val ? parseFloat(val) : null;
                                },
                                getBoolean: (name) => {
                                    const val = args.shift()?.toLowerCase();
                                    if (['true', 'yes', 'y', '1', 'on'].includes(val)) return true;
                                    if (['false', 'no', 'n', '0', 'off'].includes(val)) return false;
                                    return null;
                                },
                                getSubcommand: () => args.length > 0 ? args.shift().toLowerCase() : null,
                            },
                            guild: message.guild,
                            channel: message.channel,
                            user: message.author,
                            member: message.member,
                            reply: async (content) => message.reply(content),
                            followUp: async (content) => message.channel.send(content),
                            deferReply: async () => Promise.resolve(),
                            editReply: async (content) => message.edit(content).catch(() => message.channel.send(content)),
                            commandName: command.data.name,
                        };
                        
                        try {
                            await command.execute(mockInteraction);
                        } catch (error) {
                            console.error(`Error in messageRun compatibility layer for ${command.data.name}:`, error);
                            message.reply('There was an error executing this command.');
                        }
                    };
                    console.log(`- Added messageRun compatibility for ${command.data.name}`);
                }
                
                // Add execute method if only messageRun exists (for backward compatibility)
                if (!command.execute && command.messageRun) {
                    command.execute = async (interaction) => {
                        // Extract args from interaction for messageRun
                        const args = [];
                        if (interaction.options) {
                            // Get all options
                            for (const option of interaction.options._hoistedOptions) {
                                args.push(option.value.toString());
                            }
                            
                            // Add subcommand name if present
                            if (interaction.options.getSubcommand(false)) {
                                args.unshift(interaction.options.getSubcommand());
                            }
                        }
                        
                        try {
                            await command.messageRun(interaction, args);
                        } catch (error) {
                            console.error(`Error in execute compatibility layer for ${command.data.name}:`, error);
                            if (interaction.replied || interaction.deferred) {
                                await interaction.followUp({ 
                                    content: 'There was an error executing this command!',
                                    ephemeral: true 
                                });
                            } else {
                                await interaction.reply({ 
                                    content: 'There was an error executing this command!',
                                    ephemeral: true 
                                });
                            }
                        }
                    };
                    console.log(`- Added execute compatibility for ${command.data.name}`);
                }
                
                // Register the command
                client.commands.set(command.data.name, command);

                // Register command aliases if they exist
                if (command.aliases && Array.isArray(command.aliases)) {
                    command.aliases.forEach(alias => {
                        console.log(`Loading alias: ${alias} -> ${command.data.name}`);
                        if (!client.commands.has(alias)) {
                            client.commands.set(alias, command);
                        } else {
                            console.log(`[WARNING] Alias ${alias} for command ${command.data.name} conflicts with another command/alias`);
                        }
                    });
                }
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing required properties.`);
            }
        }
    }

    console.log(`Loaded ${client.commands.size} commands (including aliases).`);
}; 