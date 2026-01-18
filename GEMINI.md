# GEMINI.md

This file provides guidance to the Gemini CLI when working with code in this repository.

## Project Overview

LingoLinq (formerly LingoLinq) is an open-source web-based AAC (Augmentative and Alternative Communication) application. It consists of a Rails backend and an Ember.js frontend, both contained in this monorepo. The system is deployed as a web app and packaged for mobile (iOS/Android) and desktop apps.

Key characteristics:

- Cloud-based with offline support via IndexedDB/SQLite
- Multi-device sync with automatic conflict resolution
- Supervisor/user permission model for therapy teams
- Uses Open Board Format (OBF) for board import/export
- Deployed on Render with background job processing via Resque

## ⚠️ CRITICAL: Node Version Management

**IMPORTANT: This project uses Node 20 by default, with Node 18 for Ember frontend!**

**Node version strategy:**

- **Node 20**: Root directory (default) - **REQUIRED for Gemini CLI** (you will crash with Node 18!)
- **Node 18**: `app/frontend` directory - **REQUIRED for Ember 3.16** (do NOT use Node 20!)

**Auto-switching via .nvmrc files:**

- Root `.nvmrc` contains `20` (default for Gemini CLI and general development)
- `app/frontend/.nvmrc` contains `18` (auto-switches when you `cd app/frontend`)

**Usage:**

```bash
# In root directory - Node 20 is active (for Gemini CLI)
nvm use  # Uses root .nvmrc (Node 20)

# When working with Ember frontend
cd app/frontend
nvm use  # Auto-switches to Node 18 via app/frontend/.nvmrc
npm install
ember serve

# Return to root
cd ../..
nvm use  # Back to Node 20
```

**Critical mistakes to avoid:**
- ❌ Running Gemini CLI with Node 18 (crashes: "SyntaxError: Invalid regular expression flags")
- ❌ Running frontend npm commands with Node 20 (subtle breakage)
- ✅ Use `nvm use` when changing directories to auto-switch based on .nvmrc files

See `node-version-guide.md` for complete reference.

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
render local

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

---

# Additional Gemini CLI Guidance for Multi‑System Stability

These rules extend the existing GEMINI.md and ensure stable behavior when Gemini interacts with Rails, Ember, Foreman, NVM, and long‑running processes inside the dev container. This section is designed to prevent interactive shell hangs, Node version regressions, and Foreman/Resque interference during Ember debugging.

## 6. Environment Rules (Node 20 for Gemini, Node 18 for Ember)

Gemini CLI itself requires Node 20, but the Ember app requires Node 18 until the upgrade reaches Ember 3.24.

Gemini must follow these rules:

### 6.1 When running Ember:
Gemini must always run Ember under Node 18 with the OpenSSL legacy provider:

export NVM_DIR="/usr/local/share/nvm"
. "$NVM_DIR/nvm.sh"
nvm use 18
export NODE_OPTIONS=--openssl-legacy-provider

### 6.2 When running Gemini CLI or unrelated commands:
nvm use 20

### 6.3 Gemini must never:
- Switch the global Node version
- Assume NVM is already loaded
- Run Ember under Node 20

---

## 7. Non‑Interactive Shell Rules (Prevents “Interactive shell awaiting input…”)

Gemini must never enter interactive shell mode.

If a command would block (e.g., ember server, foreman start, rails server, tail -f):

- Append & automatically
- Redirect output to a log file (e.g., /tmp/ember.log)
- Immediately return control
- Never wait for input
- Never pause in an interactive shell

Example pattern Gemini should use:

npx ember server --port 8184 --proxy http://127.0.0.1:5000 > /tmp/ember.log 2>&1 &
sleep 5

---

## 8. Foreman & Resque Safety Rules

Resque workers frequently crash in development mode due to Rails file‑watching.  
When Resque dies, Foreman kills Ember, causing port 8184 to never bind.

Gemini must:

- Disable all Resque workers during Ember debugging
- Never start Resque unless explicitly instructed
- Never assume Foreman should run all processes at once

Example safe Procfile state during Ember debugging:

# resque: ...
# resque_priority: ...
# resque_slow: ...

ember: sh -c 'export NVM_DIR="/usr/local/share/nvm" && \
  . "$NVM_DIR/nvm.sh" && \
  nvm use 18 && \
  cd ./app/frontend/ && \
  export NODE_OPTIONS=--openssl-legacy-provider && \
  npx ember server --port 8184 --proxy http://127.0.0.1:5000'

---

## 9. Render Simulation Pipeline (Deterministic)

Gemini should follow this exact sequence when simulating Render locally:

### 9.1 Kill all processes
pkill -f ember || true
pkill -f puma || true
pkill -f resque || true
pkill -f foreman || true
sleep 2

### 9.2 Start Ember alone (for debugging)
export NVM_DIR="/usr/local/share/nvm"
. "$NVM_DIR/nvm.sh"
nvm use 18
export NODE_OPTIONS=--openssl-legacy-provider
cd app/frontend
npx ember server --port 8184 --proxy http://127.0.0.1:5000 > /tmp/ember.log 2>&1 &
sleep 5

### 9.3 Verify Ember
curl -I http://localhost:8184/

### 9.4 Start Foreman (after Ember is stable)
foreman start > /tmp/foreman_app.log 2>&1 &
sleep 5

---

## 10. Command Execution Safety

Gemini must never:
- Invent flags
- Rewrite commands unless asked
- Kill processes unless explicitly instructed
- Re-run db:seed
- Stream large logs unless asked
- Use tail -f
- Enter interactive shells

Gemini must:
- Use sleep 2, sleep 5, or sleep 20 only
- Redirect logs to /tmp/*.log
- Confirm process status with ps aux

---

## 11. Debugging Rules

Gemini must:
- Diagnose before acting
- Ask before modifying files
- Provide diffs before applying changes
- Check Node version first
- Check Foreman process group behavior
- Check for Resque crashes
- Recognize that Ember router errors often indicate Node 20 build corruption

---
