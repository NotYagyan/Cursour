require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Check if required environment variables are set
if (!process.env.TOKEN) {
    console.error('ERROR: Discord bot token is not set in .env file!');
    process.exit(1);
}

console.log('Starting Discord bot...');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
    ]
});

// Collections
client.commands = new Collection();
client.buttons = new Collection();
client.selectMenus = new Collection();
client.modals = new Collection();
client.cooldowns = new Collection();
client.tickets = new Collection();

// Whitelist system for prefixless commands
// Use WHITELISTED_USERS for global prefixless command whitelist
client.whitelistedUsers = process.env.WHITELISTED_USERS?.split(',').filter(id => id.trim() !== '') || [];
console.log('Global prefixless command whitelist users:', client.whitelistedUsers);

// Load handlers
console.log('Loading command and event handlers...');
const handlersPath = path.join(__dirname, 'handlers');
const handlerFiles = fs.readdirSync(handlersPath).filter(file => file.endsWith('.js'));

for (const file of handlerFiles) {
    console.log(`Loading handler: ${file}`);
    require(`./handlers/${file}`)(client);
}

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

client.on('error', (error) => {
    console.error('Discord client error:', error);
});

// Ready event
client.once(Events.ClientReady, () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
    console.log(`Serving ${client.guilds.cache.size} servers`);
    console.log(`Loaded ${client.commands.size} commands`);
});

// Debug events
client.on('debug', (info) => {
    if (process.env.DEBUG === 'true') {
        console.log('Debug:', info);
    }
});

// Login
console.log('Attempting to log in to Discord...');
client.login(process.env.TOKEN)
    .then(() => console.log('Successfully logged in to Discord!'))
    .catch(error => {
        console.error('Failed to log in to Discord:', error);
        process.exit(1);
    }); 