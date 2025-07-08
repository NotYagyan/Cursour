const { EmbedBuilder, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { GuildConfig } = require('../../utils/database');
const fs = require('fs');
const path = require('path');

module.exports = {
    // For slash command
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows all available commands')
        .addStringOption(option =>
            option
                .setName('command')
                .setDescription('Get detailed help for a specific command')
                .setRequired(false)),

    // For prefix command
    name: 'help',
    description: 'Display all available commands',

    async execute(interaction) {
        const commandName = interaction.options.getString('command')?.toLowerCase();
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const prefix = config?.prefix || '!';

        // Get global whitelist for prefixless commands from environment variable
        const globalPrefixlessWhitelist = process.env.WHITELISTED_USERS?.split(',').filter(id => id.trim() !== '') || [];
        
        // Check if user is whitelisted for prefixless commands
        const isPrefixlessWhitelisted = globalPrefixlessWhitelist.includes(interaction.user.id);

        // Get all available commands from files if client commands are incomplete
        const commands = await this.getAllCommands(interaction.client);

        // If looking for specific command details
        if (commandName) {
            // Try to find command by name or alias
            let command = commands.get(commandName);
            if (!command) {
                // Try to find by alias
                for (const [name, cmd] of commands.entries()) {
                    if (cmd.aliases && cmd.aliases.includes(commandName)) {
                        command = cmd;
                        break;
                    }
                }
            }

            if (!command) {
                return interaction.reply({ content: '❌ Command not found.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`${getCategoryEmoji(getCommandCategory(command.data.name))} Command: ${command.data.name}`)
                .setDescription(command.data.description || 'No description available')
                .setFooter({ text: `Use ${prefix}${command.data.name} or /${command.data.name}` });

            // Add usage field
            let usage = `${prefix}${command.data.name}`;
            if (command.data.options?.length > 0) {
                usage += ' ' + command.data.options.map(opt => 
                    opt.required ? `<${opt.name}>` : `[${opt.name}]`
                ).join(' ');
            }
            embed.addFields({ name: '📝 Usage', value: `\`${usage}\`` });

            // Add aliases if they exist
            if (command.aliases?.length > 0) {
                embed.addFields({ 
                    name: '🔄 Aliases', 
                    value: command.aliases.map(alias => `\`${alias}\``).join(', ')
                });
            }

            // Add subcommands if they exist
            if (command.data.options?.some(opt => opt.type === 1)) {
                const subcommands = command.data.options
                    .filter(opt => opt.type === 1)
                    .map(sub => `\`${sub.name}\` - ${sub.description}`)
                    .join('\n');
                embed.addFields({ name: '📋 Subcommands', value: subcommands });
            }

            if (isPrefixlessWhitelisted) {
                embed.addFields({ 
                    name: '✨ Whitelisted User Perk', 
                    value: 'You can use this command and its aliases without prefix!' 
                });
            }

            // Button to go back to main help menu
            const backButton = new ButtonBuilder()
                .setCustomId('help_back')
                .setLabel('Back to Help Menu')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔙');

            const row = new ActionRowBuilder().addComponents(backButton);

            const response = await interaction.reply({ 
                embeds: [embed], 
                components: [row],
                ephemeral: true 
            });

            // Collector for button interactions
            const collector = response.createMessageComponentCollector({ 
                componentType: ComponentType.Button,
                time: 60000 
            });

            collector.on('collect', async i => {
                if (i.customId === 'help_back') {
                    await this.showCategoryMenu(i, prefix, isPrefixlessWhitelisted, config, commands);
                }
            });

            return;
        }

        // Show main help menu with categories
        await this.showCategoryMenu(interaction, prefix, isPrefixlessWhitelisted, config, commands);
    },

    // Legacy command support
    async messageRun(message, args) {
        const config = await GuildConfig.findOne({ guildId: message.guild.id });
        const prefix = config?.prefix || '!';
        const commandName = args[0]?.toLowerCase();

        // Get global whitelist for prefixless commands from environment variable
        const globalPrefixlessWhitelist = process.env.WHITELISTED_USERS?.split(',').filter(id => id.trim() !== '') || [];
        
        // Check if user is whitelisted for prefixless commands
        const isPrefixlessWhitelisted = globalPrefixlessWhitelist.includes(message.author.id);

        // Get all available commands from files if client commands are incomplete
        const commands = await this.getAllCommands(message.client);

        // If looking for specific command details
        if (commandName) {
            // Try to find command by name or alias
            let command = commands.get(commandName);
            if (!command) {
                // Try to find by alias
                for (const [name, cmd] of commands.entries()) {
                    if (cmd.aliases && cmd.aliases.includes(commandName)) {
                        command = cmd;
                        break;
                    }
                }
            }

            if (!command) {
                return message.reply('❌ Command not found.');
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`${getCategoryEmoji(getCommandCategory(command.data.name))} Command: ${command.data.name}`)
                .setDescription(command.data.description || 'No description available')
                .setFooter({ text: `Use ${prefix}${command.data.name} or /${command.data.name}` });

            // Add usage field
            let usage = `${prefix}${command.data.name}`;
            if (command.data.options?.length > 0) {
                usage += ' ' + command.data.options.map(opt => 
                    opt.required ? `<${opt.name}>` : `[${opt.name}]`
                ).join(' ');
            }
            embed.addFields({ name: '📝 Usage', value: `\`${usage}\`` });

            // Add aliases if they exist
            if (command.aliases?.length > 0) {
                embed.addFields({ 
                    name: '🔄 Aliases', 
                    value: command.aliases.map(alias => `\`${alias}\``).join(', ')
                });
            }

            // Add subcommands if they exist
            if (command.data.options?.some(opt => opt.type === 1)) {
                const subcommands = command.data.options
                    .filter(opt => opt.type === 1)
                    .map(sub => `\`${sub.name}\` - ${sub.description}`)
                    .join('\n');
                embed.addFields({ name: '📋 Subcommands', value: subcommands });
            }

            if (isPrefixlessWhitelisted) {
                embed.addFields({ 
                    name: '✨ Whitelisted User Perk', 
                    value: 'You can use this command and its aliases without prefix!' 
                });
            }

            return message.reply({ embeds: [embed] });
        }

        // For prefix commands, we'll use a simpler approach without buttons (since message components expire)
        const categorizedCommands = this.categorizeCommands(commands);
        const mainEmbed = this.createMainHelpEmbed(prefix, isPrefixlessWhitelisted, config);

        // Just add all category fields to the main embed for prefix commands
        Object.entries(categorizedCommands).forEach(([category, cmds]) => {
            if (cmds.length > 0) {
                const formattedCommands = cmds.map(cmd => {
                    let text = `\`${cmd.name}\``;
                    if (cmd.aliases?.length > 0) {
                        text += ` (${cmd.aliases.map(a => `\`${a}\``).join(', ')})`;
                    }
                    return text;
                }).join('\n');

                mainEmbed.addFields({
                    name: `${getCategoryEmoji(category)} ${category}`,
                    value: formattedCommands
                });
            }
        });

        return message.reply({ embeds: [mainEmbed] });
    },

    // Helper method to show category menu
    async showCategoryMenu(interaction, prefix, isWhitelisted, config, commands) {
        const categorizedCommands = this.categorizeCommands(commands);
        const mainEmbed = this.createMainHelpEmbed(prefix, isWhitelisted, config);

        // Create category buttons
        const buttonRows = [];
        let currentRow = new ActionRowBuilder();
        let buttonCount = 0;

        // Add category buttons
        Object.keys(categorizedCommands).forEach((category, index) => {
            if (categorizedCommands[category].length === 0) return;

            // Create new row after 5 buttons
            if (buttonCount > 0 && buttonCount % 5 === 0) {
                buttonRows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }

            const button = new ButtonBuilder()
                .setCustomId(`help_category_${category}`)
                .setLabel(category)
                .setEmoji(getCategoryEmoji(category))
                .setStyle(getButtonStyle(category));

            currentRow.addComponents(button);
            buttonCount++;
        });

        // Add the last row if it has buttons
        if (currentRow.components.length > 0) {
            buttonRows.push(currentRow);
        }

        // Create command select menu
        const allCommands = Object.values(categorizedCommands)
            .flat()
            .filter(cmd => !cmd.isAlias)
            .sort((a, b) => a.name.localeCompare(b.name));

        const commandSelect = new StringSelectMenuBuilder()
            .setCustomId('help_command_select')
            .setPlaceholder('Select a specific command')
            .setMinValues(1)
            .setMaxValues(1);

        allCommands.slice(0, 25).forEach(cmd => {
            commandSelect.addOptions({
                label: cmd.name,
                description: cmd.description?.substring(0, 100) || 'No description available',
                value: cmd.name,
                emoji: getCategoryEmoji(getCommandCategory(cmd.name))
            });
        });

        const selectRow = new ActionRowBuilder().addComponents(commandSelect);

        // Add select menu as the last row
        const components = [...buttonRows, selectRow];

        const response = await interaction.reply({ 
            embeds: [mainEmbed], 
            components,
            ephemeral: true 
        });

        // Collector for button and select menu interactions
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button | ComponentType.StringSelect,
            time: 180000 // 3 minutes
        });

        collector.on('collect', async i => {
            // Check if interaction is from the original user
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: 'This menu is not for you!', ephemeral: true });
                return;
            }

            // Handle category button clicks
            if (i.customId.startsWith('help_category_')) {
                const category = i.customId.replace('help_category_', '');
                const commands = categorizedCommands[category] || [];

                const categoryEmbed = new EmbedBuilder()
                    .setColor(getCategoryColor(category))
                    .setTitle(`${getCategoryEmoji(category)} ${category} Commands`)
                    .setTimestamp();

                // Add extra information for Anti-Nuke category
                if (category === 'Anti-Nuke') {
                    categoryEmbed.setDescription(`The enhanced Anti-Nuke system protects your server against malicious actions with multiple layers of security:

**Core Features:**
• Monitors for mass ban/kick/channel delete actions
• Detects webhook, emoji, and role deletions
• Guards against dangerous permission changes
• Prevents unauthorized bot additions
• Tracks suspicious mass mentions and server updates

**Security Tools:**
• Emergency lockdown mode for instant protection
• Quarantine system to isolate suspicious users
• User whitelist for trusted server staff
• Detailed audit logging of all actions
• Multiple punishment options (Ban/Kick/Strip Roles/Quarantine)

Use these commands to manage the system:`);
                }

                if (commands.length > 0) {
                    for (const cmd of commands) {
                        let fieldValue = cmd.description || 'No description available';
                        
                        // Add aliases if available
                        if (cmd.aliases && cmd.aliases.length > 0) {
                            fieldValue += `\n**Aliases:** ${cmd.aliases.map(a => `\`${a}\``).join(', ')}`;
                        }
                        
                        categoryEmbed.addFields({
                            name: `${prefix}${cmd.name}`,
                            value: fieldValue
                        });
                    }
                } else {
                    categoryEmbed.setDescription('No commands available in this category.');
                }

                // Back button to return to main menu
                const backButton = new ButtonBuilder()
                    .setCustomId('help_back_main')
                    .setLabel('Back to Main Menu')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔙');

                const row = new ActionRowBuilder().addComponents(backButton);

                await i.update({ embeds: [categoryEmbed], components: [row] });
            }
            // Handle back button to main menu
            else if (i.customId === 'help_back_main') {
                await i.update({ embeds: [mainEmbed], components });
            }
            // Handle command selection
            else if (i.customId === 'help_command_select') {
                const commandName = i.values[0];
                
                // Find the command across all categories
                let selectedCommand;
                for (const category in categorizedCommands) {
                    const found = categorizedCommands[category].find(cmd => cmd.name === commandName);
                    if (found) {
                        selectedCommand = found;
                        break;
                    }
                }

                if (!selectedCommand) {
                    await i.reply({ content: 'Command not found', ephemeral: true });
                    return;
                }

                const category = getCommandCategory(selectedCommand.name);
                const commandEmbed = new EmbedBuilder()
                    .setColor(getCategoryColor(category))
                    .setTitle(`${getCategoryEmoji(category)} Command: ${selectedCommand.name}`)
                    .setDescription(selectedCommand.description || 'No description available')
                    .setFooter({ text: `Use ${prefix}${selectedCommand.name} or /${selectedCommand.name}` });

                // Add aliases if they exist
                if (selectedCommand.aliases?.length > 0) {
                    commandEmbed.addFields({ 
                        name: '🔄 Aliases', 
                        value: selectedCommand.aliases.map(alias => `\`${alias}\``).join(', ')
                    });
                }

                // Add detailed usage for specific commands
                if (selectedCommand.name === 'antinuke') {
                    commandEmbed.addFields({
                        name: '📋 Subcommands',
                        value: `\`enable\` - Enable the anti-nuke system
\`disable\` - Disable the anti-nuke system
\`config\` - Configure thresholds and settings
\`status\` - View current system status`
                    });
                }
                else if (selectedCommand.name === 'antinukewhitelist') {
                    commandEmbed.addFields({
                        name: '📋 Subcommands',
                        value: `\`add <user>\` - Add a user to whitelist
\`remove <user>\` - Remove a user from whitelist
\`list\` - View all whitelisted users`
                    });
                }
                else if (selectedCommand.name === 'quarantine') {
                    commandEmbed.addFields({
                        name: '📋 Subcommands',
                        value: `\`add <user>\` - Quarantine a user
\`release <user>\` - Release a user from quarantine
\`list\` - View all quarantined users`
                    });
                }
                else if (selectedCommand.name === 'emergency') {
                    commandEmbed.addFields({
                        name: '📋 Subcommands',
                        value: `\`enable <reason>\` - Activate emergency lockdown
\`disable\` - Deactivate emergency lockdown`
                    });
                }

                // Back button to return to category menu
                const backButton = new ButtonBuilder()
                    .setCustomId('help_back')
                    .setLabel('Back to Categories')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔙');

                const row = new ActionRowBuilder().addComponents(backButton);

                await i.update({ embeds: [commandEmbed], components: [row] });
            }
        });

        collector.on('end', () => {
            // Remove interactive components when collector expires
            interaction.editReply({ 
                components: []
            }).catch(() => {});
        });
    },

    // Helper method to categorize commands
    categorizeCommands(commands) {
        const categories = {
            'Anti-Nuke': [],
            'Anti-Raid': [],
            'Music': [],
            'Tickets': [],
            'Utility': []
        };

        // Track commands we've already added to prevent duplicates
        const processedCommands = new Set();

        // Process all commands
        for (const [name, command] of commands.entries()) {
            // Skip aliases (we'll show them with their main command)
            if (command.isAlias) continue;
            
            // Skip if we've already processed this command
            if (processedCommands.has(command.data.name)) continue;
            
            // Mark as processed
            processedCommands.add(command.data.name);

            const category = getCommandCategory(name);
            
            const commandInfo = {
                name: command.data.name,
                description: command.data.description,
                aliases: command.aliases
            };

            categories[category].push(commandInfo);
        }

        // Make sure all anti-nuke commands are included and have detailed descriptions
        const ensureCommand = (category, name, description, aliases) => {
            if (!categories[category].find(cmd => cmd.name === name)) {
                categories[category].push({
                    name,
                    description,
                    aliases
                });
            } else {
                // Update description for existing command
                const existingCmd = categories[category].find(cmd => cmd.name === name);
                existingCmd.description = description;
                // Update aliases if not already set
                if (!existingCmd.aliases || existingCmd.aliases.length === 0) {
                    existingCmd.aliases = aliases;
                }
            }
        };

        // Anti-Nuke commands
        ensureCommand('Anti-Nuke', 'antinuke', 'Configure the anti-nuke protection system with multiple options for monitoring and preventing server damage', ['an', 'nuke', 'anti']);
        ensureCommand('Anti-Nuke', 'antinukewhitelist', 'Manage trusted users that bypass anti-nuke checks', ['whitelist', 'wl']);
        ensureCommand('Anti-Nuke', 'antinukelogs', 'View anti-nuke system audit logs of detected suspicious activities', ['logs', 'auditlogs', 'nukelogs']);
        ensureCommand('Anti-Nuke', 'quarantine', 'Isolate suspicious users while preserving their roles for later restoration', ['q', 'quar']);
        ensureCommand('Anti-Nuke', 'emergency', 'Enable or disable server-wide emergency lockdown mode', ['em', 'emergencymode']);

        // Anti-Raid commands
        ensureCommand('Anti-Raid', 'antiraid', 'Configure raid detection and prevention settings', ['raid', 'ar', 'raidprotection']);
        ensureCommand('Anti-Raid', 'verify', 'Complete verification during raid protection mode', ['verification']);

        return categories;
    },

    // Helper method to create main help embed
    createMainHelpEmbed(prefix, isWhitelisted, config) {
        const embed = new EmbedBuilder()
            .setColor('#5865F2')  // Discord blue color
            .setTitle('🌟 Command Help Center')
            .setDescription(`Welcome to the help center! Click the category buttons below to explore commands, or use the dropdown to select a specific command.\n\nUse \`${prefix}help <command>\` or \`/help command:<command>\` for detailed information about a specific command.`)
            .setThumbnail('https://cdn.discordapp.com/attachments/1171524011156549732/1171524057403117568/LogoBW.png?ex=65a7d492&is=65955f92&hm=87eb095d91a113f3bf57ca94a9aada84a0f2177066b97359f24b714ac7277a22&') // Change to your bot's logo
            .setTimestamp();

        // Add command rule information
        const prefixlessEnabled = config?.rules?.prefixlessEnabled !== false;
        const slashEnabled = config?.rules?.slashEnabled !== false;

        embed.addFields({
            name: '⚙️ Command Settings',
            value: `**Prefix:** \`${prefix}\`\n**Slash Commands:** ${slashEnabled ? '✅' : '❌'}\n**Prefixless Commands:** ${prefixlessEnabled ? '✅ (for whitelisted users)' : '❌'}`
        });

        // Add special note for whitelisted users
        if (isWhitelisted) {
            embed.addFields({
                name: '✨ Whitelisted User Perks',
                value: prefixlessEnabled ? 
                    'As a whitelisted user, you can use all commands and their aliases without prefix!' :
                    'Prefixless commands are currently disabled. You must use the prefix or slash commands.'
            });
        }

        // Add configuration status if available
        if (config) {
            const antiNukeStatus = config.antiNuke?.enabled ? '✅ Enabled' : '❌ Disabled';
            const antiRaidStatus = config.antiRaid?.enabled ? '✅ Enabled' : '❌ Disabled';
            const emergencyMode = config.antiNuke?.emergencyModeEnabled ? '✅ Enabled' : '❌ Disabled';
            
            embed.addFields({
                name: '🛡️ Protection System Status',
                value: `**Anti-Nuke:** ${antiNukeStatus}\n**Anti-Raid:** ${antiRaidStatus}\n**Emergency Mode:** ${emergencyMode}`
            });
            
            // Add info about Anti-Nuke features
            if (config.antiNuke?.enabled) {
                const punishment = config.antiNuke.punishment || 'BAN';
                const quarantinedCount = config.antiNuke.quarantinedUsers ? Object.keys(config.antiNuke.quarantinedUsers).length : 0;
                const whitelistedCount = config.antiNuke.whitelistedUsers?.length || 0;
                
                embed.addFields({
                    name: '🛡️ Anti-Nuke Configuration',
                    value: `**Punishment Type:** ${punishment}\n**Action Threshold:** ${config.antiNuke.actionThreshold / 1000}s\n**Quarantined Users:** ${quarantinedCount}\n**Whitelisted Users:** ${whitelistedCount}`
                });
            }
        }

        return embed;
    },

    // Helper method to get all commands (including from files)
    async getAllCommands(client) {
        const commands = new Map();
        
        // First add all commands from client.commands
        for (const [name, command] of client.commands.entries()) {
            commands.set(name, command);
        }

        // If we need to load commands from files
        if (commands.size < 5) { // If we have very few commands, load from files directly
            const commandsPath = path.join(__dirname, '../..');
            const commandFolders = ['commands/antinuke', 'commands/music', 'commands/tickets', 'commands/utility'];

            for (const folder of commandFolders) {
                const folderPath = path.join(commandsPath, folder);
                if (fs.existsSync(folderPath)) {
                    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
                    
                    for (const file of commandFiles) {
                        const filePath = path.join(folderPath, file);
                        try {
                            delete require.cache[require.resolve(filePath)];
                            const command = require(filePath);
                            
                            if ('data' in command) {
                                // Only add if not already in the map
                                if (!commands.has(command.data.name)) {
                                    commands.set(command.data.name, command);
                                }
                                
                                // Register aliases if they exist
                                if (command.aliases && Array.isArray(command.aliases)) {
                                    command.aliases.forEach(alias => {
                                        // Only add alias if not already a command name
                                        if (!commands.has(alias)) {
                                            const aliasCommand = { ...command, isAlias: true };
                                            commands.set(alias, aliasCommand);
                                        }
                                    });
                                }
                            }
                        } catch (error) {
                            console.error(`Error loading command from ${filePath}:`, error);
                        }
                    }
                }
            }
        }

        return commands;
    }
};

// Helper function to get command category
function getCommandCategory(commandName) {
    if (commandName.includes('antinuke') || commandName === 'whitelist' || commandName === 'logs' || 
        commandName === 'quarantine' || commandName === 'emergency' || commandName === 'quar' || 
        commandName === 'em' || commandName === 'emergencymode') {
        return 'Anti-Nuke';
    } else if (commandName.includes('antiraid') || commandName === 'raid' || commandName === 'verify') {
        return 'Anti-Raid';
    } else if (commandName.includes('music') || ['play', 'pause', 'resume', 'skip', 'queue', 'stop', 'volume'].includes(commandName)) {
        return 'Music';
    } else if (commandName.includes('ticket') || ['create', 'close', 'transcript', 'list'].includes(commandName)) {
        return 'Tickets';
    }
    return 'Utility';
}

// Helper function to get emoji for category
function getCategoryEmoji(category) {
    switch(category) {
        case 'Anti-Nuke': return '🛡️';
        case 'Anti-Raid': return '🔒';
        case 'Music': return '🎵';
        case 'Tickets': return '🎫';
        case 'Utility': return '🔧';
        default: return '📌';
    }
}

// Helper function to get color for category
function getCategoryColor(category) {
    switch(category) {
        case 'Anti-Nuke': return '#FF5733';  // Red-Orange
        case 'Anti-Raid': return '#FFC300';  // Amber
        case 'Music': return '#C70039';      // Crimson
        case 'Tickets': return '#900C3F';    // Purple
        case 'Utility': return '#581845';    // Deep Purple
        default: return '#0099ff';           // Blue
    }
}

// Helper function to get button style for category
function getButtonStyle(category) {
    switch(category) {
        case 'Anti-Nuke': return ButtonStyle.Danger;
        case 'Anti-Raid': return ButtonStyle.Primary;
        case 'Music': return ButtonStyle.Success;
        case 'Tickets': return ButtonStyle.Secondary;
        case 'Utility': return ButtonStyle.Primary;
        default: return ButtonStyle.Secondary;
    }
} 