const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription("Display a user's avatar")
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to view')
                .setRequired(false)
        ),
    aliases: ['pfp'],
    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${user.tag}'s Avatar`)
            .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }));
        await interaction.reply({ embeds: [embed] });
    },
    async messageRun(message) {
        const user = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${user.tag}'s Avatar`)
            .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }));
        await message.reply({ embeds: [embed] });
    }
};
