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
- **Branch first.** Never commit on `develop`, `staging` or `main`. Branch from `develop` with a developer handle and a type (fix, feat, chore, docs, perf, refactor, test, compliance, security). Scot's branches are always `<type>/scot-<kebab-slug>`, the launcher form, 8-hex token suffix included; teammates use that form or `<dev>/<type>/<slug>`, both accepted. Never rename an existing branch. Type `hotfix` from `main` only for urgent production fixes. PRs target `develop`. Promote `develop` to `staging` from a freeze branch (`release/develop-into-staging-YYYY-MM-DD`), not from live `develop`.
- **Ruby 3.4.4** (`.ruby-version`) and **Node 22** (`.nvmrc`). No TypeScript conversion.
- **Styling:** edit the governing SCSS selector in place; never add a higher-specificity override, an override block, or `!important`. Preserve class names.
- **Refactors** never remove or change functionality.
- **Never commit secrets.** Reference them by name; values live in 1Password and GCP Secret Manager.
- **No em dashes** in user-facing prose.
- **Never edit a test to make a check pass.** A failing test, lint rule or snapshot is the finding; report it. Without explicit human approval, never delete, rename or weaken an existing test, add `skip`/`xit`/`pending`/`this.skip()`, loosen an assertion, narrow a `describe`/`context` so the failing case stops running, drop a file from a path filter, matrix or `--filter`, regenerate a lint baseline (`npm run lint:hbs:todo`, `npm run lint:js:todo`, `app/frontend/.lint-todo`, `app/frontend/.eslint-todo`), or change a lint or test config so the rule stops applying (`app/frontend/.template-lintrc.js`, `app/frontend/.eslintrc.js`, `.rspec`, `spec/spec_helper.rb`, a `.gitignore` entry that drops the file from the run), or change how CI decides to run the check (a workflow condition or classifier output such as the frontend-scope step in `.github/workflows/ci.yml`, a job dependency, `continue-on-error`, a retry or allowed-failure setting, an environment input, the command an npm script or rake task invokes, or required-check wiring). These are one act under different names, and the list above is examples, not a boundary: anything else whose effect is that a failing check now passes without the defect it detected being fixed is the same act, including changing the code under test to satisfy the assertion rather than fixing the defect, re-running until a flake goes green, and merging with `--admin`. Stop, name the test and the verified reason it fails, and wait. Rewriting a test is legitimate only when the specification it encodes actually changed and the approval says so.
- **Path-scoped rules** live in `.claude/rules/`: `compliance-docs.md` for `docs/legal/` and `audit-reports/` (registers are the source of truth; attested bytes are frozen), `data-bearing-paths.md` for fixtures, factories, seeds, cassettes, migrations and `lib/tasks/` (the Tier 1 data boundary), `deploy.md` for the deploy workflow, `Dockerfile`, `config/environments/production.rb`, `config/initializers/resque.rb` and `scripts/gcp/`, and `github-pr.md` for opening or updating a pull request (no `gh` CLI and no working MCP GitHub credentials here; the route is the git credential helper's OAuth token, never echoed or committed). Read the one whose paths a change touches.

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

## Review
- Two passes gate a PR: a senior-dev pass and an adversarial red-team pass; a Critical or High from either blocks. Copilot has no command surface for either, so it runs neither; they are owed by a named human or agent reviewer.
- The senior-dev pass ships the diff to an external model on an account with no BAA. Whoever runs it must run the PII pre-flight first (`~/ai-company-brain/scripts/codex-review-guard.sh`, a LingoLinq-internal path), matching the invocation form to the argument. Proceed only on exit 0. Any other exit, including 3 (nothing was checked), means stop. If you cannot reach that path, you are not set up to run this pass, so stop and hand it to someone who is rather than proceeding without it. Full detail in `CLAUDE.md` and `AGENTS.md`.

## Testing
- **Backend**: RSpec (`bundle exec rspec`).
- **Frontend**: QUnit (`ember test`).
