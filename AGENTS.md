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
  as `<dev>/<type>/<kebab-slug>` (types: fix, feat, chore, docs, perf, refactor, test,
  compliance, security; `hotfix` from `main` only for urgent production fixes, merged
  back to `develop`). PRs target `develop`; `develop` promotes to `staging`, then a
  release PR goes `staging` to `main`.
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

Backend architecture and hotspots: `CLAUDE.md`. Frontend: `app/frontend/CLAUDE.md`.
Infra: `docs/INFRASTRUCTURE.md`. Debugging: `docs/CODE_INVESTIGATION.md`. Durable
lessons: `docs/task-management/LEARNINGS.md` (curated) and
`docs/task-management/learnings-archive/`.
