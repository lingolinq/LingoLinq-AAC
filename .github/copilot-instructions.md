# GitHub Copilot Instructions

> **Project Rules and Standards for LingoLinq-AAC**
> This file provides project-specific context for GitHub Copilot Chat and Agents. It is synchronized with `CLAUDE.md` and `GEMINI.md`.

## Project Overview

LingoLinq is an open-source web-based AAC (Augmentative and Alternative Communication) application. It consists of a Rails backend and an Ember.js frontend.

Key characteristics:
- Cloud-based with offline support via IndexedDB/SQLite
- Multi-device sync with automatic conflict resolution
- Supervisor/user permission model for therapy teams
- Uses Open Board Format (OBF) for board import/export
- Deployed on Render with background job processing via Resque

## Development considerations
- **i18n**: All user-facing strings MUST use i18n helpers. No raw text strings in templates or JS.
- **Quoting**: 
    - User-facing strings: Use DOUBLE QUOTES `"string"`.
    - Code/Internal strings: Use SINGLE QUOTES `'string'`.
- **Node Version**: Use Node 20.
- **jQuery**: Prefer native DOM APIs or Ember patterns over jQuery (`$`) where practical.

## Architecture

### Backend (Rails 7.2)
- **ID System**: Custom `global_id` format (`#shardnum#_#dbid#`). Use `find_by_global_id`.
- **JSON API**: Responses generated in `lib/json_api/`.
- **Background Jobs**: Resque (`lib/worker.rb`).

### Frontend (Ember 3.28)
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

---
*Last Updated: 2026-05-17*
