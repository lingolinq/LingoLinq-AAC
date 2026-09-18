# GitHub Copilot Instructions

> **Project Rules and Standards for LingoLinq-AAC**
> This file provides project-specific context for GitHub Copilot Chat, the Copilot coding agent, and Copilot code review (which reviews every PR to `develop`). It is kept in step with `CLAUDE.md` by hand: when a rule changes there, change it here in the same PR.

## Project Overview

LingoLinq is an open-source web-based AAC (Augmentative and Alternative Communication) application. It consists of a Rails backend and an Ember.js frontend.

Key characteristics:
- Cloud-based with offline support via IndexedDB/SQLite
- Multi-device sync with automatic conflict resolution
- Supervisor/user permission model for therapy teams
- Uses Open Board Format (OBF) for board import/export
- Deployed on GCP Cloud Run (production, staging, dev) with Resque workers; see `docs/INFRASTRUCTURE.md`

## Working rules (short form of `CLAUDE.md` Rule #0 and Conventions)
- **Diagnose before fixing; never guess.** Trace the real code path, verify the root cause with evidence, and never break working behaviour. Label facts CONFIRMED (`file:line`) or ASSUMED; nothing ASSUMED may carry a fix.
- **Branch first.** Never commit on `develop`, `staging` or `main`. Branch from `develop` as `<dev>/<type>/<kebab-slug>` (types: fix, feat, chore, docs, perf, refactor, test, compliance, security; `hotfix` from `main` only for urgent production fixes). PRs target `develop`. Promote `develop` to `staging` from a freeze branch (`release/develop-into-staging-YYYY-MM-DD`), not from live `develop`.
- **Ruby 3.4.4** (`.ruby-version`) and **Node 22** (`.nvmrc`). No TypeScript conversion.
- **Styling:** edit the governing SCSS selector in place; never add a higher-specificity override, an override block, or `!important`. Preserve class names.
- **Refactors** never remove or change functionality.
- **Never commit secrets.** Reference them by name; values live in 1Password and GCP Secret Manager.
- **No em dashes** in user-facing prose.
- **Path-scoped rules** live in `.claude/rules/`: `compliance-docs.md` for `docs/legal/` and `audit-reports/` (registers are the source of truth; attested bytes are frozen), `data-bearing-paths.md` for fixtures, factories, seeds, cassettes, migrations and `lib/tasks/` (the Tier 1 data boundary), `deploy.md` for the deploy workflow, `Dockerfile`, `config/environments/production.rb`, `config/initializers/resque.rb` and `scripts/gcp/`. Read the one whose paths a change touches.

## Development considerations
- **i18n**: All user-facing strings MUST use i18n helpers. No raw text strings in templates or JS.
- **Quoting**: 
    - User-facing strings: Use DOUBLE QUOTES `"string"`.
    - Code/Internal strings: Use SINGLE QUOTES `'string'`.
- **Node Version**: Use Node 22 (pinned in `.nvmrc` and `app/frontend/.nvmrc`). The repo was on Node 20 while it ran Ember 3.28; the Ember 5.12 upgrade (#490) lifted that ceiling and it moved to Node 22.
- **jQuery**: Prefer native DOM APIs or Ember patterns over jQuery (`$`) where practical.

## Architecture

### Backend (Rails 7.2)
- **ID System**: Custom `global_id` format (`#shardnum#_#dbid#`). Use `find_by_global_id`.
- **JSON API**: Responses generated in `lib/json_api/`.
- **Background Jobs**: Resque (`lib/worker.rb`).

### Frontend (Ember 5.12)
- **State Management**: `app_state.js`.
- **Persistence**: `dbman.js` / `persistence.js`.
- **Edit Manager**: `edit_manager.js`.

## Development Conventions

### Code Style
- **Callbacks**: Capture `this` as `_this` at the top of functions/computed properties to avoid context issues in plain objects or Promises.
- **ESLint**: Respect `lingolinq/no-this-in-promise-executor`.
- **Deprecations**: Fix root causes; never suppress or hide deprecations.
- **CSS/SCSS**: Wrap mixed-unit math in `calc()` for SassC compatibility.

## Feature Flags
New user-facing features MUST be behind a feature flag in `lib/feature_flags.rb`.

## Security
- Avoid OWASP Top 10 vulnerabilities.
- Use `secure_serialize` for sensitive fields.
- Console access must be audited via `bin/audit_console`.
- **PII & compliance**: Never generate code that logs, displays, or sends student/patient PII (names, birthdates, contact info) to third parties. Honor FERPA, HIPAA, GDPR, and COPPA, and preserve data isolation between district accounts. Route any AI or external-service calls through the PII scrubber (`lib/pii_scrubber.rb`) so identifiable data is never sent off-platform.

## Testing
- **Backend**: RSpec (`bundle exec rspec`).
- **Frontend**: QUnit (`ember test`).
