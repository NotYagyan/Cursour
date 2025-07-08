const { Events, AuditLogEvent } = require('discord.js');
const antiNuke = require('../../systems/antiNuke');

module.exports = {
    name: Events.GuildAuditLogEntryCreate,
    once: false,
    async execute(auditLogEntry, guild) {
        try {
            switch (auditLogEntry.action) {
                case AuditLogEvent.MemberBan:
                    await antiNuke.handleBan(guild);
                    break;
                case AuditLogEvent.MemberKick:
                    await antiNuke.handleKick(guild);
                    break;
                case AuditLogEvent.RoleDelete:
                    await antiNuke.handleRoleDelete(guild);
                    break;
                case AuditLogEvent.ChannelDelete:
                    await antiNuke.handleChannelDelete(guild);
                    break;
                case AuditLogEvent.WebhookDelete:
                    await antiNuke.handleWebhookDelete(guild);
                    break;
                case AuditLogEvent.EmojiDelete:
                    await antiNuke.handleEmojiDelete(guild);
                    break;
                case AuditLogEvent.GuildUpdate:
                    await antiNuke.handleGuildUpdate(guild);
                    break;
                case AuditLogEvent.RoleUpdate:
                    // Need to get old role and new role for this event
                    if (auditLogEntry.changes?.find(change => change.key === 'permissions')) {
                        // We need to reconstruct the roles to pass to the handler
                        // This isn't perfect but works for our needs
                        const oldPerms = BigInt(auditLogEntry.changes.find(c => c.key === 'permissions').old || '0');
                        const newPerms = BigInt(auditLogEntry.changes.find(c => c.key === 'permissions').new || '0');
                        
                        const oldRole = { permissions: { has: (perm) => (oldPerms & perm) === perm } };
                        const newRole = { permissions: { has: (perm) => (newPerms & perm) === perm } };
                        
                        await antiNuke.handleRoleUpdate(guild, oldRole, newRole);
                    }
                    break;
                case AuditLogEvent.MemberRoleUpdate:
                    // We need member objects to compare, but we only have the audit log entry
                    // Let's try to reconstruct what we need
                    if (auditLogEntry.target) {
                        try {
                            const member = await guild.members.fetch(auditLogEntry.target.id);
                            
                            // Create a synthetic "old member" object for comparison
                            // Based on the roles that were added/removed in the audit log
                            const oldRoleIds = new Set(member.roles.cache.map(r => r.id));
                            
                            // Find changes to roles
                            const addedRoles = auditLogEntry.changes?.filter(c => c.key === '$add') || [];
                            const removedRoles = auditLogEntry.changes?.filter(c => c.key === '$remove') || [];
                            
                            // For old member, remove added roles and add back removed roles
                            for (const change of addedRoles) {
                                for (const role of change.new) {
                                    oldRoleIds.delete(role.id);
                                }
                            }
                            
                            for (const change of removedRoles) {
                                for (const role of change.new) {
                                    oldRoleIds.add(role.id);
                                }
                            }
                            
                            // Create old member object with role cache for comparison
                            const oldMember = {
                                roles: {
                                    cache: new Map([...oldRoleIds].map(id => {
                                        const role = guild.roles.cache.get(id);
                                        return [id, role];
                                    }))
                                }
                            };
                            
                            await antiNuke.handleMemberRoleUpdate(guild, oldMember, member);
                        } catch (error) {
                            console.error('Error handling member role update:', error);
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Error in guildAuditLogEntryCreate event:', error);
        }
    }
}; 