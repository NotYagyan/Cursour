const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const antiRaid = require('../../systems/antiRaid');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify yourself when in verification mode')
        .addStringOption(option =>
            option
                .setName('code')
                .setDescription('The verification code you received')
                .setRequired(true)),

    // Add aliases
    aliases: ['verifyuser', 'verification', 'v'],

    async execute(interaction) {
        const code = interaction.options.getString('code');
        const result = await antiRaid.verifyUser(interaction.member, code);

        let embed = new EmbedBuilder()
            .setTitle('Verification');

        if (result.success) {
            embed
                .setColor('#00FF00')
                .setDescription('✅ You have been successfully verified!')
                .addFields({ name: 'Access Granted', value: 'You now have access to the server channels.' });
        } else {
            embed.setColor('#FF0000');
            
            // Handle different error types
            switch (result.reason) {
                case 'NO_VERIFICATION_NEEDED':
                    embed.setDescription('❌ You do not need verification at this time.');
                    break;
                    
                case 'TOO_MANY_ATTEMPTS':
                    embed.setDescription('❌ Too many failed verification attempts.\nPlease contact a server administrator.');
                    break;
                    
                case 'INVALID_CODE':
                default:
                    embed.setDescription('❌ Invalid verification code. Please try again.');
                    break;
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    // Legacy command support
    async messageRun(message, args) {
        if (!args[0]) {
            return message.reply('❌ Please provide your verification code.');
        }

        const code = args[0];
        const result = await antiRaid.verifyUser(message.member, code);

        let embed = new EmbedBuilder()
            .setTitle('Verification');

        if (result.success) {
            embed
                .setColor('#00FF00')
                .setDescription('✅ You have been successfully verified!')
                .addFields({ name: 'Access Granted', value: 'You now have access to the server channels.' });
        } else {
            embed.setColor('#FF0000');
            
            // Handle different error types
            switch (result.reason) {
                case 'NO_VERIFICATION_NEEDED':
                    embed.setDescription('❌ You do not need verification at this time.');
                    break;
                    
                case 'TOO_MANY_ATTEMPTS':
                    embed.setDescription('❌ Too many failed verification attempts.\nPlease contact a server administrator.');
                    break;
                    
                case 'INVALID_CODE':
                default:
                    embed.setDescription('❌ Invalid verification code. Please try again.');
                    break;
            }
        }

        await message.reply({ embeds: [embed] });
    }
}; 