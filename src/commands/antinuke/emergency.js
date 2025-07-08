const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { GuildConfig } = require('../../utils/database');
const antiNuke = require('../../systems/antiNuke');

module.exports = {
    // Slash command
    data: new SlashCommandBuilder()
        .setName('emergency')
        .setDescription('Manage emergency mode for anti-nuke protection')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Manually enable emergency mode')
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for enabling emergency mode')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Manually disable emergency mode')),

    // Prefix command
    name: 'emergency',
    description: 'Manage emergency mode for anti-nuke protection',

    // Add aliases to the module.exports object
    aliases: ['em', 'emergencymode'],

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
            let subcommand, reason;
            
            if (isSlash) {
                subcommand = interaction.options.getSubcommand();
                reason = interaction.options.getString('reason');
            } else {
                if (!args.length) {
                    return interaction.channel.send('❌ Please specify a subcommand: `emergency enable <reason>` or `emergency disable`');
                }
                
                subcommand = args[0].toLowerCase();
                if (subcommand === 'enable' && args.length < 2) {
                    return interaction.channel.send('❌ Please provide a reason for enabling emergency mode');
                }
                
                if (subcommand === 'enable') {
                    reason = args.slice(1).join(' ');
                }
            }
            
            const guild = interaction.guild;
            const guildConfig = await GuildConfig.findOne({ guildId: guild.id });
            
            if (!guildConfig || !guildConfig.antiNuke || !guildConfig.antiNuke.enabled) {
                const reply = { content: '❌ Anti-Nuke system is not enabled for this server. Enable it first with `/antinuke enable`', ephemeral: true };
                if (isSlash) {
                    return interaction.reply(reply);
                } else {
                    return interaction.channel.send(reply.content);
                }
            }
            
            const embed = new EmbedBuilder()
                .setTitle('Emergency Mode')
                .setTimestamp();
                
            switch (subcommand) {
                case 'enable':
                    // Check if emergency mode is already active
                    const status = await antiNuke.getStatus(guild.id);
                    if (status.emergencyMode) {
                        const reply = { content: '❌ Emergency mode is already active', ephemeral: true };
                        if (isSlash) {
                            return interaction.reply(reply);
                        } else {
                            return interaction.channel.send(reply.content);
                        }
                    }
                    
                    // Validate reason
                    if (!reason || reason.trim() === '') {
                        const reply = { content: '❌ You must provide a valid reason for enabling emergency mode', ephemeral: true };
                        if (isSlash) {
                            return interaction.reply(reply);
                        } else {
                            return interaction.channel.send(reply.content);
                        }
                    }
                    
                    // Create manual emergency reason
                    const fullReason = `MANUAL: ${reason}`;
                    
                    // Debug role positions
                    const botMember = await guild.members.fetchMe();
                    const botRole = botMember.roles.highest;
                    console.log(`[ROLE DEBUG] Bot's highest role: ${botRole.name} (position: ${botRole.position})`);
                    
                    // Find License (Advanced) role
                    const licenseAdvancedRole = guild.roles.cache.find(r => r.name === 'License (Advanced)');
                    if (licenseAdvancedRole) {
                        console.log(`[ROLE DEBUG] License (Advanced) role position: ${licenseAdvancedRole.position}`);
                        console.log(`[ROLE DEBUG] Bot can modify License (Advanced)? ${botRole.position > licenseAdvancedRole.position ? 'YES' : 'NO'}`);
                    }
                    
                    // Enable emergency mode
                    const emergencyResult = await antiNuke.enableEmergencyMode(guild, guildConfig, fullReason);
                    
                    // Special override for License (Advanced) role issue
                    if (!emergencyResult.success && 
                        emergencyResult.message && 
                        emergencyResult.message.includes('License (Advanced)')) {
                        
                        console.log('[ROLE DEBUG] Detected License (Advanced) role issue, attempting manual override');
                        
                        // Force emergency mode to be set
                        const antiNukeInstance = require('../../systems/antiNuke');
                        
                        // Set emergency mode status manually
                        antiNukeInstance.emergencyMode.set(guild.id, {
                            timestamp: Date.now(),
                            reason: fullReason
                        });
                        
                        console.log(`[EMERGENCY MODE] Force enabled for guild ${guild.id}: ${fullReason}`);
                        
                        // Create emergency embed
                        const emergencyEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('🚨 EMERGENCY LOCKDOWN ACTIVATED')
                            .setDescription('Server has been put into emergency lockdown (SPECIAL MODE)')
                            .addFields(
                                { name: 'Reason', value: reason || 'No reason provided' },
                                { name: 'Note', value: 'Due to role hierarchy issues, some roles could not be modified.' }
                            )
                            .setTimestamp();
                        
                        // Set temporary timeout to disable
                        setTimeout(() => antiNukeInstance.disableEmergencyMode(guild), 30 * 60 * 1000);
                        
                        if (isSlash) {
                            return interaction.reply({ embeds: [emergencyEmbed] });
                        } else {
                            return interaction.channel.send({ embeds: [emergencyEmbed] });
                        }
                    }
                    
                    // If enableEmergencyMode failed for other reasons, send error message
                    if (!emergencyResult.success) {
                        const errorEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Emergency Mode Activation Failed')
                            .setDescription(emergencyResult.message)
                            .setTimestamp();
                            
                        if (isSlash) {
                            return interaction.reply({ embeds: [errorEmbed] });
                        } else {
                            return interaction.channel.send({ embeds: [errorEmbed] });
                        }
                    }
                    
                    embed
                        .setColor('#FF0000')
                        .setDescription('🚨 **EMERGENCY MODE ACTIVATED**')
                        .addFields(
                            { name: 'Activated By', value: `${interaction.user.tag} (${interaction.user.id})` },
                            { name: 'Reason', value: reason || 'No reason provided' },
                            { name: 'Effects', value: `- Dangerous permissions have been temporarily removed from all roles\n- Server is now in lockdown state\n- Will automatically disable in 30 minutes` }
                        );
                        
                    // If there was a partial success, add warning about failed roles
                    if (emergencyResult.partialSuccess && emergencyResult.failedRoles) {
                        embed.addFields({
                            name: '⚠️ Warning',
                            value: `Could not modify these roles: ${emergencyResult.failedRoles.join(', ')}\nBot's role should be higher than these roles.`
                        });
                    }
                    break;
                    
                case 'disable':
                    // Check if emergency mode is active
                    const currentStatus = await antiNuke.getStatus(guild.id);
                    if (!currentStatus.emergencyMode) {
                        const reply = { content: '❌ Emergency mode is not currently active', ephemeral: true };
                        if (isSlash) {
                            return interaction.reply(reply);
                        } else {
                            return interaction.channel.send(reply.content);
                        }
                    }
                    
                    // Disable emergency mode
                    await antiNuke.disableEmergencyMode(guild);
                    
                    embed
                        .setColor('#00FF00')
                        .setDescription('✅ **EMERGENCY MODE DEACTIVATED**')
                        .addFields(
                            { name: 'Deactivated By', value: `${interaction.user.tag} (${interaction.user.id})` },
                            { name: 'Effects', value: 'All role permissions have been restored to their previous state' }
                        );
                    break;
                    
                default:
                    const reply = { content: '❌ Invalid subcommand. Use `emergency enable <reason>` or `emergency disable`', ephemeral: true };
                    if (isSlash) {
                        return interaction.reply(reply);
                    } else {
                        return interaction.channel.send(reply.content);
                    }
            }
            
            if (isSlash) {
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in emergency command:', error);
            const errorMessage = 'There was an error while executing this command!';
            if (interaction.reply) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.channel.send(errorMessage);
            }
        }
    }
}; 