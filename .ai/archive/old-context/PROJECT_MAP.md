# LingoLinq AAC Project Architecture

## Overview
Rails + Ember.js AAC system with multi-platform support

## Recent Activity
1001f5504 fix: Update path references after repository reorganization
 .ai/README.md                  |   46 +
 .ai/agents/claude/config.json  |   12 +-
 .claude/settings.local.json    |    3 +-
 .gitignore                     |   12 +-
 Gemfile                        |    1 +
 Gemfile.lock                   |    4 +
 README.md                      |   19 +-
 bin/devin                      |   24 +-
 compile-docs.ps1               |   33 -

## Key Directories
- app/models/ - Rails models
- app/controllers/ - Rails controllers
- app/frontend/ - Ember.js frontend
- lib/ - Shared utilities
- .ai/context/ - AI context files
