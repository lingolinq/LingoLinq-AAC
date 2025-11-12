# GEMINI.md

This file provides guidance to the Gemini CLI when working with code in this repository.

## Project Overview

LingoLinq (formerly CoughDrop) is an open-source web-based AAC (Augmentative and Alternative Communication) application. It consists of a Rails backend and an Ember.js frontend, both contained in this monorepo. The system is deployed as a web app and packaged for mobile (iOS/Android) and desktop apps.

Key characteristics:
- Cloud-based with offline support via IndexedDB/SQLite
- Multi-device sync with automatic conflict resolution
- Supervisor/user permission model for therapy teams
- Uses Open Board Format (OBF) for board import/export
- Deployed on Heroku with background job processing via Resque

## Development Commands

### Backend (Rails)

**Setup:**
```bash
# Install dependencies
bundle install

# Setup database (requires Postgres and Redis running)
rails extras:assert_js  # Fixes symbolic links
rails db:create
rails db:migrate
rails db:seed  # Optional: creates example user (username: example, password: password)
```

**Running servers:**
```bash
# Fresh start (kills existing processes, checks dependencies, starts all services)
bin/fresh_start

# Or manually:
# Development with all processes (recommended)
foreman start
# or
heroku local

# Stop all running processes
bin/kill_all

# Single process (backend only, frontend won't work)
rails server

# Background jobs (Resque workers)
env QUEUES=priority,default,slow INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work
```

**Testing:**
```bash
# Run all specs
bundle exec rspec

# Run specific spec file
bundle exec rspec spec/models/user_spec.rb

# Run specific test
bundle exec rspec spec/models/user_spec.rb:42
```

### Frontend (Ember)

**Setup:**
```bash
cd app/frontend
npm install
bower install
```

**Running:**
```bash
cd app/frontend
ember serve  # Runs on port 8184, auto-compiles on changes
```

**Testing:**
```bash
cd app/frontend
ember test
```

## Gemini CLI Tips and Tricks

### 1. Master Project Context with `GEMINI.md`
- **Persistent Context:** This file (`GEMINI.md`) provides persistent context for all AI interactions. It defines the tech stack, coding style, testing conventions, and project-specific guidelines.
- **Initialization:** Use the `/init` slash command to quickly generate a starter `GEMINI.md` file, which you can then edit and expand.
- **Modular Context:** For large projects, break down context into multiple files and include them in your main `GEMINI.md` using `@include` syntax (e.g., `@./docs/prompt-guidelines.md`).

### 2. Create Custom Commands
- **Streamline Repetitive Tasks:** Transform complex, multi-step prompts into simple Gemini CLI commands by creating custom shortcuts.
- **TOML Files:** Create TOML files in your `.gemini/commands/` directory for frequently used operations. These files define the command's description and the prompt it executes.

### 3. Utilize Memory Management and Checkpoints
- **Memory for Quick Context:** Use `/memory add` for fast notes, such as database port numbers or API URLs, to quickly update Gemini's memory without editing `GEMINI.md`.
- **View and Refresh Context:** Use `/memory show` to view the current context and `/memory refresh` to update it.
- **Safe Experimentation:** Enable checkpointing in your `settings.json` file. This acts like a "save button" before Gemini makes changes, allowing you to use the `/restore` command to roll back to a previous working version if needed.

### 4. Optimize Prompts and Interactions
- **Open Project Folder First:** Always launch Gemini CLI from within your project folder to ensure it has the correct view of your code and loads the appropriate `GEMINI.md` file.
- **Craft Clear, Specific Prompts:** Be specific and actionable in your prompts to get the best results. For example, "Generate a React hook for form validation with Zod" is better than "make a form."
- **Ask for a Plan:** Before making changes, ask Gemini to generate a plan. This helps you understand what it intends to do and allows you to adjust the plan if necessary.
- **Shell Mode:** Use shell mode (by typing `!`) for quick terminal commands within the Gemini CLI.
- **Web Search:** Utilize the built-in `@search` tool to fetch information from the web or specific URLs.
- **Non-Interactive Mode:** For one-off terminal tasks, use `gemini -p <prompt>` to get a single, focused response without launching a persistent session.

### 5. Security and Best Practices
- **Sensitive Data:** Never include API keys or passwords directly in prompts. Use environment variables and reference them symbolically.
- **Trusted Folders:** Understand and utilize the Trusted Folders security feature to control execution policies by folder.
