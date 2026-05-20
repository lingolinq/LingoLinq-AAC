# AI Infrastructure Audit

**Date:** 2026-02-24
**Author:** AI Infra Audit Team (Claude Code Agent Team)
**Scope:** Full local environment scan — WSL2 Ubuntu + Mounted Windows drive

---

## Executive Summary

Your AI infrastructure spans **4 runtime environments** (WSL2 Ubuntu, Windows native, Windows Claude Desktop, Claude.ai cloud) with **5 AI tools** installed, **42 plugins**, and **25 unique MCP connections** configured across multiple config files. There is significant **duplication** — the same MCP servers are declared in up to **4 separate config files** (Claude Code WSL, Gemini CLI WSL, Windows Claude Desktop, Windows Gemini CLI). Additionally, 11 custom Claude Code skills, 15 plugin-based skills, and a custom Python-based MCP server (antigravity-mcp) exist across the environment.

### Key Findings
- **Config sprawl**: 4 near-identical MCP config files across environments (WSL + Windows x2 tools each)
- **CRITICAL SECURITY**: Windows-side Gemini `settings.json` contains **hardcoded plaintext API keys** (GitHub PAT, Render key, n8n JWT, Perplexity key) — WSL Claude Code correctly uses `${ENV_VAR}` references
- **MODERATE SECURITY**: Windows `settings.local.json` contains a plaintext Render DB connection string with password
- **Deprecated dependency**: `@modelcontextprotocol/server-github@2025.4.8` is marked **deprecated** on npm
- **SDK version fragmentation**: MCP SDK versions range from 1.0.1 to 1.27.0 across cached servers
- **No global MCP packages installed** — all servers run via `npx -y` (on-demand) or `uvx`, with 8 cached in `~/.npm/_npx/`
- **Custom MCP**: antigravity-mcp (FastMCP + Python) lives inside the project repo
- **11 custom project skills** (7 in LingoLinq project + 4 in Windows Claude Desktop)
- **42 plugins**: 13 external + 29 internal in Claude Code marketplace
- **Gemini ecosystem**: Full Antigravity agent infrastructure with brain, conversations, knowledge tracking, and Windsurf IDE extensions
- **Claude.ai connectors**: 12 cloud-only MCPs (Mermaid Chart, Jotform, Notion, Figma, HubSpot, Hugging Face, Slack, Gmail, Sentry, Google Calendar, Canva, Zapier)
- **Shared agent memory**: Cross-tool memory file at `~/lingolinq/agent_memory.json` referenced by both Windows Claude Desktop and `~/.config/claude/`
- **Sync script exists**: `~/bin/sync-ai-configs.sh` syncs CLAUDE.md → GEMINI.md (but does NOT sync MCP configs)

---

## Visual Infrastructure Map

```
/home/scotw/  (WSL2 Ubuntu — Primary Dev Environment)
│
├── .claude.json ★ PRIMARY CONFIG — 13 MCP servers defined here
│   ├── mcpServers:
│   │   ├── github ............. @modelcontextprotocol/server-github (npx)
│   │   ├── render ............. https://mcp.render.com/mcp (HTTP)
│   │   ├── deepwiki ........... https://mcp.deepwiki.com/mcp (HTTP)
│   │   ├── n8n-mcp ............ n8n-mcp (npx)
│   │   ├── filesystem ......... @modelcontextprotocol/server-filesystem (npx)
│   │   ├── sequential-thinking  @modelcontextprotocol/server-sequential-thinking (npx)
│   │   ├── notion ............. mcp-remote → https://mcp.notion.com/mcp (npx)
│   │   ├── aws-mcp ............ mcp-proxy-for-aws (uvx, Python)
│   │   ├── perplexity ......... @perplexity-ai/mcp-server (npx)
│   │   ├── chrome-devtools .... chrome-devtools-mcp (npx)
│   │   ├── postgres-dev ....... @anthropic-ai/mcp-server-postgres (npx)
│   │   ├── playwright ......... @playwright/mcp (npx)
│   │   └── docker ............. @modelcontextprotocol/server-docker (npx)
│   ├── oauthAccount: scotwahlquist@gmail.com
│   └── projects:
│       ├── /home/scotw
│       └── /mnt/c/Users/scotw/Projects/LingoLinq-AAC
│
├── .claude/
│   ├── settings.json ......... {skipDangerousModePermissionPrompt, AGENT_TEAMS=1}
│   ├── .credentials.json ..... OAuth credentials (SENSITIVE)
│   ├── projects/
│   │   ├── -home-scotw/
│   │   │   ├── memory/
│   │   │   │   ├── MEMORY.md .............. Auto-memory (loaded every session)
│   │   │   │   ├── mcp-architecture.md .... MCP strategy & security zones
│   │   │   │   └── compliance-strategy.md . FERPA/HIPAA approach
│   │   │   └── [session-uuid].jsonl ....... Session transcripts (7 sessions)
│   │   └── -mnt-c-Users-scotw-Projects-LingoLinq-AAC/
│   │       └── [session-uuid].jsonl ....... Session transcripts (2 sessions)
│   ├── backups/
│   ├── cache/
│   ├── debug/
│   ├── file-history/
│   ├── history.jsonl
│   ├── paste-cache/
│   ├── plans/
│   ├── plugins/
│   ├── session-env/
│   ├── shell-snapshots/
│   ├── tasks/ ................ Agent team task tracking
│   ├── teams/ ................ Agent team configs
│   ├── telemetry/
│   └── todos/
│
├── .gemini/
│   ├── settings.json ★ GEMINI MCP CONFIG — 13 MCP servers (mirrors .claude.json)
│   │   └── mcpServers: [same 13 as Claude Code, using uvx for aws-mcp]
│   ├── GEMINI.md ............. (empty)
│   ├── projects.json
│   ├── trustedFolders.json
│   ├── google_accounts.json
│   ├── oauth_creds.json
│   ├── state.json
│   ├── installation_id
│   ├── antigravity/ .......... Gemini's Antigravity Agent System
│   │   ├── installation_id
│   │   ├── mcp_config.json ... (empty)
│   │   ├── knowledge/
│   │   │   └── knowledge.lock
│   │   ├── brain/
│   │   │   └── 5314e1b9.../
│   │   │       ├── task.md (+ .resolved, .resolved.0, .resolved.1, .metadata.json)
│   │   │       └── walkthrough.md (+ .resolved, .resolved.0, .metadata.json)
│   │   ├── conversations/
│   │   │   ├── 30765f81-....pb
│   │   │   └── 5314e1b9-....pb
│   │   ├── implicit/
│   │   │   ├── 49852a89-....pb
│   │   │   └── 79a30793-....pb
│   │   └── code_tracker/
│   │       └── active/LingoLinq-AAC_.../
│   │           └── 7eecf316..._.env.example
│   ├── history/
│   │   ├── lingolinq-aac/.project_root
│   │   └── scotw/.project_root
│   └── tmp/
│       ├── bin/rg ............. Bundled ripgrep binary
│       ├── lingolinq-aac/.project_root
│       └── scotw/
│           ├── .project_root
│           ├── logs.json
│           └── chats/
│               └── session-2026-02-2*.json (7 sessions)
│
├── .nvm/versions/node/v20.20.0/
│   └── lib/
│       ├── @anthropic-ai/claude-code@2.1.50 ... ★ Claude Code CLI
│       ├── @google/gemini-cli@0.29.7 ........... ★ Gemini CLI
│       ├── npm@11.10.1
│       └── corepack@0.34.1
│
├── .config/claude/
│   └── memory.json ...................... Shared agent memory config
│       └── points to ~/lingolinq/agent_memory.json
│
├── .mcp-auth/mcp-remote-0.1.37/ ........ OAuth client for Notion MCP remote
│   └── tokens + client config (client_id: zllJpWcEUfrXAZto)
│
├── .n8n-mcp/
│   └── telemetry.json .................. n8n-mcp v2.35.4, userId tracked
│
├── .antigravity-server/ ................. Antigravity/Gemini IDE (Windsurf)
│   ├── binary v1.18.3
│   └── extensions/
│       ├── chrome-devtools-mcp
│       └── antigravity schemas (mcp_config.schema.json)
│
├── .local/bin/
│   └── uvx .................................. Python package runner (for aws-mcp)
│
└── .npm/_npx/ ............................... npx cache (8 MCP servers cached)
    ├── chrome-devtools-mcp@0.17.3
    ├── @modelcontextprotocol/server-github@2025.4.8 (⚠ DEPRECATED)
    ├── @perplexity-ai/mcp-server@0.8.2
    ├── mcp-remote@0.1.38
    ├── @playwright/mcp@0.0.68
    ├── @modelcontextprotocol/server-filesystem@2026.1.14
    ├── n8n-mcp@2.35.5
    └── @modelcontextprotocol/server-sequential-thinking@2025.12.18


/mnt/c/Users/scotw/  (Windows — Mounted via WSL2)
│
├── AppData/Roaming/Claude/
│   ├── claude_desktop_config.json ★ WINDOWS DESKTOP MCP CONFIG
│   │   └── mcpServers: (10 servers — same set minus postgres-dev, docker, playwright)
│   │       ├── github ............. C:\Program Files\nodejs\npx.cmd
│   │       ├── render ............. npx mcp-remote → https://mcp.render.com/mcp
│   │       ├── deepwiki ........... npx mcp-remote → https://mcp.deepwiki.com/mcp
│   │       ├── n8n-mcp ............ npx n8n-mcp
│   │       ├── filesystem ......... npx → C:\Users\scotw\Projects
│   │       ├── sequential-thinking  npx @modelcontextprotocol/server-sequential-thinking
│   │       ├── notion ............. npx mcp-remote → https://mcp.notion.com/mcp
│   │       ├── aws-mcp ............ C:\Users\scotw\.local\bin\uvx.exe
│   │       ├── perplexity ......... npx @perplexity-ai/mcp-server
│   │       └── chrome-devtools .... npx chrome-devtools-mcp
│   └── config/
│       └── memory.json ............ Shared agent memory → \\wsl.localhost\Ubuntu\home\scotw\lingolinq\agent_memory.json
│
├── .claude/ ★ WINDOWS-SIDE CLAUDE CODE CONFIG
│   ├── CLAUDE.md .................. Global AI agent instructions (66 lines, synced to GEMINI.md)
│   ├── settings.json .............. github plugin enabled, autoUpdates: latest, effortLevel: medium
│   ├── settings.local.json ........ 86 permission allow-list entries (⚠ contains DB connection string)
│   ├── .credentials.json .......... OAuth tokens (access + refresh + Notion MCP OAuth)
│   ├── skills/ ★ 4 WINDOWS-SIDE SKILLS
│   │   ├── code-review/
│   │   ├── git-workflow/
│   │   ├── quick-research/
│   │   └── startup-ops/
│   ├── projects/
│   │   ├── C--Users-scotw/ ........ Home project
│   │   ├── LingoLinq-AAC/ ......... Main project + 3 worktrees (practical-gates, dazzling-borg, lucid-benz)
│   │   ├── C--windows-system32/
│   │   └── antigravity-playground/
│   └── [backups, cache, debug, downloads, file-history, ide,
│        paste-cache, plans, plugins, shell-snapshots, statsig,
│        tasks, telemetry, todos]
│
├── .gemini/ ★ WINDOWS GEMINI CLI CONFIG
│   ├── settings.json .............. 10 MCPs (⚠ HARDCODED PLAINTEXT API KEYS — see Security)
│   ├── GEMINI.md .................. Synced copy of CLAUDE.md (66 lines)
│   ├── projects.json
│   ├── antigravity/ + antigravity-browser-profile/
│   └── [oauth_creds, google_accounts, state, trustedFolders]
│
├── .vscode/extensions/ ★ VS CODE AI EXTENSIONS
│   ├── anthropic.claude-code@2.1.49 ........... Claude Code extension
│   ├── google.gemini-cli-vscode-ide-companion@0.20.0
│   ├── saoudrizwan.claude-dev@3.66.0 .......... Cline (bundles MCP SDK)
│   ├── ms-azuretools.vscode-azure-mcp-server@1.0.1
│   ├── github.copilot-chat@0.37.7
│   ├── eamodio.gitlens@17.10.1
│   ├── ms-windows-ai-studio.windows-ai-studio@0.30.1
│   └── continue.continue (empty globalStorage)
│
├── .continue/ ★ CONTINUE AI CONFIG
│   ├── config.yaml ................ v1.0.0, empty models list
│   ├── config.ts .................. Custom system message (Notion Master Inbox routing)
│   └── .continuerc.json ........... {disableIndexing: true}
│
├── .antigravity/extensions/ ★ WINDSURF IDE
│   ├── anthropic.claude-code-2.1.49-win32-x64
│   ├── anthropic.claude-code-2.1.52-win32-x64
│   └── eamodio.gitlens-17.10.1-universal
│
└── Projects/LingoLinq-AAC/
    ├── .claude/
    │   └── skills/ ★ 7 LINGOLINQ PROJECT SKILLS
    │       ├── compliance-check/SKILL.md ... PII/secret scanning
    │       ├── deploy-staging/SKILL.md ..... Pre-flight + Render deploy
    │       ├── audit/SKILL.md .............. Full compliance report
    │       ├── a11y-check/SKILL.md ......... Accessibility checks (AAC)
    │       ├── ember-3-28-zero-deprecation/SKILL.md
    │       ├── ember-refactor-safety/SKILL.md
    │       └── security-hotfix/SKILL.md
    │
    └── antigravity-mcp/ ★ CUSTOM MCP SERVER (FastMCP + Python)
        ├── main.py .................. Server entry point
        ├── pyproject.toml ........... Project config
        ├── uv.lock .................. Dependency lock
        ├── README.md
        └── .venv/ ................... Python virtualenv (Windows)
            └── Lib/site-packages/
                └── mcp/, fastmcp/, pydantic/, redis/, requests/, etc.


Claude.ai Cloud (not files — SaaS connectors)
│
└── Connected MCP Services (12, via OAuth/marketplace):
    ├── Mermaid Chart ............... Diagram validation & rendering
    ├── Jotform ..................... Form management
    ├── Notion ...................... (also has local MCP)
    ├── Figma ....................... Design-to-code
    ├── HubSpot ..................... CRM
    ├── Hugging Face ................ ML models & papers
    ├── Slack ....................... Messaging
    ├── Gmail ....................... Email
    ├── Sentry ...................... Error tracking
    ├── Google Calendar ............. Scheduling
    ├── Canva ....................... Design
    └── Zapier ...................... Workflow automation
```

---

## MCP Server Comparison Matrix

| MCP Server             | Claude Code (WSL) | Gemini CLI (WSL) | Windows Desktop | Claude.ai Cloud | Transport |
|------------------------|:-----------------:|:----------------:|:---------------:|:---------------:|-----------|
| github                 |        ✅         |        ✅        |       ✅        |        —        | stdio/npx |
| render                 |        ✅         |        ✅        |       ✅        |        —        | HTTP / mcp-remote |
| deepwiki               |        ✅         |        ✅        |       ✅        |        —        | HTTP / mcp-remote |
| n8n-mcp                |        ✅         |        ✅        |       ✅        |        —        | stdio/npx |
| filesystem             |        ✅         |        ✅        |       ✅        |        —        | stdio/npx |
| sequential-thinking    |        ✅         |        ✅        |       ✅        |        —        | stdio/npx |
| notion                 |        ✅         |        ✅        |       ✅        |       ✅        | stdio/mcp-remote |
| aws-mcp                |        ✅         |        ✅        |       ✅        |        —        | stdio/uvx |
| perplexity             |        ✅         |        ✅        |       ✅        |        —        | stdio/npx |
| chrome-devtools        |        ✅         |        ✅        |       ✅        |        —        | stdio/npx |
| postgres-dev           |        ✅         |        ✅        |       —         |        —        | stdio/npx |
| playwright             |        ✅         |        ✅        |       —         |        —        | stdio/npx |
| docker                 |        ✅         |        ✅        |       —         |        —        | stdio/npx |
| Mermaid Chart          |        —          |        —         |       —         |       ✅        | OAuth     |
| Jotform                |        —          |        —         |       —         |       ✅        | OAuth     |
| Figma                  |        —          |        —         |       —         |       ✅        | OAuth     |
| HubSpot                |        —          |        —         |       —         |       ✅        | OAuth     |
| Hugging Face           |        —          |        —         |       —         |       ✅        | OAuth     |
| Slack                  |        —          |        —         |       —         |       ✅        | OAuth     |
| Gmail                  |        —          |        —         |       —         |       ✅        | OAuth     |
| Sentry                 |        —          |        —         |       —         |       ✅        | OAuth     |
| Google Calendar        |        —          |        —         |       —         |       ✅        | OAuth     |
| Canva                  |        —          |        —         |       —         |       ✅        | OAuth     |
| Zapier                 |        —          |        —         |       —         |       ✅        | OAuth     |

**Totals:** 13 local MCPs (WSL) + 10 Windows Desktop MCPs + 12 Claude.ai cloud connectors = **25 unique MCP connections**

---

## Installed AI Tools

| Tool                    | Version  | Location                                      | Purpose              |
|-------------------------|----------|-----------------------------------------------|----------------------|
| Claude Code CLI (WSL)   | 2.1.50   | ~/.nvm/versions/node/v20.20.0/lib/            | Primary dev agent    |
| Claude Code (Win ext)   | 2.1.49   | .vscode/extensions/ + .antigravity/extensions/ | VS Code + Windsurf   |
| Claude Desktop (Win)    | —        | Windows native app                            | GUI interface        |
| Gemini CLI (WSL)        | 0.29.7   | ~/.nvm/versions/node/v20.20.0/lib/            | 2M context agent     |
| Gemini CLI (Win ext)    | 0.20.0   | .vscode/extensions/                           | VS Code companion    |
| Cline (Win ext)         | 3.66.0   | .vscode/extensions/ (bundles MCP SDK)         | AI coding assistant  |
| GitHub Copilot          | 0.37.7   | .vscode/extensions/                           | Code completion      |
| Azure MCP Server        | 1.0.1    | .vscode/extensions/                           | Azure MCP server     |
| Windows AI Studio       | 0.30.1   | .vscode/extensions/                           | Local AI toolkit     |
| Continue                | —        | ~/.continue/ (indexing disabled)              | AI code assistant    |
| Antigravity Server      | 1.18.3   | ~/.antigravity-server/                        | Windsurf IDE backend |
| antigravity-mcp         | custom   | LingoLinq-AAC/antigravity-mcp/                | Custom MCP server    |
| uvx (Python)            | —        | ~/.local/bin/uvx                              | Python pkg runner    |

---

## Custom Assets

### Claude Code Skills (11 total across 2 locations)

**LingoLinq Project Skills** (7) — `/mnt/c/Users/scotw/Projects/LingoLinq-AAC/.claude/skills/`

| Skill                          | Purpose                              |
|--------------------------------|--------------------------------------|
| `/compliance`                  | PII/secret scanning on staged code   |
| `/deploy-staging`              | Pre-flight checks + Render deploy    |
| `/audit`                       | Full compliance audit report         |
| `/a11y`                        | Accessibility checks (critical: AAC) |
| `/ember-3-28-zero-deprecation` | Ember.js deprecation fixes           |
| `/ember-refactor-safety`       | Safe refactoring guardrails          |
| `/security-hotfix`             | Security hotfix procedures           |

**Windows Global Skills** (4) — `/mnt/c/Users/scotw/.claude/skills/`

| Skill              | Purpose                       |
|--------------------|-------------------------------|
| `/code-review`     | Code review automation        |
| `/git-workflow`    | Git workflow helpers          |
| `/quick-research`  | Quick research tasks          |
| `/startup-ops`     | Startup operations            |

### Plugin Marketplace Skills (15)
Located in: `~/.claude/plugins/` (13 external + 29 internal plugins)

Notable plugin skills: stripe-best-practices, claude-automation-recommender, claude-md-improver,
frontend-design, hookify writing-rules, plugin-dev (7 sub-skills), skill-creator, playground

### Claude Code Memory Files (3)
Located at: `~/.claude/projects/-home-scotw/memory/`

| File                    | Purpose                              |
|-------------------------|--------------------------------------|
| MEMORY.md               | Auto-loaded context every session    |
| mcp-architecture.md     | MCP strategy & security zones        |
| compliance-strategy.md  | FERPA/HIPAA approach                 |

### Shared Agent Memory
- `~/.config/claude/memory.json` → `~/lingolinq/agent_memory.json`
- `/mnt/c/.../Claude/config/memory.json` → `\\wsl.localhost\Ubuntu\home\scotw\lingolinq\agent_memory.json`
- Strategy: merge_without_overwrite, self-updating
- Records: user profile, developer level (novice), multi-agent workflow, project context

### Gemini Antigravity Brain (1 active brain)
Located at: `~/.gemini/antigravity/brain/5314e1b9-*/`
- task.md with 3 resolution iterations
- walkthrough.md with metadata
- 2 conversations (.pb), 2 implicit memories
- Code tracker actively monitoring LingoLinq-AAC

---

## Environment Variables Required

| Variable                        | Used By                    | Purpose               |
|---------------------------------|----------------------------|-----------------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN`  | github MCP (all 3 configs) | GitHub API access     |
| `RENDER_API_KEY`                | render MCP                 | Render deployment     |
| `N8N_API_KEY`                   | n8n-mcp                   | Workflow automation   |
| `PERPLEXITY_API_KEY`            | perplexity MCP            | Web search            |

---

## Security Findings

### CRITICAL: Hardcoded API Keys in Windows Gemini Settings
`/mnt/c/Users/scotw/.gemini/settings.json` contains **4 plaintext API keys**:

| Secret                           | Masked Value                    |
|----------------------------------|---------------------------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN`   | `ghp_****...****5fl`            |
| `RENDER_API_KEY`                 | `rnd_****...****0k`             |
| `N8N_API_KEY` (JWT token)        | `eyJh****...****VGlM`           |
| `PERPLEXITY_API_KEY`             | `pplx-****...****m8tk`          |

**Risk**: Any process or user with read access to this file gains access to all 4 services.
**Remediation**: Replace hardcoded values with `${ENV_VAR}` references (matching the WSL Claude Code pattern).

### MODERATE: DB Connection String in Permissions File
`/mnt/c/Users/scotw/.claude/settings.local.json` (line 42-44) contains a plaintext Render PostgreSQL connection string with password: `sIzw****...****3be`

### LOW: OAuth Tokens in Expected Locations
- `/mnt/c/Users/scotw/.claude/.credentials.json` — access token, refresh token, Notion MCP OAuth tokens
- Standard for OAuth flow; included for audit completeness

### INFO: Dangerous Mode Enabled
- `skipDangerousModePermissionPrompt: true` in both WSL and Windows settings
- Combined with 86 permission allow-list entries in Windows `settings.local.json`

---

## Issues & Observations

### 1. Quadruple Config Duplication
The same MCP servers are defined in **4 places** (not 3 as previously documented):
- `~/.claude.json` (Claude Code — WSL) — 13 MCPs
- `~/.gemini/settings.json` (Gemini CLI — WSL) — 13 MCPs
- `/mnt/c/.../claude_desktop_config.json` (Windows Desktop) — 10 MCPs
- `/mnt/c/Users/scotw/.gemini/settings.json` (Windows Gemini CLI) — 10 MCPs

Any change requires editing up to 4 files manually. A partial sync exists (`~/bin/sync-ai-configs.sh`) but it only syncs CLAUDE.md → GEMINI.md, not MCP configs.

### 2. Windows Configs Missing 3 MCPs
Windows Desktop and Windows Gemini configs lack `postgres-dev`, `docker`, and `playwright` — likely intentional (WSL-native services), but undocumented.

### 3. Transport Inconsistency
- Claude Code (WSL) uses native `type: "http"` for render and deepwiki
- Windows Desktop wraps the same endpoints in `mcp-remote` (npx adapter)
- Gemini CLI omits `type` field but uses the same commands

### 4. Path Divergence (WSL ↔ Windows)
- WSL: `npx` and `/home/scotw/.local/bin/uvx`
- Windows: `C:\Program Files\nodejs\npx.cmd` and `C:\Users\scotw\.local\bin\uvx.exe`
- Filesystem MCP scopes: WSL → `/home/scotw/Projects` vs Windows → `C:\Users\scotw\Projects`

### 5. Deprecated MCP Server
`@modelcontextprotocol/server-github@2025.4.8` is marked **deprecated** on npm. Currently cached in `~/.npm/_npx/`. Should be replaced with the maintained successor.

### 6. MCP SDK Version Fragmentation
Multiple SDK versions running simultaneously across cached npx servers:

| SDK Version | Servers Using It |
|-------------|-----------------|
| 1.0.1       | server-github (DEPRECATED) |
| 1.20.1      | n8n-mcp |
| 1.26.0      | perplexity, filesystem, sequential-thinking, playwright |
| 1.27.0      | gemini-cli (bundled) |

### 7. Empty Files / Unused Potential
- `~/.gemini/GEMINI.md` (WSL) — empty, but Windows copy is synced from CLAUDE.md
- `~/.gemini/antigravity/mcp_config.json` — empty
- `/mnt/c/.../Code/User/mcp.json` — VS Code MCP config is empty (0 bytes)

### 8. Cline MCP Config Empty
Cline (VS Code extension) is installed at v3.66.0 with MCP SDK bundled, but its MCP config is `{"mcpServers": {}}` — no MCPs configured for Cline.

### 9. Continue AI Mostly Dormant
Continue is installed but with `disableIndexing: true` and an empty models list. Only a custom `config.ts` with Notion routing rules remains active.

---

## Proposed Centralized Structure: `~/ai-company-brain/`

```
~/ai-company-brain/
│
├── README.md .......................... How this directory works
│
├── config/
│   ├── mcp-servers.json ............... ★ SINGLE SOURCE OF TRUTH for all MCPs
│   │   └── (all 13 local MCP definitions in one place)
│   ├── env.template ................... Required env vars (no secrets, checked into git)
│   ├── .env ........................... Actual secrets (gitignored, single source)
│   ├── security-zones.json ............ SAFE / CAUTION / RESTRICTED classification
│   └── generators/
│       ├── generate-claude-code-wsl.sh  Generates ~/.claude.json mcpServers block
│       ├── generate-gemini-wsl.sh ..... Generates ~/.gemini/settings.json (env var refs only!)
│       ├── generate-desktop.sh ........ Generates Windows claude_desktop_config.json
│       └── generate-gemini-win.sh ..... Generates Windows .gemini/settings.json
│
├── mcp-servers/
│   ├── antigravity-mcp/ ............... Custom MCP server (moved from project)
│   │   ├── main.py
│   │   ├── pyproject.toml
│   │   └── .venv/
│   └── registry.md .................... Catalog of all MCPs with purpose & owner
│
├── skills/
│   ├── shared/ ........................ Skills usable across all projects
│   │   ├── compliance-check/SKILL.md
│   │   ├── deploy-staging/SKILL.md
│   │   ├── audit/SKILL.md
│   │   ├── a11y-check/SKILL.md
│   │   └── security-hotfix/SKILL.md
│   └── lingolinq/ .................... Project-specific skills
│       ├── ember-3-28-zero-deprecation/SKILL.md
│       └── ember-refactor-safety/SKILL.md
│
├── memory/
│   ├── MEMORY.md ...................... Cross-project memory (symlinked)
│   ├── mcp-architecture.md
│   ├── compliance-strategy.md
│   └── decisions/ ..................... ADR-style decision records
│       └── 001-mcp-consolidation.md
│
├── connectors/
│   └── cloud-mcps.md .................. Documentation of Claude.ai OAuth connectors
│       (Mermaid, Jotform, Notion, Figma, HubSpot, HF, Slack,
│        Gmail, Sentry, Calendar, Canva)
│
├── agents/
│   ├── gemini-antigravity/ ............ Symlink → ~/.gemini/antigravity/
│   └── claude-teams/ .................. Symlink → ~/.claude/teams/
│
└── scripts/
    ├── sync-configs.sh ................ One command to regenerate all 4 config files
    ├── health-check.sh ................ Test all MCP connections + SDK versions
    ├── rotate-keys.sh ................. Rotate API keys (update .env, regenerate configs)
    ├── secret-scan.sh ................. Find hardcoded secrets across all config files
    └── audit.sh ....................... Re-run this infrastructure audit
```

### Migration Steps (Priority Order)

1. **URGENT: Remove hardcoded secrets** from Windows Gemini `settings.json` — replace with `${ENV_VAR}` references and set vars in Windows environment
2. **URGENT: Remove DB connection string** from `settings.local.json` permissions or redact the password
3. **Replace deprecated server-github** — check npm for the maintained successor package
4. **Create `~/ai-company-brain/config/mcp-servers.json`** — canonical MCP definitions
5. **Extend `sync-ai-configs.sh`** to generate MCP configs for all 4 targets (currently only syncs CLAUDE.md → GEMINI.md)
6. **Move antigravity-mcp** out of the project repo into `~/ai-company-brain/mcp-servers/`
7. **Consolidate skills** — merge Windows global (4) + LingoLinq project (7) into shared/project-specific split
8. **Document cloud connectors** (Claude.ai OAuth MCPs have no local config file)
9. **Add `health-check.sh`** — pings each MCP endpoint, verifies env vars are set, checks SDK versions
10. **Configure Cline MCPs** — or remove the extension if unused

### Benefits
- **Single source of truth**: Edit MCPs in one place, generate all 4 config files
- **No more drift**: Windows Desktop, Claude Code, Gemini CLI (both WSL and Windows) stay in sync
- **Security**: No more hardcoded secrets in config files
- **Portable skills**: Share compliance/a11y skills across future projects
- **Auditable**: `scripts/audit.sh` can regenerate this report anytime
- **Scalable**: Add new AI tools (Cursor, Windsurf, etc.) by adding a new generator

---

---

## Appendix: NPX-Cached MCP Server Versions

| Package | Cached Version | MCP SDK Version | Status |
|---------|---------------|-----------------|--------|
| `@modelcontextprotocol/server-github` | 2025.4.8 | 1.0.1 | DEPRECATED |
| `@modelcontextprotocol/server-filesystem` | 2026.1.14 | 1.26.0 | Current |
| `@modelcontextprotocol/server-sequential-thinking` | 2025.12.18 | 1.26.0 | Current |
| `@perplexity-ai/mcp-server` | 0.8.2 | 1.26.0 | Current |
| `@playwright/mcp` | 0.0.68 | 1.26.0 | Current (alpha playwright 1.59.0) |
| `n8n-mcp` | 2.35.5 | 1.20.1 | Current |
| `chrome-devtools-mcp` | 0.17.3 | — | Current |
| `mcp-remote` | 0.1.38 | — | Current |
| `@google/gemini-cli` (bundled) | 0.29.7 | 1.27.0 | Current |

---

*Generated by Claude Code Agent Team (ai-infra-audit) on 2026-02-24*
*Team: ubuntu-explorer, node-explorer, windows-explorer + team-lead*
