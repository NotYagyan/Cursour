const { GuildConfig } = require('../../utils/database');
const antiNuke = require('../../systems/antiNuke');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        // Process message for anti-nuke mass mention protection
        await antiNuke.handleMessage(message);

        // Get guild configuration
        const config = await GuildConfig.findOne({ guildId: message.guild.id });
        if (!config) return;

        // Get command rules from config or use defaults
        const prefix = config.rules?.prefix || '!';
        const prefixlessEnabled = config.rules?.prefixlessEnabled !== false; // Default to true if not set

        // Get global whitelist for prefixless commands from environment variable
        const globalPrefixlessWhitelist = process.env.WHITELISTED_USERS?.split(',').filter(id => id.trim() !== '') || [];
        
        // Check if user is whitelisted for prefixless commands (only from global whitelist)
        const isPrefixlessWhitelisted = globalPrefixlessWhitelist.includes(message.author.id);

        let args;
        let commandName;

        // Check if message starts with prefix
        const isPrefix = message.content.startsWith(prefix);

        // If message starts with prefix, handle as prefix command
        if (isPrefix) {
            args = message.content.slice(prefix.length).trim().split(/ +/);
            commandName = args.shift().toLowerCase();

            // Try to find the command or its alias
            let command = message.client.commands.get(commandName);
            
            // If not found, check for aliases
            if (!command) {
                for (const [name, cmd] of message.client.commands.entries()) {
                    if (cmd.aliases && cmd.aliases.includes(commandName)) {
                        command = cmd;
                        break;
                    }
                }
            }

            if (!command) return;

            // Execute the command
            console.log(`Executing prefix command: ${commandName}`);
            try {
                if (command.messageRun) {
                    await command.messageRun(message, args);
                } else if (command.execute) {
                    await command.execute(message, args);
                }
            } catch (error) {
                console.error('Error executing prefix command:', error);
                await message.reply('There was an error executing that command.');
            }
            return;
        }

        // Handle prefixless commands for whitelisted users (if enabled)
        if (isPrefixlessWhitelisted && prefixlessEnabled) {
            // First word is the command name
            args = message.content.trim().split(/ +/);
            commandName = args.shift().toLowerCase();

            // Special handling for common command names and aliases
            const commandMap = {
                // Anti-nuke commands
                'whitelist': 'antinukewhitelist',
                'wl': 'antinukewhitelist',
                'logs': 'antinukelogs',
                'antinuke': 'antinuke',
                'an': 'antinuke',
                'nuke': 'antinuke',
                
                // Anti-raid commands
                'raid': 'antiraid',
                'ar': 'antiraid',
                'verify': 'verify',
                
                // Other commands can be added here
            };

            // Map common command names to their actual command name
            if (commandMap[commandName]) {
                commandName = commandMap[commandName];
            }

            // Try to find the command directly
            let command = message.client.commands.get(commandName);
            
            // If not found, check for aliases
            if (!command) {
                for (const [name, cmd] of message.client.commands.entries()) {
                    if (cmd.aliases && cmd.aliases.includes(commandName)) {
                        command = cmd;
                        break;
                    }
                }
            }

            // If command found, execute it
            if (command) {
                console.log(`Executing prefixless command: ${commandName}`);
                try {
                    if (command.messageRun) {
                        await command.messageRun(message, args);
                    } else if (command.execute) {
                        // Create mock interaction for execute method
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
                        
                        await command.execute(mockInteraction);
                    }
                } catch (error) {
                    console.error('Error executing prefixless command:', error);
                    await message.reply('There was an error executing that command.');
                }
            }
        }
    },
}; 