# Render decommission closure (3-PR split)

**Spec:** `~/ai-company-brain/outputs/plans/2026-09-11-render-decommission-closure-corrected.md`
(incl. the 2026-09-12 addendum). The spec is a hypothesis; every claim below was re-verified against
`HEAD = origin/develop @ 4c2adc976` on 2026-09-12 in this worktree. Evidence for live-state claims
is pasted in the appendix; a claim without an appendix pointer is a repo-tree fact.

**Goal:** make the repo, the audit tooling, and the compliance record tell the truth that every
Render service was deleted (0 services / 0 databases / 0 disks as of 2026-09-09). Stage closures,
close nothing.

**Review history:** proposal v1 went through a dual review (Codex gpt-5.6-terra + Claude adversary)
on 2026-09-12: 21 merged findings, 1 Critical, 6 High, verdict request-changes. Findings table:
`dual-review-round1-pra-proposal.md` (session scratchpad; copied into the PR A body on open).
v2 below restructures per shared root cause instead of patching findings one by one.

## Phase 1 inventory (verified)

Tree-level counts (tracked files, `git grep`):

| Pattern | Files | Command |
|---|---|---|
| `onrender\.com` (case-insensitive) | 12 | `git grep -l -i 'onrender\.com'` |
| `render\.yaml` | 19 | `git grep -l 'render\.yaml'` |
| `mcp__render` | 2 (`.claude/agents/infra-auditor.md`, `audit-reports/FINDINGS.json`) | `git grep -l 'mcp__render'` |
| `/opt/render` | 1 (`bin/render-build.sh`) | `git grep -l '/opt/render'` |

Live facts that CORRECT the spec (appendix refs in brackets):

- `sync-render-secrets.yml` is `disabled_manually`; last run 2026-07-21T23:10Z [A1]. It is dead
  config, not a workflow "syncing hourly to nothing".
- `preview-comment.yml` is `active`; every Cloud Run deploy emits a GitHub `deployment_status`, the
  workflow runs and skips on its `onrender.com` gate: 14 runs since 2026-09-09, all `skipped` [A1].
- `OP_RENDER_SYNC_TOKEN` and `RENDER_API_KEY` are **organization** secrets with `visibility: all`
  [A2]. Repo-level: `RENDER_API_KEY`, `RENDER_SECRET_KEY` (unknown consumer; 0 tracked hits). None
  on the production/staging/dev environments. The 1Password service account behind
  `OP_RENDER_SYNC_TOKEN` asserts read access to the Admin, Shared Dev, Staging and Prod vaults
  (`sync-render-secrets.yml:52-57`).
- `gh api repos/lingolinq/LingoLinq-AAC/environments?per_page=100` -> `total_count=818`, almost all
  Render preview environments (`<branch> - lingolinq-dev-staging-worker PR #N`).
- Serving revisions [A3]: `lingolinq-web-00030-duw` (100%, `latestRevision=false`) and worker pool
  `lingolinq-worker-00020-b7v` (100%). Both mount `CACHE_TOKEN` (secret) and set
  `RAILS_SERVE_STATIC_FILES`; neither carries `RENDER`, `RENDER_GIT_COMMIT` or `SENTRY_RELEASE`.
  The `lingolinq-migrate` Job carries none of `CACHE_TOKEN`, `K_REVISION`, `RENDER*`, `SENTRY*`.
- `lingolinq-n8n.onrender.com` and `lingolinq-prod.onrender.com` still resolve into Render's shared
  ingress (`216.24.57.7/.15`, `gcp-us-west1-1.origin.onrender.com`) [A4]; the names are re-registrable.
- `.claude/agents/infra-auditor.md` is DOCUMENT-REGISTER row `DOC-75b4889dfd` (contentHash pinned,
  NOT attested): PR B must run `scripts/regenerate-register.sh`. `COMPLIANCE.md`,
  `docs/legal/GCP_BAA_ACCEPTED.md`, `COMPLIANCE_POSTURE_REPORT.md`, `SUBPROCESSORS.md`,
  `COMPLIANCE_PROGRAM.md`, `DATA_RETENTION.md`, `BREACH_RUNBOOK.md`, `COMPLIANCE_PROGRAM_OVERVIEW.md`,
  `INCIDENT_LOG.md`, `ANTHROPIC_BAA_ACCEPTED.md` and the three `COMPLIANCE_STATUS_*` snapshots are
  register rows with `attestedContentHash` pinned; `meta.attestationBackfillExemptions` is `[]`.
- cloudrun MCP live tool surface (`tools/list` over stdio, `@google-cloud/cloud-run-mcp`, [A5]):
  read = `list_projects`, `list_services`, `get_service`, `get_service_log`; mutate =
  `create_project`, `deploy_local_folder`, `deploy_file_contents`, `deploy_container_image`.
  Re-enumerate at PR B time; do not carry this forward.
- Cloud Logging filter `severity>=ERROR AND NOT httpRequest:*` parses on `lingolinq-nonprod`;
  positive control shows `httpRequest` entries exist in the window and the `NOT` form returns 0 of
  50 with a `requestUrl` [A6].
- The `render` MCP server is still configured in `~/.claude.json` (off-repo).

Register (FINDINGS.json, 208 findings). Method: hand list from the spec, plus
`jq 'select((.evidence|tostring)|test("render";"i"))'`, plus a whole-object sweep. Vendor-Render
findings and their verified status:

| ID | Status | Sev | Subject |
|---|---|---|---|
| LL-aacae48768 | accepted-risk | high | Render Postgres /0 allowlist (runtime evidence, render-mcp) |
| LL-7314b5a8ea | open | medium | Render Key Value plaintext, shared across envs (`render.yaml:107`) |
| LL-107c9fb665 | open | medium | Render blueprint auto-deploys staging (`render.yaml:6`) |
| LL-40f3571b19 | open | low | Sentry release reads RENDER_GIT_COMMIT (`sentry.rb:367`) |
| LL-ba0585ab93 | open (accepted) | low | Postgres sslmode=require; "owned by the migration thread" |
| LL-7f7372e3eb | verified-closed | high | audited console (closed 2026-08-29; do NOT re-supersede) |
| LL-94e57af291 | open | low | ANTHROPIC_API_KEY provisioned; adversary note names `sync-render-env.js` as an hourly push surface |
| LL-c5fe9e2e3e, LL-8c911f5cfd, LL-b0bc6880e6, LL-9a09771121 | closed/superseded | | already resolved; PR-body completeness only |
| LL-e14ca0ff04 | open | low | anchors to `infra-auditor.md:4` (the `tools:` line PR B rewrites); about memory policy, not Render |

False positives (`rendered`, `render_url`, `document-register-render.rb`): LL-9a3ee852d5,
LL-27d20047db, LL-85038c0a7b, LL-d033b27acd.

## PR A proposal v2 (rule 12: reviewed before any edit)

### Scope rule (replaces the spec's list)

A tracked file is in PR A iff it is one of:

1. dead config, CI, or code that exists only for Render;
2. code, comment, spec, or agent/tool instruction that names a Render host, env var, service, or a
   file PR A deletes;
3. an operational document that ISSUES INSTRUCTIONS (a step an operator would follow) against a
   Render host/service/script, or that presents Render as live.

And it is NOT: (x) a DOCUMENT-REGISTER row (attested or not) -> PR C; (y) a dated point-in-time
record (`audit-reports/**`, `docs/legal/2026-*`, `docs/legal/COMPLIANCE_STATUS_*`,
`docs/task-management/2026-*`, `docs/AI_INFRASTRUCTURE_AUDIT.md`) -> leave, list;
(z) `.claude/agents/infra-auditor.md` and the audit skills -> PR B.

Treatment: **edit where the text is an instruction or a present-tense claim; dated note where the
text is narrative history.** Never rewrite what a runbook says happened.

### Files (34), grouped

**Delete (6):** `render.yaml`, `bin/render-build.sh`, `.github/workflows/sync-render-secrets.yml`,
`.github/workflows/preview-comment.yml`, `scripts/sync-render-env.js`, `scripts/sync-render-env.test.js`.

**Code and specs (6):**
- `config/environments/production.rb:16` (comment) and `:33` (drop `|| ENV['RENDER'].present?`).
- `config/initializers/sentry.rb:367` (remove the RENDER line; resolution moves into
  `SentryInitializer.configure!`).
- `config/initializers/resque.rb:12,42` (comments), `:126-133` (drop the RENDER_GIT_COMMIT tier).
- `spec/initializers/resque_redis_options_spec.rb:130-167` (four examples, see Tests).
- `spec/initializers/sentry_spec.rb` (new examples, see Tests).
- `spec/models/organization_spec.rb:1062` (host -> `https://staging.lingolinq.com/...`; cleanup only,
  `organization.rb:1800-1801` strips any host; not a validation).

**Instruction docs and agent guidance, edited in place (14):**
`docs/ROTATING_KEYS.md` (:22,34-36,44,46,50,60-61,81-95,125-127,142,177: rewrite the rotation steps
for GCP Secret Manager; delete every `onrender.com` host and the hourly-sync claim; drop the dangling
`docs/RENDER-ENV-MANIFEST.md` pointer), `docs/INFRASTRUCTURE.md` (:15-16,61-62,65-110,139,197,212),
`INFRASTRUCTURE.md` (root; :37-60,104,161,176; decide canonical: proposal = make root a pointer to
`docs/INFRASTRUCTURE.md`), `CONTRIBUTING.md` (:20,60,186,191-193), `README.md` (:141,168),
`CLAUDE.md` (:250,315,543), `GEMINI.md:14`, `.github/copilot-instructions.md:15`,
`.gemini/styleguide.md:7`, `.claude/skills/ai-feature-legal-review/SKILL.md:155-160` (drop the deleted
pathspec; name the remaining seams: `deploy-cloudrun.yml`, `scripts/gcp/**`, `.env.op.template`),
`docs/ember-upgrade/KNOWN-ISSUES.md:408` (builds follow `.nvmrc` via `Dockerfile:4,21,86`),
`wsl_setup_complete.sh:115`, `docs/COPY_PERF_TUNING.md:52-59` (drift section -> dated historical
note), `docs/ops/staging-translate-library-job.md` (entire doc is a Render procedure with three
`onrender` URLs: replace the body with a short stub pointing at the Cloud Run Jobs method, keep the
task rationale; `LEARNINGS.md:12601` links it).

**Narrative, dated note only (8):** `scripts/gcp/PHASE4-CUTOVER-DATA-RUNBOOK.md`,
`PHASE5-CLEAN-DB-REHEARSAL.md`, `PHASE5-CUTOVER-RUNBOOK.md`, `scripts/gcp/iam/README.md`,
`scripts/gcp/phase4-seed-app-secrets.sh`, `phase4-seed-boot-secrets.sh`, `phase5-delta-check.sh`
(these three cannot run: they read the live Render API at e.g. `phase4-seed-app-secrets.sh:139-154`;
retained as the cutover evidence chain with a HISTORICAL header, not deleted),
`docs/task-management/LEARNINGS.md:5625-5641` (one dated line on that entry; conflict hotspot, land early).

**Leave, listed:** `docs/legal/COMPLIANCE_STATUS_2026-04-23.md` (superseded register row; dangling
manifest link stays as history), `docs/AI_INFRASTRUCTURE_AUDIT.md`, `docs/task-management/2026-09-03_*`,
`2026-09-05_*`, all `audit-reports/**` snapshots.

**To PR C (found by this sweep, attested rows):** `COMPLIANCE.md:87-154,267,459`,
`docs/legal/GCP_BAA_ACCEPTED.md:75-77`, `docs/legal/COMPLIANCE_POSTURE_REPORT.md:37,137`,
`docs/legal/ANTHROPIC_BAA_ACCEPTED.md:69`, plus the spec's list.

### Fact sheet (rule 13). CONFIRMED unless marked.

- (a) READ sites. `ENV['RENDER']`: only `production.rb:33`, OR-ed with `RAILS_SERVE_STATIC_FILES`,
  which is set on both serving revisions [A3]; the RENDER arm is dead everywhere live.
  `RENDER_GIT_COMMIT`: `sentry.rb:367`, `resque.rb:132`; absent on both serving revisions [A3].
  `bin/render-build.sh`: invoked only by `render.yaml:12`; the image build runs
  `npx ember build` (`Dockerfile:21`) and `rake extras:assert_js` (`Dockerfile:86`), whose copy list
  (`lib/tasks/extras.rake:50-60`) is the same five files render-build copied.
  `scripts/sync-render-env.js`: invoked by `sync-render-secrets.yml:72,98` only; the `.test.js` is
  run by nothing (`ci.yml` runs `scripts/tests/*.sh` only).
- (b) Sentry release shapes after the fix: (1) `SENTRY_RELEASE` set -> the SDK reads it
  (`release_detector.rb` `detect_release_from_env`) and our code must not assign
  (`Configuration#detect_release` is `@release ||=`, an explicit `config.release=` wins);
  (2) `K_REVISION` set (Cloud Run services; differs per service) -> release = revision name;
  (3) neither (dev/test/CI) -> `detect_release` returns early because `sending_allowed?` is false
  (`enabled_environments = %w[production staging]`, `sentry.rb:365`), release stays nil;
  (4) Cloud Run Job `lingolinq-migrate`: no `K_REVISION`, no DSN mount [A3], Sentry not booted.
- (b) `RedisInit.resolved_cache_token` shapes after dropping the tier: `CACHE_TOKEN` (both serving
  revisions [A3]) -> `K_REVISION` -> `'abc'`. Web/worker never reach tier 2 today. Job
  `lingolinq-migrate` resolves `'abc'` before and after (no CACHE_TOKEN, no K_REVISION [A3]);
  pre-existing, noted for the register, not this PR. Hazard if CACHE_TOKEN were ever unmounted:
  web and worker would split onto different revision names (disjoint permission caches); pre-existing.
- (c) Cross-file claims checked: `organization.rb:1800-1801` strips `^https?://[^/]+/`;
  `citation-check.rb:80-85` reads `git show <evidence.sha>:<path>`; `ACTIVE_STATUSES`
  (`citation-check.rb:33`) includes `verified-closed`; `git grep` with one nonexistent pathspec among
  live ones exits 1 silently (`ai-feature-legal-review` degrades, does not break).

### Candidate fixes and the one chosen

1. Sentry release. **A (chosen):** `SentryInitializer.release_from(env = ENV)` returns
   `env['K_REVISION']` only when `env['SENTRY_RELEASE']` is blank; `configure!` calls it and assigns
   only when non-nil. The `Sentry.init` block's RENDER line is deleted. B: also inject
   `SENTRY_RELEASE=${{ github.sha }}` from `deploy-cloudrun.yml` (four `--set-env-vars` sites):
   better tag, deploy-path blast radius, rejected here, follow-up. C: `s/RENDER_GIT_COMMIT/K_REVISION/`
   on `:367`: overrides an operator `SENTRY_RELEASE`, untestable; rejected.
2. Resque cache token: drop tier 2, keep order, fix comments. Keeping the dead tier rejected: its
   comment claims Render is "current platform".
3. `preview-comment.yml`: delete. Nothing produces per-PR Cloud Run previews; a re-gate guards a path
   that cannot fire.
4. `sync-render-secrets.yml` + `sync-render-env.js` + test: delete. Rationale: the script's only job
   is to push 1Password values into a platform that no longer exists; LL-94e57af291's adversary
   correction already treats it as a credential-push surface to remove. (v1's "manifest role moved to
   `phase4-seed-app-secrets.sh`" was false: that script reads the live Render API, `:130,139-154`.)
5. Docs: per the scope rule above (edit instructions, note narrative).

### Tests and the mutation that must make each fail

- `spec/initializers/resque_redis_options_spec.rb`, all four RENDER_GIT_COMMIT examples:
  - `:138` "prefers CACHE_TOKEN": decoy re-pointed to `K_REVISION`. Mutation: reorder tiers -> red.
  - `:143` "falls back to the Render deploy SHA": replaced by "ignores RENDER_GIT_COMMIT"
    (`RENDER_GIT_COMMIT=deadbeef`, `K_REVISION=svc-00001-abc` -> `svc-00001-abc`). Mutation:
    restore the tier -> `deadbeef` -> red.
  - `:155` "blank env value is unset": fallthrough re-pointed at `K_REVISION` (`CACHE_TOKEN=''`,
    `K_REVISION=svc-00001-abc` -> `svc-00001-abc`). Would go RED unchanged after the tier drop
    (returns `'abc'`). Mutation: drop `.presence` -> `''` -> red.
  - `:164` "deterministic": fixture changed to `CACHE_TOKEN` so it is not `'abc'=='abc'`.
- `spec/initializers/sentry_spec.rb`, `SentryInitializer.configure!` (the path the init block runs):
  `K_REVISION=web-00042-abc` -> `config.release == 'web-00042-abc'`;
  `SENTRY_RELEASE=sha1, K_REVISION=x` -> `config.release` untouched (nil on a bare Configuration);
  `K_REVISION='  '` -> nil. Mutations: drop the SENTRY_RELEASE guard -> example 2 red; drop the
  blank check -> example 3 red.
- Integration example: `load Rails.root.join('config/initializers/sentry.rb')` inside the existing
  DSN `around` block with `RENDER_GIT_COMMIT=deadbeef` and nothing else set ->
  `Sentry.configuration.release != 'deadbeef'`. Mutation: leave the old `:367` line in the init
  block -> `deadbeef` -> red. (Guards the wiring, which helper tests cannot.)
- `spec/models/organization_spec.rb:1058`: re-run; no mutation claimed (cleanup).
- Pre-merge gate for the deletions (deterministic, run on the PR head, expected empty):
  `git grep -n -E 'render-build|sync-render-env|sync-render-secrets|preview-comment|render\.yaml' -- ':!audit-reports' ':!docs/legal' ':!docs/task-management'`
  Post-merge `gh workflow list --all` is operational confirmation, not a test.

### Register impact (PR A remediates subjects; only Scot closes)

- Subject deleted: LL-107c9fb665 (`render.yaml`), LL-7314b5a8ea (Render Key Value),
  LL-aacae48768 (Render Postgres). Disposition proposals staged in PR C's body.
- Fixed here: LL-40f3571b19 -> propose `remediated-unverified` (PR C body).
- Partial: LL-94e57af291's Render residence (`sync-render-env.js:144-145,686-687`) is removed; key
  revocation and the Secret Manager version remain open, out of scope.
- Anchors into deleted files, all sha-pinned so `citation-check` reads them via `git show`:
  LL-c5fe9e2e3e (`render.yaml:84`), LL-7314b5a8ea (`render.yaml:107`), LL-107c9fb665
  (`render.yaml:6`), LL-b0bc6880e6 (`sync-render-secrets.yml:14`, verified-closed, validated).
  0 active findings carry a file anchor with a blank sha, so the working-tree fallback cannot fire.
- No PR A file is a DOCUMENT-REGISTER or CAPABILITY-LEDGER row; no regenerate step needed in A.

### Off-repo actions PR A's body must name (owner: Scot)

1. Revoke the 1Password service account behind `OP_RENDER_SYNC_TOKEN` (reads the Prod vault).
2. Delete org secrets `OP_RENDER_SYNC_TOKEN`, `RENDER_API_KEY`; repo secret `RENDER_SECRET_KEY`.
3. Remove the `render` MCP server from `~/.claude.json`; retire the brain's
   `scripts/sync-render-env.js` and `commands/sync-secrets.md` (brain PR).
4. Verify the old AWS IAM key on `lingolinq-app` that Render held is deactivated
   (`scripts/gcp/iam/README.md:75-80`).
5. 818 stale GitHub deployment environments.

### Risks and open questions

- PR A at 34 files is 3x the spec's estimate. Alternative split offered to Scot: A1 = deletes +
  code/specs + agent-instruction files (19); A2 = operational docs (15), which carries the
  addendum's error mode (GCP-replacement claims about deploy/CI/traffic must each be verified live).
- Rewriting `docs/ROTATING_KEYS.md` for Secret Manager requires stating the real rotation path;
  every such sentence needs a live check before it is written.

## Evidence appendix (2026-09-12)

[A1] `gh workflow list --repo lingolinq/LingoLinq-AAC --all --json name,state,path`:
`.github/workflows/preview-comment.yml active`; `.github/workflows/sync-render-secrets.yml disabled_manually`.
`gh run list --workflow=sync-render-secrets.yml --limit 6`: newest `2026-07-21T23:10:31Z schedule completed success`.
`gh run list --workflow=preview-comment.yml --limit 50` filtered `createdAt >= 2026-09-09`: `count=14 conclusions=skipped`.

[A2] `gh api 'orgs/lingolinq/actions/secrets?per_page=100'`: `OP_RENDER_SYNC_TOKEN all`, `RENDER_API_KEY all`.
`gh secret list --repo lingolinq/LingoLinq-AAC`: `RENDER_API_KEY`, `RENDER_SECRET_KEY`.
`gh api repos/.../environments/{production,staging,dev}/secrets?per_page=100`: no `RENDER*`/`OP_*`.

[A3] `gcloud run services describe lingolinq-web --region us-central1 --project lingolinq-prod`:
`status.traffic = [lingolinq-web-00030-duw 100% latestRevision=false]`; revision env (names only):
`RAILS_SERVE_STATIC_FILES plain, SENTRY_ENVIRONMENT plain, SENTRY_DSN secret, CACHE_TOKEN secret`.
`gcloud beta run worker-pools describe lingolinq-worker`: split `lingolinq-worker-00020-b7v 100%`;
env: `SENTRY_ENVIRONMENT plain, SENTRY_DSN secret, CACHE_TOKEN secret, RAILS_SERVE_STATIC_FILES plain`.
`gcloud run jobs describe lingolinq-migrate`: env grep for `CACHE_TOKEN|K_REVISION|RENDER|SENTRY` -> none.

[A4] `getent hosts lingolinq-n8n.onrender.com lingolinq-prod.onrender.com` ->
`216.24.57.15 / 216.24.57.7 gcp-us-west1-1.origin.onrender.com.cdn.cloudflare.net`.

[A5] `node mcp-tools-list.mjs npx -y @google-cloud/cloud-run-mcp` (initialize + tools/list):
`list_projects, create_project, list_services, get_service, get_service_log, deploy_local_folder,
deploy_file_contents, deploy_container_image`.

[A6] `gcloud logging read 'resource.type="cloud_run_revision" AND httpRequest:*' --project lingolinq-nonprod --limit 2 --freshness=7d`
-> 2 entries with `requestUrl`; same with `NOT httpRequest:*` `--limit 50` -> 0 entries with `requestUrl`.

## PR A1 execution record (2026-09-12)

Scot's go (2026-09-12): A1/A2 split, K_REVISION only, delete `preview-comment.yml`.
Branch `scot/chore/render-dead-config-removal` from `origin/develop @ 4c2adc976`.

- Baseline before edits: `rspec spec/initializers/resque_redis_options_spec.rb spec/initializers/sentry_spec.rb spec/models/organization_spec.rb:1058`
  -> 91 examples, 0 failures.
- Red first: new/rewritten examples run against the untouched code -> 96 examples, 4 failures, all the
  traced mechanisms (`resque_redis_options_spec.rb:148`, `sentry_spec.rb:594,645,651`).
- Green after the fix: 97 examples, 0 failures.
- Falsification (restore from scratchpad copies, never `git checkout`):
  - restore the RENDER_GIT_COMMIT tier in `resque.rb` -> 1 failure, `:148 ignores RENDER_GIT_COMMIT`.
  - drop the SENTRY_RELEASE guard in `release_from` -> 1 failure, `:601 operator override wins`.
  - drop the blank check -> 1 failure, `:609 blank K_REVISION`.
  - put `config.release = ENV['RENDER_GIT_COMMIT']` back in the init block -> 1 failure,
    `:651 does not let RENDER_GIT_COMMIT reach the release` (the wiring test).
  - `diff` against the backups after restore: identical.
- Validators on the A1 tree: `citation-check.rb` PASS 192 / FAIL 0; `document-register-render.rb --check` OK;
  `capability-check.rb --check` OK; `compliance-notion-publish.rb --check` OK; `git diff --check` clean.
- Deletion gate (A1 scope; `docs/`, `scripts/gcp/` are A2, `.claude/agents` + audit skills are PR B):
  `git grep -n -E 'render-build|sync-render-env|sync-render-secrets|preview-comment|render\.yaml' -- ':!audit-reports' ':!docs' ':!scripts/gcp'`
  -> only `.claude/agents/infra-auditor.md:72,94` and `.claude/skills/soc2-security-audit/SKILL.md:14,32` (PR B).

## PR A1 dual review round 2 (head 29a4e2c22) and fixes

Findings file: `dual-review-round2-pra1.md` (session scratchpad; copied into the PR body). Verdict
request-changes on one High: Cloud Run injects `K_REVISION` into services only. Verified against
Google's container contract (fetched 2026-09-12): services get `K_SERVICE`/`K_REVISION`/
`K_CONFIGURATION`; worker pools get `CLOUD_RUN_WORKER_POOL`/`CLOUD_RUN_REVISION`; Jobs get
`CLOUD_RUN_JOB`/`CLOUD_RUN_EXECUTION`/`CLOUD_RUN_TASK_*`. Live: `lingolinq-scheduler` Job mounts
`SENTRY_DSN` with `SENTRY_ENVIRONMENT=production` and `CACHE_TOKEN`, so it boots Sentry [A7].

Restructure (one root cause: "K_REVISION exists everywhere on Cloud Run"): `release_from` reads
`K_REVISION` then `CLOUD_RUN_REVISION`; the Job stays untagged (its only per-run identity,
`CLOUD_RUN_EXECUTION`, changes every execution and would create a Sentry release per hourly
scheduler run, so it is deliberately not used). Comments in `sentry.rb` and `resque.rb` restate the
contract. Decision re-raised to Scot: `SENTRY_RELEASE=${{ github.sha }}` in `APP_ENV_VARS_STATIC`
(`deploy-cloudrun.yml:438`, one line, consumed by web, worker and scheduler at `:874`, `:1137`,
`:1177`) would tag all three surfaces with a commit SHA; excluded from A1 per his earlier
"K_REVISION only" call, which predates this finding.

- Red first: worker-pool examples against the unfixed code -> 77 examples, 2 failures
  (`sentry_spec.rb:603,674`). Green after: 101 examples, 0 failures.
- Mutations (restored from copies, diff identical): drop the `CLOUD_RUN_REVISION` tier -> `:603,:674`
  red; drop the `SENTRY_RELEASE` guard -> `:610,:680` red; old RENDER line back in the init block ->
  `:693` red.
- Also fixed in A1 scope: `bin/audit_console:5`, `weekly-release-pr.yml:83`, two misdated sentences,
  spec `around` restores `SENTRY_ENVIRONMENT`, `Configuration.new` wrapped for `DummyTransport` and
  zero worker threads in the load examples.

[A7] `gcloud run jobs describe lingolinq-scheduler --region us-central1 --project lingolinq-prod`:
env `RAILS_SERVE_STATIC_FILES=true`, `SENTRY_ENVIRONMENT=production`, `SENTRY_DSN` (secret),
`CACHE_TOKEN` (secret); args `exec rake scheduler:dispatch`. `docs.cloud.google.com/run/docs/container-contract`
(2026-09-12): K_REVISION listed under services only.

## Status

- [x] Phase 1 inventory (2026-09-12).
- [x] Dual review round 1 on proposal v1: request-changes; v2 written (2026-09-12).
- [x] Scot's go: A1/A2 split, K_REVISION only, delete preview-comment.yml (2026-09-12).
- [ ] PR A1 #962 (draft; round 2 fixed, round 3 pending) -> A2 -> B -> C.
