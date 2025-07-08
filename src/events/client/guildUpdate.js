const { Events } = require('discord.js');
const antiNuke = require('../../systems/antiNuke');

module.exports = {
    name: Events.GuildUpdate,
    once: false,
    async execute(oldGuild, newGuild) {
        try {
            // Check for significant guild changes like name, icon, etc.
            if (
                oldGuild.name !== newGuild.name || 
                oldGuild.iconURL() !== newGuild.iconURL() ||
                oldGuild.verificationLevel !== newGuild.verificationLevel ||
                oldGuild.explicitContentFilter !== newGuild.explicitContentFilter ||
                oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications
            ) {
                await antiNuke.handleGuildUpdate(newGuild);
            }
        } catch (error) {
            console.error('Error in guildUpdate event:', error);
        }
    }
}; 