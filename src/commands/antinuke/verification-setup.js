const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { GuildConfig } = require('../../utils/database');
const antiRaid = require('../../systems/antiRaid');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verification-setup')
        .setDescription('Set up a verification panel with a button')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to send verification panel')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('title')
                .setDescription('Panel title')
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('description')
                .setDescription('Panel description')
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('button_text')
                .setDescription('Text to display on the verification button')
                .setRequired(false)),

    // Add aliases
    aliases: ['verificationsetup', 'verifypanel', 'setupverify', 'verificationpanel'],

    async execute(interaction) {
        // Check if user has permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ 
                content: '❌ You need Manage Server permission to use this command.', 
                ephemeral: true 
            });
        }

        const channel = interaction.options.getChannel('channel');
        const title = interaction.options.getString('title') || '🔒 Server Verification';
        const description = interaction.options.getString('description') || 
            'To access this server, please click the button below to verify yourself.\n\n' +
            'This helps us protect the server from automated raids and ensures a safe community for everyone.';
        const buttonText = interaction.options.getString('button_text') || '✅ Verify';

        // Get or create guild config
        let config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        if (!config) {
            config = { guildId: interaction.guild.id };
        }

        // Ensure anti-raid config exists
        if (!config.antiRaid) {
            config.antiRaid = {
                enabled: false,
                joinThreshold: 10,
                joinTime: 30000,
                minAccountAge: 7 * 24 * 60 * 60 * 1000,
                newAccountThreshold: 5,
                similarNameThreshold: 0.8,
                action: 'VERIFICATION',
                raidModeCooldown: 30 * 60 * 1000,
                expiredVerificationAction: 'NONE',
                maxFailedVerificationAction: 'NONE'
            };
        }

        // Save verification channel in config
        config.antiRaid.verificationChannelId = channel.id;
        await GuildConfig.set(interaction.guild.id, config);

        // Create verification embed
        const verificationEmbed = new EmbedBuilder()
            .setColor('#2B65EC')
            .setTitle(title)
            .setDescription(description)
            .setFooter({ text: `${interaction.guild.name} • Verification System` })
            .setTimestamp();

        // Create verification button
        const verifyButton = new ButtonBuilder()
            .setCustomId('verification_button')
            .setLabel(buttonText)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅');

        // Create action row with button
        const actionRow = new ActionRowBuilder().addComponents(verifyButton);

        try {
            // Send verification panel to selected channel
            const verificationMessage = await channel.send({ 
                embeds: [verificationEmbed], 
                components: [actionRow] 
            });

            // Store message ID in guild config for reference
            config.antiRaid.verificationMessageId = verificationMessage.id;
            await GuildConfig.set(interaction.guild.id, config);

            // Confirm setup success
            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Verification Panel Setup')
                .setDescription(`The verification panel has been successfully set up in ${channel}.`)
                .addFields(
                    { name: 'Configuration', value: 'Users will need to click the verify button to begin the verification process.' }
                );

            await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        } catch (error) {
            console.error('Error in verification setup:', error);
            await interaction.reply({ 
                content: `❌ An error occurred while setting up the verification panel: ${error.message}`, 
                ephemeral: true 
            });
        }
    },

    // Legacy command support
    async messageRun(message, args) {
        // Check if user has permissions
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ You need Manage Server permission to use this command.');
        }

        let channelMention = args[0];
        if (!channelMention) {
            return message.reply('❌ Please specify a channel: `verification-setup #channel [title] [description] [button_text]`');
        }

        // Extract channel ID from mention or use the ID directly
        let channelId = channelMention.replace(/[<#>]/g, '');
        const channel = message.guild.channels.cache.get(channelId);
        
        if (!channel) {
            return message.reply('❌ Invalid channel. Please provide a valid channel mention or ID.');
        }

        // Parse optional arguments
        const title = args[1] || '🔒 Server Verification';
        const description = args[2] || 
            'To access this server, please click the button below to verify yourself.\n\n' +
            'This helps us protect the server from automated raids and ensures a safe community for everyone.';
        const buttonText = args[3] || '✅ Verify';

        // Get or create guild config
        let config = await GuildConfig.findOne({ guildId: message.guild.id });
        if (!config) {
            config = { guildId: message.guild.id };
        }

        // Ensure anti-raid config exists
        if (!config.antiRaid) {
            config.antiRaid = {
                enabled: false,
                joinThreshold: 10,
                joinTime: 30000,
                minAccountAge: 7 * 24 * 60 * 60 * 1000,
                newAccountThreshold: 5,
                similarNameThreshold: 0.8,
                action: 'VERIFICATION',
                raidModeCooldown: 30 * 60 * 1000,
                expiredVerificationAction: 'NONE',
                maxFailedVerificationAction: 'NONE'
            };
        }

        // Save verification channel in config
        config.antiRaid.verificationChannelId = channel.id;
        await GuildConfig.set(message.guild.id, config);

        // Create verification embed
        const verificationEmbed = new EmbedBuilder()
            .setColor('#2B65EC')
            .setTitle(title)
            .setDescription(description)
            .setFooter({ text: `${message.guild.name} • Verification System` })
            .setTimestamp();

        // Create verification button
        const verifyButton = new ButtonBuilder()
            .setCustomId('verification_button')
            .setLabel(buttonText)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅');

        // Create action row with button
        const actionRow = new ActionRowBuilder().addComponents(verifyButton);

        try {
            // Send verification panel to selected channel
            const verificationMessage = await channel.send({ 
                embeds: [verificationEmbed], 
                components: [actionRow] 
            });

            // Store message ID in guild config for reference
            config.antiRaid.verificationMessageId = verificationMessage.id;
            await GuildConfig.set(message.guild.id, config);

            // Confirm setup success
            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Verification Panel Setup')
                .setDescription(`The verification panel has been successfully set up in ${channel}.`)
                .addFields(
                    { name: 'Configuration', value: 'Users will need to click the verify button to begin the verification process.' }
                );

            await message.reply({ embeds: [successEmbed] });
        } catch (error) {
            console.error('Error in verification setup:', error);
            await message.reply(`❌ An error occurred while setting up the verification panel: ${error.message}`);
        }
    }
}; 