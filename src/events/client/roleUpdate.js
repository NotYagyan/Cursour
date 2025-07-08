const { Events } = require('discord.js');
const antiNuke = require('../../systems/antiNuke');

module.exports = {
    name: Events.RoleUpdate,
    once: false,
    async execute(oldRole, newRole) {
        try {
            if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
                // Permission changes detected - check for suspicious activity
                await antiNuke.handleRoleUpdate(oldRole.guild, oldRole, newRole);
            }
        } catch (error) {
            console.error('Error in roleUpdate event:', error);
        }
    }
}; 