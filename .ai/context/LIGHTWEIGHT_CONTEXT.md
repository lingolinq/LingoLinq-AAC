# LingoLinq AAC - Quick Context

## What This Is
Web-based AAC (Augmentative and Alternative Communication) app for people who need help communicating through speech synthesis and communication boards.

## Architecture
- **Backend**: Rails API
- **Frontend**: Ember.js app  
- **Mobile**: Cordova/Electron packages
- **Database**: PostgreSQL + Redis

## Key Features
- Cloud-synced communication boards
- Multi-device support
- Supervisor/team coordination
- Real-time collaboration
- Offline capability

## Development Stack
- Ruby 3.2.8+, Node.js 18+
- Rails + Ember + PostgreSQL + Redis
- Docker support available

## Quick Commands
- `./bin/devin ask` - Use this lightweight context (~200 tokens)
- `./bin/devin ask-full` - Use full project context (~4K tokens)
- `./bin/devin validate` - Check AI CLI setup

For detailed context, use `ask-full` command.