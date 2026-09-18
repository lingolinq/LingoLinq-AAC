# AGENTS.md (Codex CLI and other AGENTS.md readers)

Project rules for LingoLinq-AAC. `CLAUDE.md` at the repo root is the full rule set;
this file is the short form for tools that read `AGENTS.md`. When a rule changes in
`CLAUDE.md`, change it here and in `.github/copilot-instructions.md` in the same PR.

## What this is

An open-source AAC (Augmentative and Alternative Communication) app: Rails 7.2 backend,
Ember 5.12 frontend (`app/frontend`), deployed on GCP Cloud Run (production, staging,
dev) with Cloud SQL, Memorystore Redis, Resque workers, and AWS S3 for uploads. Users
include children and clinical patients; FERPA, HIPAA, GDPR and COPPA apply.

## Hard rules

- **Diagnose before fixing; never guess.** Trace the real code path, verify the root
  cause with evidence, and never break working behaviour. Label facts CONFIRMED
  (`file:line`) or ASSUMED; nothing ASSUMED may carry a fix.
- **Branch first.** Never edit on `develop`, `staging` or `main`. Branch from `develop`
  with a developer handle and a type (fix, feat, chore, docs, perf, refactor, test,
  compliance, security). Scot's branches are always `<type>/scot-<kebab-slug>`, the
  launcher form; its 8-hex token suffix is part of the name. Teammates use that form or
  `<dev>/<type>/<slug>`; both are accepted. Never rename an existing branch. Type
  `hotfix` from `main` only for urgent production fixes, merged back to `develop`. PRs
  target `develop`; `develop` promotes to `staging` from a freeze branch
  (`release/develop-into-staging-YYYY-MM-DD`), then a release PR goes `staging` to `main`.
- **i18n and quotes.** No raw user-facing text. Templates use
  `{{t "text" key='key'}}`, JS uses `i18n.t('key', "text")`. User-facing strings take
  double quotes; every other string takes single quotes (the generator depends on it).
- **Feature flags** (`lib/feature_flags.rb`) for every NEW user-facing feature. Small
  changes to shipped features and bug fixes do not need one.
- **PII never leaves the platform.** Every AI or external-service call goes through
  `lib/pii_scrubber.rb`. Never paste fixtures, seeds, cassettes, migrations or logs that
  could hold real student or patient rows into a prompt for a reviewer without a BAA.
- **Node 22** (`.nvmrc`), **Ruby 3.4.4** (`.ruby-version`). No TypeScript conversion.
- **Never suppress a deprecation**; fix the root cause. Edit existing SCSS selectors in
  place; never stack overrides. Preserve styling class names.
- **Never commit secrets.** Reference them by name; values live in 1Password and GCP
  Secret Manager.
- **Console access** in any deployed environment goes through `bin/audit_console`.
- No em dashes in user-facing prose.

## Before a PR

Work through the checklist in `.claude/skills/pr-preflight/SKILL.md` (claim
verification against HEAD, entry-point enumeration for access changes,
`scripts/regenerate-register.sh --check` for compliance paths, the status block the PR
template expects). Tests: `bundle exec rspec` and `cd app/frontend && ember test`.

## Where things are

Path-scoped rules that Claude loads by file path and Codex does not: before editing
under `docs/legal/` or `audit-reports/` read `.claude/rules/compliance-docs.md`
(registers are the source of truth; attested bytes are frozen); before touching
fixtures, factories, cassettes, seeds, migrations or `lib/tasks/` read
`.claude/rules/data-bearing-paths.md` (the Tier 1 data boundary); before touching the
deploy workflow, `Dockerfile`, `config/environments/production.rb`,
`config/initializers/resque.rb` or `scripts/gcp/` read `.claude/rules/deploy.md`;
before opening or updating a pull request read `.claude/rules/github-pr.md` (the `gh`
CLI is not installed and the MCP GitHub server's credentials are rejected, so the route
is the git credential helper's OAuth token, which must never be echoed or written to a
tracked file).
For a bug fix or behaviour change in application code, the fact-sheet and red-test
discipline is `.claude/skills/fix-proposal/SKILL.md`; only a change that cannot alter
runtime behaviour (docs, agent instructions, comments) skips it.

Backend architecture and hotspots: `CLAUDE.md`. Frontend: `app/frontend/CLAUDE.md`.
Infra: `docs/INFRASTRUCTURE.md`. Debugging: `docs/CODE_INVESTIGATION.md`. Durable
lessons: `docs/task-management/LEARNINGS.md` (curated) and
`docs/task-management/learnings-archive/`.
