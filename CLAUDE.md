# CLAUDE.md

Guidance for Claude Code in LingoLinq-AAC. This file holds the repo-wide rules only and
is kept under 200 lines. Everything else loads on demand:

| Where | Loads when | Holds |
|---|---|---|
| `app/frontend/CLAUDE.md` | you read files under `app/frontend/` | Ember commands, test-run discipline, 5.12 gotchas, frontend map |
| `.claude/rules/compliance-docs.md` | touching `docs/legal/**` or `audit-reports/**` | register governance, attested-doc rules |
| `.claude/rules/data-bearing-paths.md` | touching fixtures, seeds, cassettes, migrations | the Tier 1 data boundary |
| `.claude/rules/deploy.md` | touching the deploy workflow, Dockerfile, `scripts/gcp/` | Cloud Run facts |
| `/fix-proposal` skill | before implementing any fix | fact sheet, red test first, proposal review, falsification |
| `/pr-preflight` skill | before opening or pushing to a PR | P1 to P6 checks and the PR body block |
| `AGENTS.md`, `.github/copilot-instructions.md` | Codex and Copilot | the same rules in short form; change them in the same PR |

## Rule #0: check this first, every time, before touching code

Applies to every change: additions, refactors, fixes, deletions, styling. It overrides
everything else in this file.

1. **Diagnose before fixing; never guess.** Identify the root cause and verify it with
   evidence (read the real code paths end to end, inspect the real data, reproduce the
   behaviour). If you cannot verify the cause, say so and keep investigating.
2. **Be thorough.** Trace the full path the bug travels, including shared code, the
   working and broken variants, and the data. A fix that addresses a symptom without
   explaining the verified cause is not acceptable.
3. **Never break working functionality.** If a fix risks regressing anything, stop and
   flag it. Do not fix one thing by degrading another.
4. **If diagnosis is incomplete, do not apply a change.** Report what was verified, what
   was not, and the next step.
5. **If a correction did not fix the problem, suspect the attempt first.** Check whether
   it landed on the wrong element, component, route or layer; revert it before trying
   again. Never stack a second guess on an unreverted first guess.
6. **Keep the code modular.** Smallest sensible unit, one responsibility, reuse existing
   primitives, extract a shared unit when an idea appears twice. If a change would
   tangle responsibilities, propose the split first.
7. **When changing a styling rule, edit the original.** Find the selector that governs
   the element and change it in place; never add a higher-specificity override, an
   override block, or `!important` to win the cascade.
8. **Log researched work; distill durable lessons.** A task that needs research gets a
   log at `docs/task-management/YYYY-MM-DD_<slug>.md` (underscore after the date; the
   dash form is gitignored and never reaches a PR). Before starting, read the curated
   `docs/task-management/LEARNINGS.md` and grep `learnings-archive/` for your surface's
   keywords. On completion, append durable lessons to `learnings-archive/YYYY-MM.md`;
   promotion into the curated file is a reviewed edit.
9. **Spawn subagents when it makes the task more efficient; do not ask first.** Fan out
   independent slices in one message with explicit file lists and the CONFIRMED versus
   PLAUSIBLE labelling rule. A subagent's report is evidence to verify, not a verified
   finding.
10. **Do not assert anything about a system you have not just checked.** "CI hits this
    too", "this is covered by specs", "that path is unused" are each cheap to verify;
    verify or say the claim is unverified. When a claim you made turns out wrong,
    correct the durable artifacts, not just the chat.
11. **A red test run is not a regression until the run COMPLETED and you have a
    baseline.** The mechanics for each suite are in `app/frontend/CLAUDE.md` (Ember) and
    the Testing section below (RSpec).
12. **Establish the three facts, write the red test first, and review the proposal before
    editing.** The full discipline is the `/fix-proposal` skill. In one line each: where
    is the value READ; what are ALL the shapes it can hold; is each cross-file claim TRUE.
    Label every fact CONFIRMED (`file:line`) or ASSUMED, and let nothing ASSUMED carry a
    fix. "This one is obvious" is the signal to write the sheet, not to skip it.
13. **One coherent change per unit, and stop when the error rate rises.** Two
    self-inflicted errors close together, or a verification step re-run because the
    first attempt was botched, means commit what is verified, write down what remains,
    and stop.

## Branching (mandatory before any code change)

- **Never edit on `main`, `staging`, or `develop`.** Branch from `develop` for all
  regular work: `git checkout develop && git pull && git checkout -b <dev>/<type>/<slug>`.
  Prefer an isolated worktree when other sessions share the checkout.
- **Name:** `<developer>/<type>/<kebab-slug>`, for example `melissa/fix/sidebar-actions`,
  `scot/chore/staging-slow-queue-capacity`. `<type>` is one of `fix`, `feat`, `chore`,
  `docs`, `perf`, `refactor`, `test`, `compliance`, `security`. The older
  `<type>/<dev>-<slug>` form may finish through merge; do not start new branches in it.
- **Hotfixes are the one exception:** an urgent production fix branches from `main` as
  `<dev>/hotfix/<slug>`, opens a PR directly against `main` (Scot approves), and is merged
  back to `develop` immediately afterwards. See `CONTRIBUTING.md`.
- **Stay on the active feature branch** when the request is part of work already in
  progress on it (CI failures, review feedback, follow-ups). Do not spawn a side branch
  and merge back unless asked.
- **Flow:** PRs target `develop`; `develop` promotes to `staging`; a release PR goes from
  `staging` to `main`, which deploys to production after approval.
- Date suffixes are only for time-bound recovery or release branches.

## Project overview

LingoLinq is an open-source AAC (Augmentative and Alternative Communication) web app, a
fully renamed fork of CoughDrop / SweetSuite: a Rails backend and an Ember frontend in one
monorepo, also packaged for iOS/Android (Cordova) and desktop (Electron). Cloud-based with
offline support (IndexedDB / SQLite), multi-device sync with conflict resolution, a
supervisor/user permission model for therapy teams, and Open Board Format import/export.
Deployed on GCP Cloud Run (production, staging, dev) with Cloud SQL PostgreSQL,
Memorystore Redis, Resque workers, and AWS S3 for uploads; see `docs/INFRASTRUCTURE.md`.
Users include children and clinical patients: FERPA, HIPAA, GDPR and COPPA apply, and
data isolation between district accounts is mandatory.

## Conventions

- **i18n everywhere.** Never add raw user-facing text. Templates:
  `{{t "displayed text" key='translation_key'}}`; JS: `i18n.t('key', "default text")`.
  Translation files: `public/locales/*.json`; generator: `i18n_generator.rb`;
  contributor guide: `docs/TRANSLATIONS.md`.
- **Quotes:** user-facing strings use double quotes, all other strings use single
  quotes. The i18n generator depends on this.
- **Feature flags** (`lib/feature_flags.rb`, `AVAILABLE_FRONTEND_FEATURES` and
  `ENABLED_FRONTEND_FEATURES`) are required for every NEW user-facing feature: AAC users
  find unexpected UI changes disruptive, and flags allow beta testing. A small change to
  a shipped feature, or a bug fix restoring intended behaviour, needs no flag; do not
  raise the question for those.
- **Deprecations:** never suppress or hide one; migrate to the recommended API.
- **Refactors** never remove or change functionality. Preserve styling class names unless
  there is a clear need, and ask first.
- **Security:** avoid the OWASP Top 10; use the `secure_serialize` concern for sensitive
  fields; protected IDs carry a nonce. Every AI or external call goes through
  `lib/pii_scrubber.rb`. Console access in any deployed environment goes through
  `bin/audit_console`, which sets `USER_KEY` so the session writes an `AuditEvent` and
  attributes record changes via PaperTrail; an un-keyed `rails console` or `runner` is
  refused in production. Only `console` and `runner` are audited; `rake`, other
  `bin/rails` subcommands, direct Ruby boots and `psql` are not (finding LL-7f7372e3eb).
- **Never commit secrets.** Reference 1Password items and Secret Manager names.
- No em dashes in user-facing prose.

## Backend architecture

PostgreSQL plus Redis (caching, Resque queues `priority`, `default`, `slow`, plus `whenever`,
which `User#track_boards` and `LogSession#update_board_connections` target under Redis queue
pressure and `Uploader` targets for every batch upload; the Cloud Run worker entrypoint drains
only the first three by default, see `docs/INFRASTRUCTURE.md`).

- **IDs:** custom `global_id` (`#shard#_#dbid#`) instead of raw ids. `find_by_global_id`,
  `find_by_path` (id, board key, or username), `find_all_by_global_id`.
- **JSON API:** every response is built in `lib/json_api/`, not Rails serializers.
- **Concerns** (`app/models/concerns/`): `global_id`, `extra_data` (large data in S3),
  `permissions` (`add_permissions`, `allowed?`), `processable`, `relinking` (board-set
  copying), `upstream_downstream`, `secure_serialize`, `subscription`, `supervising`,
  `board_caching`.
- **Libraries** (`lib/`): `worker.rb` / `slow_worker.rb`, `purchasing.rb` (Stripe),
  `stats.rb`, `exporter.rb` (OBF/OBL), `feature_flags.rb`, `converters/`, `uploader.rb`,
  `transcoder.rb`.
- **Large models:** `User`, `Board`, `ButtonSet` (BoardDownstreamButtonSet), `LogSession`
  (data in S3), `BoardContent` (copy-by-reference).
- **Hotspots:** `boards_controller#index` (needs indexes),
  `BoardDownstreamButtonSet.update_for`, `Board.process_buttons`,
  `models/concerns/relinking.rb`, `upstream_downstream.rb#track_downstream_boards!`
  (queue bottleneck risk), `Purchasing.purchase`.

The frontend map, hotspots, and Ember gotchas are in `app/frontend/CLAUDE.md`.

## Commands and environment

Setup, `foreman start`, scheduled rake tasks, and troubleshooting recipes are in `README.md`
and `docs/CODE_INVESTIGATION.md`. `bin/fresh_start` (kill everything, reset, start) and
`bin/kill_all` are documented only in their own headers.
Required: PostgreSQL, Redis, Ruby 3.4.4 (`.ruby-version`), Node 22 (`.nvmrc`, via nvm),
ImageMagick, Ghostscript. Copy `.env.example` to `.env`; dev DB `lingolinq-development`,
test DB `lingolinq-test`. Deploy prep: `bin/deploy_prep`, `rake extras:mobile`,
`rake extras:desktop`.

## Testing

- **Backend:** RSpec in `spec/` mirroring the tree. `bundle exec rspec`,
  `bundle exec rspec spec/models/user_spec.rb:42`. Local runs need the DB user in the
  environment (the `RAILS_ENV=test DB_USER=... PGPASSWORD=...` prefix in
  `docs/PRE_COMMIT_CHECKLIST.md`). `AuditEvent` rows commit outside the RSpec transaction
  and the test DB can carry orphaned rows; scope any `delete_all` to the describe block.
- **Frontend:** QUnit via `cd app/frontend && ember test`; read the run-shape rules in
  `app/frontend/CLAUDE.md` before interpreting a failure.
- Reconcile totals against a known-good baseline before claiming a delta.

## Before a PR

Run `/pr-preflight`. Then the dual review: `/review-pr` (senior-dev pass) and
`/adversary-review` (red team). A Critical or High finding from either blocks the PR.
Copilot code review runs automatically on every PR to `develop`.

## Audit and compliance system

`/audit-run` (user-only skill) stamps the audited SHA, fans out six read-only finder
agents in parallel (`.claude/agents/*-auditor.md`, each preloading its
`.claude/skills/<domain>-audit` checklist and guarded by
`.claude/hooks/audit-readonly-guard.sh`), reconciles into `audit-reports/FINDINGS.json`
via `scripts/audit-merge.rb`, runs the `adversary` agent as verifier, and validates with
`scripts/citation-check.rb`. `/ember-audit-run` does the same for upgrade regressions
into the separate `audit-reports/ember-upgrade/FINDINGS-EMBER.json`. Headline is the
count of open Critical/High findings. Only Scot closes, downgrades, or accepts risk;
restamping `meta.auditedSha` is a governance act (see `.claude/rules/compliance-docs.md`
and `audit-reports/README.md`). Findings never contain student or patient data.

## Notes

- License AGPLv3; contributor agreement required; OpenAAC Slack for questions.
- Ember history: 3.28 to 4.12 (#437) to 5.12 (#490, 2026-07-08). Target 5.12 APIs.
