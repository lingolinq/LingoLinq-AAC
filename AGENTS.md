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
- **Never edit a test to make a check pass.** A failing test, lint rule or snapshot is
  the finding; report it. Without explicit human approval, never delete, rename or weaken
  an existing test, add `skip`/`xit`/`pending`/`this.skip()`, loosen an assertion, narrow
  a `describe`/`context` so the failing case stops running, drop a file from a path
  filter, matrix or `--filter`, regenerate a lint baseline (`npm run lint:hbs:todo`,
  `npm run lint:js:todo`, `app/frontend/.lint-todo`, `app/frontend/.eslint-todo`), or
  change a lint or test config so the rule stops applying
  (`app/frontend/.template-lintrc.js`, `app/frontend/.eslintrc.js`, `.rspec`,
  `spec/spec_helper.rb`, a `.gitignore` entry), or change how CI decides to run the check
  (a workflow condition or classifier output such as the frontend-scope step in
  `.github/workflows/ci.yml`, a job dependency, `continue-on-error`, a retry or
  allowed-failure setting, an environment input, the command an npm script or rake task
  invokes, or required-check wiring). Stop, name the test and the verified
  reason it fails, and wait. Rewriting a test is legitimate only when the specification
  it encodes actually changed and the approval you were given says so.

## Before a PR

Work through the checklist in `.claude/skills/pr-preflight/SKILL.md` (claim
verification against HEAD, entry-point enumeration for access changes,
`scripts/regenerate-register.sh --check` for compliance paths, the status block the PR
template expects). Tests: `bundle exec rspec` and `cd app/frontend && ember test`.

Two independent reviews then gate the PR: a senior-dev pass and an adversarial red-team
pass. A Critical or High finding from either blocks the PR; this is a blocking gate, not
advisory. **You can run the senior-dev pass yourself**, and the Codex CLI is its
strongest documented caller: `/review-pr <number>`, or `/review-pr` for the current
branch. When you complete it, record the reviewer, the head SHA you actually reviewed,
and the verdict. There is no Codex or Gemini equivalent of the **adversarial** pass, so
that is the one you cannot discharge: name the reviewer who still owes it rather than
reporting that both passes are outstanding. A second, CI-side route for the senior-dev
pass exists, the `Codex Review` workflow (`.github/workflows/codex-review.yml`),
dispatched by the n8n W1 orchestrator and reporting the `codex-review/deep-pass` commit
status; per that workflow's own header, status-stamped 2026-09-12, it is dormant (not in
the required set on `develop`, `staging` or `main`, no run dispatched since 2026-08-04).
Nothing re-verifies that stamp, so confirm it against branch protection before relying on
it. A green CI run is not the dual review.

## Where things are

Path-scoped rules that Claude loads by file path and Codex does not: before editing
under `docs/legal/` or `audit-reports/` read `.claude/rules/compliance-docs.md`
(registers are the source of truth; attested bytes are frozen); before touching
fixtures, factories, cassettes, seeds, migrations or `lib/tasks/` read
`.claude/rules/data-bearing-paths.md` (the Tier 1 data boundary); before touching the
deploy workflow, `Dockerfile`, `config/environments/production.rb`,
`config/initializers/resque.rb` or `scripts/gcp/` read `.claude/rules/deploy.md`.
For a bug fix or behaviour change in application code, the fact-sheet and red-test
discipline is `.claude/skills/fix-proposal/SKILL.md`; only a change that cannot alter
runtime behaviour (docs, agent instructions, comments) skips it.

Backend architecture and hotspots: `CLAUDE.md`. Frontend: `app/frontend/CLAUDE.md`.
Infra: `docs/INFRASTRUCTURE.md`. Debugging: `docs/CODE_INVESTIGATION.md`. Durable
lessons: `docs/task-management/LEARNINGS.md` (curated) and
`docs/task-management/learnings-archive/`.
