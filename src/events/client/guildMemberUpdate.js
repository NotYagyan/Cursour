const { Events } = require('discord.js');
const antiNuke = require('../../systems/antiNuke');

module.exports = {
    name: Events.GuildMemberUpdate,
    once: false,
    async execute(oldMember, newMember) {
        try {
            if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
                // Role changes detected - check for suspicious activity
                await antiNuke.handleMemberRoleUpdate(oldMember.guild, oldMember, newMember);
            }
        } catch (error) {
            console.error('Error in guildMemberUpdate event:', error);
        }
    }
}; 