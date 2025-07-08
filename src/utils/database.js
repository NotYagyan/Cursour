const fs = require('fs');
const path = require('path');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Database file paths
const GUILD_CONFIG_FILE = path.join(dataDir, 'guildConfig.json');
const TICKETS_FILE = path.join(dataDir, 'tickets.json');

// Initialize files if they don't exist
function initializeFiles() {
    if (!fs.existsSync(GUILD_CONFIG_FILE)) {
        fs.writeFileSync(GUILD_CONFIG_FILE, '{}');
    }
    if (!fs.existsSync(TICKETS_FILE)) {
        fs.writeFileSync(TICKETS_FILE, '{}');
    }
}

// Initialize on startup
initializeFiles();

// Guild Config Methods
const GuildConfig = {
    async findOne({ guildId }) {
        const configs = JSON.parse(fs.readFileSync(GUILD_CONFIG_FILE, 'utf-8'));
        return configs[guildId] || null;
    },

    async create(data) {
        const configs = JSON.parse(fs.readFileSync(GUILD_CONFIG_FILE, 'utf-8'));
        configs[data.guildId] = {
            guildId: data.guildId,
            antiNuke: {
                enabled: true,
                maxBans: 3,
                maxKicks: 5,
                maxRoleDeletes: 2,
                maxChannelDeletes: 2,
                actionThreshold: 5000,
                punishment: 'STRIP_ROLES'
            },
            antiRaid: {
                enabled: true,
                joinThreshold: 10,
                joinTime: 10000,
                action: 'VERIFICATION'
            },
            ticketSystem: {
                enabled: true,
                categoryId: null,
                logsChannelId: null,
                supportRoles: []
            },
            musicSystem: {
                defaultVolume: 50,
                maxQueueSize: 100,
                djRoles: []
            },
            moderation: {
                muteRole: null,
                modLogChannel: null,
                autoModEnabled: true,
                autoModActions: {
                    spam: true,
                    massMention: true,
                    massCaps: true,
                    links: false
                }
            }
        };
        fs.writeFileSync(GUILD_CONFIG_FILE, JSON.stringify(configs, null, 2));
        return configs[data.guildId];
    },

    async set(guildId, data) {
        const configs = JSON.parse(fs.readFileSync(GUILD_CONFIG_FILE, 'utf-8'));
        configs[guildId] = data;
        fs.writeFileSync(GUILD_CONFIG_FILE, JSON.stringify(configs, null, 2));
        return data;
    }
};

// Ticket Methods
const Ticket = {
    async findOne(query) {
        const tickets = JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf-8'));
        return Object.values(tickets).find(ticket => 
            Object.entries(query).every(([key, value]) => ticket[key] === value)
        ) || null;
    },

    async create(data) {
        const tickets = JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf-8'));
        const ticket = {
            ...data,
            createdAt: new Date().toISOString(),
            status: 'OPEN',
            transcript: []
        };
        tickets[data.ticketId] = ticket;
        fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2));
        return ticket;
    }
};

module.exports = {
    GuildConfig,
    Ticket
}; 