---
description: 
alwaysApply: true
---

---
description: 
alwaysApply: true
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LingoLinq (formerly LingoLinq) is an open-source web-based AAC (Augmentative and Alternative Communication) application. It consists of a Rails backend and an Ember.js frontend, both contained in this monorepo. The system is deployed as a web app and packaged for mobile (iOS/Android) and desktop apps.

Key characteristics:
- Cloud-based with offline support via IndexedDB/SQLite
- Multi-device sync with automatic conflict resolution
- Supervisor/user permission model for therapy teams
- Uses Open Board Format (OBF) for board import/export
- Deployed on Heroku with background job processing via Resque

## Development considerations
LingoLinq-AAC supports multiple locales, so when developing anything on the frontend, whether
in templates or modals and alerts, you will need to use the internationalization libraries
in order to support locales. Do net ever add raw text strings to any user-facing 
resources, always use the i18n helpers. You can find examples of the helpers 
throughout the code, using
commands such as `i18n.t('key', "string")` or `{{t "this is some test" key='key'}}`. Instructions for generating and processing string files is located in `/i18n_generator.rb`.
NOTE: as a standardized convention for the codebase, all user-facing strings should use
double-quotes and all other strings should use single quotes.

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

**Console access:**
```bash
# Local console (includes audit safeguards)
bin/heroku_console

# Production console (on Heroku)
bin/heroku_console  # Not just 'rails console'
```

**Scheduled tasks (run periodically in production):**
```bash
rake check_for_expiring_subscriptions  # daily
rake generate_log_summaries            # hourly
rake push_remote_logs                  # hourly
rake check_for_log_mergers             # hourly
rake advance_goals                     # hourly
rake transcode_errored_records         # daily
rake flush_users                       # daily
rake clean_old_deleted_boards          # daily
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

**Linting:**
```bash
cd app/frontend
npm run lint:js
npm run lint:hbs
```

**Build:**
```bash
cd app/frontend
ember build --environment production
```

### Deployment

```bash
# Precompile assets for production
bin/deploy_prep

# Mobile app preparation
rake extras:mobile

# Desktop app preparation
rake extras:desktop
```

## Architecture

### Backend Architecture

**Database:** PostgreSQL with Redis for caching and background jobs

**ID System:** Custom `global_id` format (`#shardnum#_#dbid#`) used instead of raw database IDs for future sharding support. Key methods:
- `Model.find_by_global_id(id)` - lookup by global ID only
- `Model.find_by_path(path)` - lookup by ID, board key, or username
- `Model.find_all_by_global_id([ids])`
- Some records use protected IDs (id-and-nonce) to prevent snooping

**JSON API:** All API responses generated in `lib/json_api/` (not using Rails standard JSON serializers)

**Key Model Concerns:** (in `app/models/concerns/`)
- `global_id` - ID lookup helpers for sharding-ready IDs
- `extra_data` - Stores large datasets (LogSession, BoardDownstreamButtonSet) in S3 instead of DB
- `permissions` - Access control (`add_permissions`, `allowed?`)
- `processable` - Standardized client data processing with uniqueness enforcement
- `relinking` - Server-side board set copying
- `upstream_downstream` - Keeps linked boards up-to-date when children change
- `secure_serialize` - Encryption layer for sensitive data (privacy compliance)
- `subscription` - Subscription/purchase event management
- `supervising` - Supervisor relationship management
- `board_caching` - Tracks available board IDs for users

**Key Libraries:** (in `lib/`)
- `worker.rb` / `slow_worker.rb` - Background job management (Resque)
- `purchasing.rb` - Stripe API integration
- `stats.rb` - Log data ingestion and report generation
- `exporter.rb` - OBF/OBL format exports with anonymization
- `feature_flags.rb` - Feature flag system for gradual rollouts
- `converters/` - OBF/OBZ file conversion
- `uploader.rb` - File upload helpers (client and server-side)
- `transcoder.rb` - AWS transcoding event handling

**Key Models:**
- `User` - Large model with subscription, permission, and board management logic
- `Board` - Large model with button processing, copying, sharing functionality
- `ButtonSet` (BoardDownstreamButtonSet) - Tracks all buttons in board hierarchy for find-a-button feature
- `LogSession` - User interaction tracking with large data stored in S3
- `BoardContent` - Copy-by-reference system to minimize storage

### Frontend Architecture

**Framework:** Ember.js 3.28 with Ember Data for models

**Offline Support:** IndexedDB (web) or SQLite (mobile) via `dbman.js` abstraction layer

**Key Utilities:** (in `app/frontend/app/utils/`)
- `app_state.js` - Application state management, button activation logic
- `persistence.js` - Local database abstraction, sync logic, Ember-Data caching
- `edit_manager.js` - Board editing state, undo/redo, board rendering preparation
- `capabilities.js` - Platform-specific code (file storage, gaze tracking, clipboard, etc.)
- `button.js` - Button helper methods (buttons stored on board objects, not persisted separately)
- `content_grabbers.js` - Image/sound/video search and insertion
- `raw_events.js` - Low-level DOM listeners (clicks, drags, dwell, eye-gaze)
- `scanner.js` - Scanning mode implementation
- `speecher.js` - Speech synthesis
- `utterance.js` - Sentence box content tracking and rendering
- `modal.js` - Modal and flash notice helpers
- `i18n.js` - Internationalization with English grammar helpers
- `sync.js` - Online status tracking, remote modeling sessions
- `eval.js` - Assessment system (special OBF type)
- `profiles.js` - Survey and assessment tools

**Key Models:** (in `app/frontend/app/models/`)
- Most client-side models match server names
- `User`, `Board`, `ButtonSet` are particularly large with extensive functionality

**Components:** (in `app/frontend/app/components/`)
- UI components for charts, graphs, data visualization

### Critical Code Paths

**Frontend hotspots:**
- `editManager.process_for_displaying` - Converts server data to renderable format
- `Board.contextualized_buttons` - Language/symbol/inflection display logic
- `app_state.activate_button` - Main button selection handler (sentence box, speech, actions)
- `persistence.sync` - Offline sync logic
- `persistence.getJSON` - Encrypted URL processing for extra_data
- `LingoLinq.Buttonset.load_button_set` - Button set loading with caching
- `User.currently_premium` - Feature access determination
- `controllers/board/index.js:computeHeight` - Board rendering sizing
- `initializers/attempt_lang.js` - Language file loading on startup

**Backend hotspots:**
- `boards_controller#index` - Board search (performance-sensitive, needs indexes)
- `BoardDownstreamButtonSet.update_for` - Button set updates (can run very frequently)
- `Board.process_buttons` - Board update processing
- `models/concerns/relinking.rb` - Board set copying logic
- `models/concerns/upstream_downstream.rb#track_downstream_boards!` - Runs often, queue bottleneck risk
- `Purchasing.purchase` - Stripe subscription activation

## Development Conventions

### Code Style

**Callback and plain-object context:**
- When a computed property or function returns a **plain object** whose methods are later called (e.g. `appState.get('board_virtual_dom').button_from_point(x,y)`), inside those methods `this` is the plain object, not the Ember service/controller. Use a closure: `var _this = this;` at the top of the computed/function, then use `_this.get()` / `_this.set()` inside the returned object's methods. Same for callbacks passed to `new RSVP.Promise()`, `.then()`, or `forEach`: capture the outer `this` as `_this` and use `_this` in the callback so "this.get is not a function" does not occur.
- **ESLint:** The custom rule `lingolinq/no-this-in-promise-executor` flags `this.get` / `this.set` inside the executor function of `new RSVP.Promise(function(resolve, reject) { ... })`. In that callback, `this` is not the service/controller, so using `_this` avoids runtime errors. The rule only checks Promise executors (not every `.then()` or plain object), to limit false positives while catching a common mistake.

**String Quoting Convention:**
- **User-facing strings:** ALWAYS use double quotes `"string"`
- **All other strings:** ALWAYS use single quotes `'string'`
- This convention is CRITICAL - i18n generator depends on it

**Internationalization:**
- NEVER add raw text strings to user-facing code
- Templates: `{{t "displayed text" key='translation_key'}}`
- Controllers/JS: `i18n.t('translation_key', "default text")`
- Translation files: `public/locales/*.json`
- Generation script: `i18n_generator.rb`

**Platform-Specific Code:**
- Extract platform-specific code or wrap in `capabilities` library
- Use capability checks to enable features conditionally
- System deployed as web, mobile (Cordova), and desktop (Electron) apps

### Feature Flags

New user-facing features MUST be added behind a feature flag (`lib/feature_flags.rb`):
- AAC users can find unexpected UI changes disruptive
- Allows beta testing and gradual rollout
- Some users/orgs are opted into beta features for testing
- Add to `AVAILABLE_FRONTEND_FEATURES` and conditionally to `ENABLED_FRONTEND_FEATURES`

### Security

- Avoid OWASP Top 10 vulnerabilities (XSS, SQL injection, command injection, etc.)
- User data is privacy-regulated - use `secure_serialize` concern for sensitive fields
- Console access audited via `AuditEvent` model (use `bin/heroku_console`, not `rails console`)
- Protected IDs require nonce to prevent snooping

## Environment Setup

**Required services:**
- PostgreSQL (database)
- Redis (background jobs, caching)
- Node.js 20 (managed via nvm)
- Ruby 3.4.3
- ImageMagick (`convert`, `identify`, `montage`)
- Ghostscript (`gs`)

**Node Version Management:**
- Both `/.nvmrc` and `app/frontend/.nvmrc` specify Node 20
- `bin/ember-server` uses nvm to ensure Node 20 for the frontend dev server

**Environment variables:**
- Copy `.env.example` to `.env`
- Uncomment required variables (REDIS_URL, database config)
- Default Redis: `redis://localhost:6379/`
- AWS integrations: S3 (storage), SES (email), SNS (notifications), Elastic Transcoder (media)
- Google API: Places, Translate, Maps, TTS
- Optional: Websocket server for online status/real-time features
- Optional: OpenSymbols.org endpoint for image search

**Database setup:**
- Update `config/database.yml` for your Postgres config
- Development DB: `lingolinq-development`
- Test DB: `lingolinq-test`

## Troubleshooting

**Redis memory issues:**
```ruby
RedisInit.size_check
rake extras:clear_report_tallies
```

**Background job queue issues:**
```ruby
Worker.method_stats('queue_name')
Worker.prune_jobs('queue_name', 'method_name')
```

**Console examples:**
```ruby
b = Board.find_by_path('example/keyboard')
downs = Board.find_all_by_global_id(b.downstream_board_ids)
u = User.find_by_path('username')
s = u.log_sessions.last
bi = ButtonImage.last
```

See CODE_INVESTIGATION.md for detailed debugging guidance on common problem areas.

## Testing

**Backend:**
- RSpec for model, controller, library specs
- Specs in `spec/` directory matching file structure
- Run single spec: `bundle exec rspec spec/path/to/file_spec.rb`
- Run with line number: `bundle exec rspec spec/path/to/file_spec.rb:42`

**Frontend:**
- QUnit tests via Ember testing framework
- Run: `cd app/frontend && ember test`

## Translation Management

- Translation files: `public/locales/*.json`
- Word data import tool available in admin org for inflections/parts of speech
- Template files at OpenAAC tools site for rules.json and words.json
- See TRANSLATIONS.md for contributor guidelines
- Use `i18n_generator.rb` scripts to manage translation files

## Additional Notes

- Main branch for PRs: `main`
- License: AGPLv3
- Contributor agreement required for code contributions
- OpenAAC Slack channel available for questions
- Background jobs use Resque with multiple queues: priority, default, slow, whenever
