const { Events } = require('discord.js');
const antiRaid = require('../../systems/antiRaid');
const antiNuke = require('../../systems/antiNuke');

module.exports = {
    name: Events.GuildMemberAdd,
    once: false,
    async execute(member) {
        try {
            // Process member join for anti-raid protection
            if (member.guild && !member.user.bot) {
                await antiRaid.handleJoin(member);
            }
            
            // Process bot join for anti-nuke protection
            if (member.guild && member.user.bot) {
                // Fetch audit logs to find who added the bot
                await antiNuke.handleBotAdd(member.guild, member);
            }
        } catch (error) {
            console.error('Error in guildMemberAdd event:', error);
        }
    }
}; 