# Advanced Discord Bot

A full-featured Discord bot with advanced security, ticket system, music commands, and utility features.

## Features

### Enhanced Anti-Nuke System
The bot includes a powerful anti-nuke system to protect against malicious actions:

- **Protection Against:**
  - Mass bans, kicks, and pruning of members
  - Channel and role deletions
  - Webhook deletions
  - Emoji deletions
  - Mass mentions/pings
  - Dangerous permission changes
  - Bot additions
  - Server setting changes

- **Security Features:**
  - Customizable thresholds for each action type
  - Multiple punishment options (Ban, Kick, Strip Roles, Quarantine)
  - User whitelisting system
  - Detailed audit logs
  - Emergency lockdown mode
  - Quarantine system for suspicious users

- **Anti-Raid Protection:**
  - Join rate limiting
  - New account detection
  - Username similarity detection
  - Verification challenges
  - Automatic raid mode

### Ticket System
- Create support tickets
- Customizable ticket categories
- Staff role assignment
- Ticket claiming system
- Ticket transcripts

### Music System
- Play music from YouTube and other sources
- Queue management
- Volume control
- Skip, pause, resume controls

### Utility Tools
- Configure prefixes and command rules
- Detailed interactive help menu
- Quick utilities like ping and server info

## Commands

### Anti-Nuke Commands
- `/antinuke enable` - Enable anti-nuke protection
- `/antinuke disable` - Disable anti-nuke protection
- `/antinuke status` - View current anti-nuke status and settings
- `/antinuke config` - Configure anti-nuke settings
- `/antinukelogs` - View anti-nuke system logs
- `/antinukewhitelist add/remove/list` - Manage whitelisted users
- `/emergency enable/disable` - Manage emergency mode
- `/quarantine add/release/list` - Manage quarantined users

### Anti-Raid Commands
- `/antiraid enable/disable` - Enable/disable anti-raid protection
- `/antiraid settings` - Configure anti-raid settings
- `/verify` - Verify a user

### Ticket Commands
- `/ticket create` - Create a new ticket
- `/ticket close` - Close a ticket
- `/ticket list` - List all tickets
- `/ticket setup` - Configure ticket system

### Music Commands
- `/play` - Play a song
- `/stop` - Stop the music
- `/skip` - Skip the current song
- `/queue` - View the music queue
- `/volume` - Adjust the volume

### Utility Commands
- `/help` - Display command list and details
- `/rules` - Configure prefixes and command permissions
- `/ping` - Check bot latency
- `/serverinfo` - Show information about the current server

## Setup
1. Create a `.env` file with your bot token:
```
TOKEN=your_bot_token
BOT_OWNER_ID=your_discord_id
WHITELISTED_USERS=comma_separated_user_ids
```

2. Install dependencies:
```
npm install
```

3. Start the bot:
```
npm start
``` 