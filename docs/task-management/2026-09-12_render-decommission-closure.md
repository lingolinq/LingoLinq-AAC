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

Line numbers in this section are at the pre-rebase baseline `4c2adc976` and were correct there.
#961 later rewrote `CLAUDE.md` (193 lines at HEAD), `GEMINI.md` (10) and `LEARNINGS.md` (curated to
294; the archive `learnings-archive/LEARNINGS-2026-01_to_2026-09.md` holds the old text, where the
`staging-translate-library-job` note is at `:4103`), and moved `.gemini/styleguide.md` to
`docs/archive/gemini-code-assist/`, so pointers into those four files do not resolve at HEAD; this PR's
own edits move others in the same way (`production.rb`, `sentry.rb`, `resque.rb`, `KNOWN-ISSUES.md`,
`wsl_setup_complete.sh`). The A2 hand-off re-resolves what it needs from the re-baselined scope
below, not from this list.

**Delete (6):** `render.yaml`, `bin/render-build.sh`, `.github/workflows/sync-render-secrets.yml`,
`.github/workflows/preview-comment.yml`, `scripts/sync-render-env.js`, `scripts/sync-render-env.test.js`.

**Code and specs (6):**
- `config/environments/production.rb:16` (comment) and `:33` (drop `|| ENV['RENDER'].present?`).
- `config/initializers/sentry.rb:367` (remove the RENDER line; resolution moves into
  `SentryInitializer.configure!`).
- `config/initializers/resque.rb:12,42` (comments), `:126-133` (drop the RENDER_GIT_COMMIT tier).
- `spec/initializers/resque_redis_options_spec.rb`, the `.resolved_cache_token` describe block (four examples, see Tests).
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
  (`enabled_environments = %w[production staging]` in `sentry.rb`), release stays nil;
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
  traced mechanisms (the resque example "ignores RENDER_GIT_COMMIT" and the sentry examples named in the
  falsification list below).
- Green after the fix: 97 examples, 0 failures.
- Falsification (restore from scratchpad copies, never `git checkout`):
  - restore the RENDER_GIT_COMMIT tier in `resque.rb` -> 1 failure, "ignores RENDER_GIT_COMMIT".
  - drop the SENTRY_RELEASE guard in `release_from` -> 1 failure, "assigns nothing when SENTRY_RELEASE is set".
  - drop the blank check -> 1 failure, "treats a blank K_REVISION as unset".
  - put `config.release = ENV['RENDER_GIT_COMMIT']` back in the init block -> 1 failure,
    "does not let RENDER_GIT_COMMIT reach the release" (the wiring test).
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
  ("tags the release with CLOUD_RUN_REVISION on a Cloud Run worker pool" and "uses CLOUD_RUN_REVISION as
  the release on a Cloud Run worker pool"). Green after: 101 examples, 0 failures.
- Mutations (restored from copies, diff identical): drop the `CLOUD_RUN_REVISION` tier -> both
  worker-pool examples red; drop the `SENTRY_RELEASE` guard -> "assigns nothing when SENTRY_RELEASE is set"
  and "lets an operator SENTRY_RELEASE win" red; old RENDER line back in the init block ->
  "does not let RENDER_GIT_COMMIT reach the release" red.
- Also fixed in A1 scope: `bin/audit_console:5`, `weekly-release-pr.yml:83`, two misdated sentences,
  spec `around` restores `SENTRY_ENVIRONMENT`, `Configuration.new` wrapped for `DummyTransport` and
  zero worker threads in the load examples.

[A7] `gcloud run jobs describe lingolinq-scheduler --region us-central1 --project lingolinq-prod`:
env `RAILS_SERVE_STATIC_FILES=true`, `SENTRY_ENVIRONMENT=production`, `SENTRY_DSN` (secret),
`CACHE_TOKEN` (secret); args `exec rake scheduler:dispatch`. `docs.cloud.google.com/run/docs/container-contract`
(2026-09-12): K_REVISION listed under services only.

## PR A1 dual review round 3 (head 5fdbc4e54) and fixes

Codex: approve, 1 Medium (no example set both revision variables) + 1 Low (stale example names in
the body). Adversary: request-changes narrowly, 5 Medium + 6 Low; CI green on 5fdbc4e54 confirmed by
both. Findings file: `dual-review-round3-pra1.md`. Root cause shared by the sweep findings: the
re-sweep was ad hoc. Restructure: one mechanical sweep,
`git grep -n -E '\bRender\b|onrender|RENDER_[A-Z]' -- app lib config spec bin .github Dockerfile`,
every hit disposed of (fixed if instruction or present tense; left and listed if dated history).

- Fixed (10 sites): `sentry.rb:312` (health-gate wording) and the `.dockerignore` dependency in the
  `release_from` comment; `session_controller.rb:736`; `database.yml` (the url-branch comment);
  `imagemagick_limits.rb:6,11,13`; `console_guard.rb:62` and its RAILS_ENV=production comment;
  `library_board_translator.rb:25` (runtime raise told operators a Render Job inherits the web env;
  Cloud Run Jobs do not) and `:208`; `lingolinq.rake:6`; `scheduler.rake` scheduler:dispatch desc (now names the
  `lingolinq-scheduler` Cloud Run Job); `sentry_spec.rb:414`; `resque_redis_options_spec.rb:6,39`.
  (A `CLAUDE.md:542` comma fix listed here originally was dropped by the #961 rebase: #961 rewrote
  that file and it is not in this diff.)
- Left as dated history, listed in the PR body: `Dockerfile:69`, `config/initializers/write_freeze.rb`
  (env-gated cutover middleware; removal is a separate cleanup), `lib/gcp_clean_db_guard.rb`,
  `lib/tasks/gcp_clean_db.rake`, `lib/tasks/phase4_sequences.rake`, `deploy-cloudrun.yml` comments.
- Specs: "prefers K_REVISION when both revision variables are present" (mutation h, swapped order ->
  red at `:610`); "treats a blank CLOUD_RUN_REVISION as unset"; a Job-shaped example with
  `SENTRY_ENVIRONMENT=production` (asserts `sending_allowed?` true) and `detect_release_from_git`
  stubbed nil to model `.dockerignore` excluding `.git`. Green: 104 examples, 0 failures.
- Not changed, recorded for follow-up: `RedisInit.resolved_cache_token` tier 2 is per-surface by
  construction (services get `K_REVISION`, the worker pool does not), so if `CACHE_TOKEN` were ever
  absent the surfaces would split. Candidates: drop tier 2 (all surfaces fall to the static literal,
  the LL-c6dd65a2aa problem), raise at boot in production when `CACHE_TOKEN` is blank (fail-closed
  but turns a mis-mounted revision into an outage; mounts have been non-monotonic before), or log
  loudly. Register note proposed under LL-c6dd65a2aa in PR C; not decided in A1.
- Decision re-raised with the supersession stated: `SENTRY_RELEASE=${{ github.sha }}` in
  `APP_ENV_VARS_STATIC` would tag all three surfaces with the commit SHA and make `release_from`
  a fallback that never runs live (shapes 2 and 3 replaced by SHAs).

## 2026-09-13: #961 merged; PR A1 rebased and re-baselined

`chore: consolidate the AI-agent configuration (#961)` merged to develop at 2026-09-13T07:22Z and
consumed part of A1, most of A2 and the core of B: it deleted `sync-render-secrets.yml`,
`preview-comment.yml`, `scripts/sync-render-env.js` and its test; rewrote `CLAUDE.md`, `GEMINI.md`,
`.github/copilot-instructions.md`, the legal-review skill, `docs/INFRASTRUCTURE.md`,
`docs/ROTATING_KEYS.md` (Secret Manager rotation steps), `README.md`, `CONTRIBUTING.md`; deleted root
`INFRASTRUCTURE.md`; added dated notes to `PHASE4-CUTOVER-DATA-RUNBOOK.md`, `PHASE5-CUTOVER-RUNBOOK.md`
and the two seed scripts; removed every `mcp__render` grant from `.claude/agents/infra-auditor.md`
(GCP/AWS read state is now read-only CLI, no cloudrun MCP); curated `LEARNINGS.md` to 294 lines with a
byte-preserved archive. Its task log lists the org/repo secret removals as off-repo actions.

A1 was rebased onto develop (`git rebase origin/develop`, the four #961-rewritten files resolved
to develop's versions, the archived Gemini styleguide restored byte-for-byte). Net diff: 22 files.

Round 4 (head 20d2e376d): findings file `dual-review-round4-pra1.md`; all applied in 214218fdf,
including a platform-noun sweep (`heroku|startup probe|blueprint|cron job`) that caught
`Dockerfile:110` (false startup-probe claim) and `bin/push_deploy` (dead Heroku deploy script).
Green: 105 examples, 0 failures. Mutations i (blank CLOUD_RUN_REVISION) and j (`.git` removed
from a scratch `.dockerignore`) each red on their example.

Re-baselined remaining scope:
- **A2** (7 files): `docs/ops/staging-translate-library-job.md` (first: the only runbook for the
  reworded raise, still POSTs to api.render.com), `docs/COPY_PERF_TUNING.md:52-59`,
  `scripts/gcp/PHASE5-CLEAN-DB-REHEARSAL.md`, `scripts/gcp/iam/README.md:4-5` (present tense),
  `scripts/gcp/phase5-delta-check.sh` (header note), `README.md:144` (round 8: lists
  `rake check_for_expiring_subscriptions (run daily)` as an operator task; nothing in the repo invokes
  it, the scheduler Job runs an inline copy), and `docs/INFRASTRUCTURE.md:159,178` (round 5:
  #961's rewrite still lists `DATABASE_URL` as required per service and worker; Cloud Run mounts
  `DB_HOST`/`DB_NAME`/`DB_USERNAME`/`DB_PASSWORD` and the socket-form URL fails boot).
- **B**: the cloudrun-tool question is settled by #961 (CLI only). Remaining: the three "legacy files
  present in the tree" sentences (`infra-auditor.md:68`, `soc2-security-audit/SKILL.md:34-35`,
  `.claude/rules/deploy.md:16`) that dangle once A1 merges (rewrite, not delete: `Procfile` is
  still what `foreman start` reads per `README.md`), plus `gcloud logging read` PII scoping (nothing on develop scopes it;
  filter `severity>=ERROR AND NOT httpRequest:*` verified [A6]; prohibition phrased on identifiers).
  `infra-auditor.md` is an unattested register row: regenerate in the same PR.
- **C**: unchanged.

## PR A1 dual review round 5 (head 6659a2cc7) and fixes

Findings file `dual-review-round5-pra1.md`. Codex: 1 Medium, 1 Low. Adversary: 3 Medium, 5 Low.
Cross-confirmed Medium: the `config/database.yml` url-branch comment ("nothing exercises it today") was false in the
opposite direction from round 4. `Dockerfile:52` sets `RAILS_ENV=production` and `Dockerfile:82`
exports a dummy host-form `DATABASE_URL` for `assets:precompile`, so every image build renders the
`url:` branch (`DATABASE_URL=... ruby -rerb -e ...` emits `url:` under `production: primary:`).
Fix: the comment names its two readers (Cloud Run runtime -> discrete vars; image build -> url).
Lesson: a universal ("nothing", "every") about a config branch needs each read site enumerated.

Other fixes:
- `lib/tasks/scheduler.rake:1` desc said a live task "is called by the Heroku scheduler add-on".
  The round-4 noun sweep was case-sensitive (`heroku` caught `bin/push_deploy`, not `Heroku`).
  Re-run with `-i`: `git grep -I -n -i -E '\bheroku\b|railway|onrender|shell tab|add-on' HEAD --
  lib config spec bin Dockerfile .github 'app/**/*.rb' ':!lib/mobyposi.i'` (the `-I` binary skip
  does not catch that word list). Residual hits: two URL citations, past-tensed `bin/audit_console:7`,
  and `config/shards.yml:24` (legacy follower code, already under Not covered).
- `lib/audit/console_guard.rb` RAILS_ENV comment: the `RAILS_ENV=production` guarantee is the image default
  (`Dockerfile:52`); the workflow inline value covers only its four surfaces; two hand-made prod Jobs
  (`lingolinq-admin-audit`, `lingolinq-identify-check`) set neither env var (read-only
  `gcloud run jobs describe`, adversary, 2026-09-13).
- Guards strengthened: the `.dockerignore` example accepts `.git/` and rejects a `!.git` re-include
  (mutation k red: `expected ["!.git"].empty?`; `.git/` spelling green). The resque
  `ignores RENDER_GIT_COMMIT` example now sets no other source and expects the literal, so a Render
  tier at any chain position fails (mutation l: tier below `K_REVISION` -> `got: "deadbeef"`; the
  round-4 shape returned `svc-00001-abc` under the same mutation, i.e. stayed green).
- Body: wiring examples are six, not seven (block holds 7 `it`, one is the `.dockerignore` pin);
  #961 deleted root `INFRASTRUCTURE.md` (fixed here too); PR-B row gains `.claude/rules/deploy.md:16`;
  Not covered gains the archived styleguide line and `deploy-cloudrun.yml:384` undated tense.
- Deferred to A2: `docs/INFRASTRUCTURE.md:159,178` (`DATABASE_URL` required per service).
Green after fixes: 105 examples, 0 failures; `git diff --check` clean.

## PR A1 dual review round 6 (head 4f9982bf3) and fixes

Findings file `dual-review-round6-pra1.md`. Codex: 1 Medium, 1 Low. Adversary: 1 Medium, 5 Low.
- Medium (adversary): the round-5 `scheduler.rake:1` desc said `scheduler:dispatch` "runs this"
  task. It does not: the dispatch block at `:137-142` is a hand-duplicated copy of the task body
  (no `Rake::Task[...].invoke` anywhere in the file), so an edit to the task never runs in
  production. Desc now says production never invokes the task and dispatch runs an inline copy;
  a comment at the copy points back. "Or invoke it directly" dropped (rake is the unaudited path,
  LL-7f7372e3eb). Making dispatch invoke the task and deleting the copy is a separate change.
- Medium (Codex): "every container build renders the url branch" was a new universal (a
  `--target frontend-builder` build would not; nothing builds that way, but the sentence claimed
  more than the tree). Adversary: "every Cloud Run surface mounts DB_*" was false for
  `lingolinq-identify-check` (runs `identify -version`, no env at all; read-only
  `gcloud run jobs describe`), and CI (`ci.yml:41-43`) and docker-compose (`:34,54`) also set
  `DATABASE_URL` and so render the url branch without booting against it. The comment was
  restructured once: which branch renders depends only on whether `DATABASE_URL` is set; no
  Rails-booting Cloud Run surface sets it; the url branch renders in the runtime-image build
  (boots against it), CI and docker-compose (render only). Console-guard comment names the two
  hand-created Jobs instead of "hand-created Jobs".
- `.dockerignore` example: positive match accepts `.git`, `.git/`, `**/.git`; negative rejects any
  `!` entry naming `.git` or a path beneath it (`!.git/**`, `!**/.git`), at any position.
  Mutation k2 (`!.git/**` appended) red. Resque example: `RENDER` added to the scrub list and set
  in the example, so a tier gated on the platform flag is caught (mutation m red).
- Working log round-3 fix list: two locators shifted by the comment growth replaced with quoted
  phrases. Body `:1` "four dual-review rounds" -> "the dual-review rounds".
Green after fixes: 105 examples, 0 failures; `git diff --check` clean.

## PR A1 dual review round 7 (head 8dcda2176) and fixes

Findings file `dual-review-round7-pra1.md`. Codex: 1 Medium, 3 Low. Adversary: 1 Medium, 5 Low.
Cross-confirmed Medium: the round-6 comment said the url branch "depends only on whether
DATABASE_URL is set"; the ERB condition (`<% if ENV['DATABASE_URL'].to_s.strip.empty? && ...`) also checks `LEADER_POSTGRES_URL`
(`LEADER_POSTGRES_URL=... ruby -rerb ...` emits `url:`), and a blank value counts as unset. This
comment sits above the fleet-wide boot-failure note, and `shards.yml:25` prefers
`LEADER_POSTGRES_URL`, so the omission mattered. Comment restructured around the real selector.
Other fixes: BOOT_SECRETS attributed only to the four workflow-managed surfaces; hand-created Jobs
that boot Rails mount the same four by hand (`lingolinq-admin-audit` env names read-only, 2026-09-13).
`scheduler.rake:1`: "Production never invokes" -> "No automated production path invokes" (an
operator can `--args` override `lingolinq-migrate`), Job family form `lingolinq-scheduler*` as at
`:66`, and the copy is "of its operational calls" (the task's `puts` lines are omitted).
`console_guard.rb`: the two-Jobs claim dated as read-only gcloud evidence, not a tree fact.
`.dockerignore` example also rejects bare wildcard re-includes (`!*`, `!**`, `!.*`); mutations
each red, the three legitimate `!` entries green. Resque `around` scrubs every `RENDER*` key and
the example sets `RENDER_SERVICE_ID` too (mutation n, tier gated on it, red).
Working log: round-5 locators into the grown comments replaced with phrases; the round-3 list
claimed a `CLAUDE.md:542` fix the #961 rebase dropped (count 11 -> 10).
Lesson (three rounds running): every sentence that summarises a condition must be checked against
the condition's own text, not against memory of it.

## PR A1 dual review round 8 (head 1476ae817) and fixes

Findings file `dual-review-round8-pra1.md`. Codex: 1 Medium, 4 Low. Adversary: 1 Medium, 5 Low.
- Medium (Codex): develop's own sentence two lines above the round-7 selector ("when DATABASE_URL is
  absent we configure ... from discrete env vars") contradicted it. Now "when both DATABASE_URL and
  LEADER_POSTGRES_URL are blank". Editing the sentence after it and leaving it was the round-7 miss.
- Medium (adversary): this log's own falsification record used spec line numbers that the later
  rounds shifted (round-1 and round-3 sections pointed at `end` lines; the round-7 section cited
  `database.yml:41` for the `<% if ENV['DATABASE_URL'].to_s.strip.empty? && ...` condition, which that
  commit had moved). Every example locator in the
  log is now the example's quoted title; the condition is quoted by its own text.
- Lows: the database.yml runtime claim carries the same dated read-only-gcloud parenthetical as
  console_guard; the scheduler desc names the prod Job and its hourly trigger and states the staging
  Job has none (`gcloud scheduler jobs list` in `lingolinq-nonprod`: none, adversary 2026-09-13), and
  "nothing in this repo invokes this task" replaces the universal; `README.md:144` still lists the
  task as an operator daily and goes to A2 (7 files).
- `.dockerignore` example now matches each `!` entry with `File.fnmatch?` (pathname + dotmatch)
  against `.git` and paths under it, so `!.g*`, `!.[a-z]*`, `!?git`, `!.gi?`, `!**/*` are caught as
  well as the literal spellings; `./` prefix stripped; legitimate entries (`!tmp/keep`,
  `!.gitkeep`, `!config/.gitkeep`, `!.github/**`) stay green (simulation `fnmatch_sim.rb`, 18 re-include
  and 8 legitimate candidates). Resque: a second example slices `resolved_cache_token` from the source
  and pins that no `RENDER` token appears, closing the "gated on a variable the probe never sets"
  residual exhaustively (mutation o: tier gated on `RENDER_EXTERNAL_URL` -> red).
Green after fixes: 106 examples, 0 failures.

## PR A1 dual review round 9 (head 165fe952f) and fixes

Findings file `dual-review-round9-pra1.md`. Codex: 1 Medium, 3 Low. Adversary: 1 Medium, 6 Low.
Cross-confirmed Medium: the round-8 `.dockerignore` pin (`File.fnmatch?`) let `!/.git`, `!.git/.`,
`!././.git` and deep-`**` forms (`!.git/objects/**`) through, because Docker disregards leading and
trailing slashes and its `**` crosses directories, and the comment claimed the coverage was complete.
Fix: a small translator in the spec (`dockerignore_pattern_re`) models Go filepath.Match plus Docker
`**` and slash normalisation; the positive side uses it too (any exclusion matching `.git`, not only
the literal spellings). Simulation `docker_glob_sim.rb`: 29 re-include spellings caught, 11
legitimate entries pass; the comment now says it is a model with two stated gaps (ordering, and any
shape it mis-translates).
Lows: the whole runtime sentence in `database.yml` now carries the dated read-only parenthetical
(not just the hand-created-Jobs clause) and a clause on what the url branch emits (a blank
`DATABASE_URL` beside a valid `LEADER_POSTGRES_URL` renders an empty `url:`; `shards.yml` prefers the
opposite order; behaviour unchanged from develop). `scheduler.rake`: `rake -T` prints only the first
sentence of a desc, so the desc is one sentence and the Cloud Run facts (prod Job, hourly trigger,
staging Job untriggered and never executed) sit in a dated `#` comment above the task. Resque source
pin: slice anchored on the next two-space `def`; comment states it catches a literal `RENDER` token,
comments included, and not indirection; "exhaustive" dropped. Log: the round-8 record's own
`:43` replaced with the condition's text; the Phase-1 file list now states its baseline SHA and which
four files #961 invalidated (the `LEARNINGS.md:12601` pointer resolves in the archive at `:4103`).
Green after fixes: 106 examples, 0 failures.

## PR A1 dual review round 10 (head a648d93e3) and fixes

Findings file `dual-review-round10-pra1.md`. Codex: request-changes, 1 Medium, 1 Low. Adversary:
approve, 6 Low. Medium (Codex, cross-confirmed by an adversary Low): moby cleans each pattern with
`filepath.Clean` after TrimSpace, so `!.git/foo/..` and `! .git` re-include `.git` and slipped past
the round-9 translator. Fix: `Pathname#cleanpath` (a lexical Clean) plus `strip` after the `!`;
the class scanner is escape-aware (`[\]]`, a leading `]`), a leading `^` is dropped (moby leaves it
unescaped, Go reads it as an anchor), and an unterminated `[` raises with a clear message instead
of `NoMethodError`. Simulation `docker_glob_sim2.rb`: 36 re-include spellings caught, 17 legitimate
pass; in-spec mutations 16 red, 7 green. Comment restored to "a representative path beneath it" and
names three gaps (ordering, finite sample, mis-translation). `.git/config` added to the sample.
Lows: the scheduler comment's dated qualifier now heads the live-state sentence so it covers the
prod trigger as well as the staging Job; two more stale locators in the log (`scheduler.rake:66`,
`sentry.rb:365`) replaced with text; the Phase-1 baseline note says this PR's own edits move
pointers too. Green after fixes: 106 examples, 0 failures.

## PR A1 dual review round 11 (head 4fca93c3d) and fixes

Findings file `dual-review-round11-pra1.md`. Codex: request-changes, 1 Medium. Adversary: approve,
1 Medium, 2 Low. Cross-confirmed Medium: the round-10 scanner rewrote `[!` to `[^` (fnmatch
semantics). moby passes `[` and `]` raw into an RE2 regexp, where only `^` negates, so `![!.]git`
and `!.[!g]it` are re-includes of `.git` that the model let through, and `!.g[!x]t` was wrongly
flagged. Round 9's verbatim class copy had been right. Fix: no rewrite, only `^` skipped as the
negation marker; escape-aware scan and the literal leading `]` kept. Lows: any number of leading
`^` stripped (`!^^.git`); a mid-pattern `**` translates to `(?:.*/)?` as moby does; a trailing `\`
raises as Docker rejects it; and the positive side now requires a literally spelled exclusion
(`.git` or `**/.git` after cleaning) because the model's looseness is safe for `!` entries and
unsafe for the exclusion check. Simulation `docker_glob_sim3.rb`: 42 re-include spellings caught,
21 legitimate pass. Green after fixes: 106 examples, 0 failures.

## PR A1 dual review round 12 (head e3d53f10b) and fixes

Findings file `dual-review-round12-pra1.md`. Codex: request-changes, 1 Medium (evidence
reproducibility). Adversary: request-changes on trend, 1 Medium, 3 Low.
- Medium (adversary): moby's `compile` is not its matcher; `match` dispatches on a detected type
  and a pattern starting with `**` is a raw string suffix match, so the round-11 mid-`**`
  translation made `!**git` fail-open. Third consecutive round in which a refinement of the model
  flipped a correct case. Decision: drop the model. The example now asserts the literal `.git`
  exclusion and the exact set of three `!` entries; any new `!` entry or respelling fails it and
  must be reviewed deliberately (comment says so). About 50 lines of model removed. This is the
  repo's own rule: a guard stricter or more elaborate than what it protects is a new failure mode.
  Also closes the adversary's two Lows (the comment's `compile` claim; the exclusion allowlist
  question, answered by requiring the literal spelling and saying so) without a model to get wrong.
- Medium (Codex) and adversary Low: the `docker_glob_sim*.rb` scripts cited in the round-9 to
  round-11 records were scratch artefacts, never tracked, and the last one was stale against the
  shipped helper. They are superseded; the reproducible evidence at HEAD is the example itself and
  the mutations below, run against the committed spec.
Mutations at HEAD (scratch copies of `.dockerignore`, restored): append `!.git`, `!**git`,
`![!.]git`, `! .git`, `!/.git`, `!tmp/other` -> each red on the exact-set assertion; delete the
`.git` line -> red; respell it `.git/` -> red (deliberate); unchanged file -> green.
Green after fixes: 106 examples, 0 failures.

## PR A1 dual review round 13 (head 5d724d15d) and fixes

Findings file `dual-review-round13-pra1.md`. Codex: request-changes, 1 Medium. Adversary: approve,
2 Low. Cross-confirmed (Codex Medium, adversary Low): the literal example classifies a line as a
re-include with Ruby `strip.start_with?('!')`; moby strips a first-line byte-order mark and trims
the full Unicode space set (U+00A0, U+0085, U+2028) before testing `!`, so a BOM before a first-line
`!.git`, or a non-breaking space before `!`, re-includes `.git` in Docker while the example stayed
green. Fix, no model: the example reads the file as bytes and pins them to ASCII, then classifies.
Mutations: BOM + `!.git` first line -> red; U+00A0 before `!.git` -> red; whole-file CRLF -> green.
Adversary Low 2, deferred and recorded: nothing verifies the built artifact; a one-line step
after `docker build` (`docker run --rm --entrypoint sh "$IMAGE" -c '! test -e /app/.git'`) would
assert the image itself. That is a deploy-workflow edit, outside A1's scope; listed in the PR
body's Not covered for PR B or a follow-up. Green after fixes: 106 examples, 0 failures.

## PR A1 dual review round 14 (head 4af82d7c2) and fixes

Findings file `dual-review-round14-pra1.md`. Codex: approve, no findings. Adversary: approve, 2 Low,
both pre-existing siblings of the round-13 class and both one-line literal assertions, taken:
- NUL byte: Ruby's strip removes NUL, Go's TrimSpace does not, so `.git` plus a NUL classified as
  the exclusion here while matching nothing in Docker; NUL is byte 0 and passed the `< 128` pin.
  Pin tightened to printable ASCII plus tab, LF, CR. Mutations `.git\0` and `\0.git` -> red.
- `Dockerfile.dockerignore` takes precedence over `.dockerignore` in Docker, so adding one would
  make the pinned file inert with the example green. One assertion: no `*.dockerignore` file
  other than the pinned one may exist. Mutation (scratch `Dockerfile.dockerignore`) -> red.
The deferred image-level check's command was confirmed correct for this Dockerfile (Debian slim
runtime, `WORKDIR /app`, `COPY . .`, `USER app`); two notes recorded with the deferral: use a YAML
block scalar for the nested quotes, and `.dockerignore`'s `.git` is root-anchored, so widen to a
`find` if the goal is "no git history anywhere" rather than the Sentry-fallback path.
Green after fixes: 106 examples, 0 failures.

## PR A1 dual review round 15 (head 262ec6a09) and fixes

Findings file `dual-review-round15-pra1.md`. Codex: approve, 1 Low. Adversary: approve, 3 Low;
20 probes, 0 fail-open, the first round in the sequence where that is true.
- Taken (adversary Low 1): `Dir.glob` with the checkout path interpolated fails open when that path
  holds a glob metacharacter (`[`, `{`, `*`, `?`), which cannot happen on the CI runner but can on a
  developer path. Replaced with a directory listing filtered by a literal regex (any non-dot name
  ending in `.dockerignore`), no pattern language. Scratch `Dockerfile.dockerignore` still red.
- Recorded, not fixed (Codex Low, adversary Low 2): the check is root-scoped; a future `docker build
  -f <subdir>/Dockerfile` would resolve a sibling ignore file this example cannot see. The deploy
  workflow's only build is root, no `-f`. The deferred image-level check is invocation-independent
  and is the right control; noted with the deferral.
- Recorded (adversary Low 3): the runtime image installs `git` (`Dockerfile:36`), so the Sentry git
  fallback would succeed immediately if `.git` ever reached `/app`; there is no second line of
  defence behind the text pin, which is the rationale for taking the image-level check in PR B.
  Dropping `git` from the runtime stage is a separate change with its own risk.
Green after fixes: 106 examples, 0 failures.

## PR A1 dual review round 16 (head a7a667453) and fixes

Findings file `dual-review-round16-pra1.md`. Codex: request-changes, 1 Low. Adversary: approve,
4 Low. Same defect from both: the round-15 regex `\A[^.].*\.dockerignore\z` misses a dot-prefixed
name (`.Dockerfile.dockerignore`), misses a name with an embedded newline (`.` does not cross `\n`),
and raises on a non-UTF-8 name (fail-closed but a misleading message). The adversary noted its own
round-15 counter-measure would have self-matched `.dockerignore`, which is why the anchor was added.
Fix: plain string tests, no glob and no regex: `n != '.dockerignore' && n.end_with?('.dockerignore')`
(byte comparison, does not raise). Mutations: `Dockerfile.dockerignore`, `.Dockerfile.dockerignore`,
`Foo.dockerignore`, a directory `Bar.dockerignore/` -> red; baseline green.
Adversary Low 1 was procedural and correct: this edit sat uncommitted in the worktree while round 16
ran against `a7a667453`; the reports cover that head only, so the edit gets its own round.

CI on this branch, corrected in rounds 17 and 18 (the first version of this paragraph called it
flakiness; the second over-attributed it to product code; every claim below was read from the
GitHub jobs API, `git show`, and the test files at `origin/develop`, read-only):
- `develop` moved to `4104b657b` at 2026-09-13T21:44:07Z via PR #963: 166 files (`git show --stat`;
  `gh pr view --json files` caps at 100), 120 under `app/frontend` including about 30 test files;
  the Ember suite grew from 2529 to 2687 tests.
- Branch record: on the 2529-test base, passes at `1476ae817` and `165fe952f`. On the 2687-test
  base, 1 pass (`4fca93c3d`) and 5 failures (`a648d93e3`, `e3d53f10b`, `5d724d15d`, `4af82d7c2`,
  `262ec6a09`), each `# tests 2687`, `# fail 1`. Two distinct failures, not one:
  - Four runs (34787748239, 34788511177, 34789100356, 34798323491): test 2469
    `speecher: speecher set_voice - should not error if set_voice has not been called`, message
    `TypeError: Failed to execute 'speak' on 'SpeechSynthesis': parameter 1 is not of type
    'SpeechSynthesisUtterance'`, thrown from `speak_utterance` (frontend.js:263684) under
    `Backburner._runExpiredTimers`: a global error from a late timer, attributed to whichever test
    is running.
  - One run (34785846824): test 157 `boards-layout-toggle: choosing TOP-DOWN persists it to the
    user`, message `TypeError: localStorage.getItem is not a function` at
    `capabilities.sync_access_token`. A separate leak: that test stubs `window.localStorage` per
    test (`boards-layout-toggle-test.js:13,21,31` at `origin/develop`).
- Mechanism for the speech failure (adversary, round 18; stub sites confirmed, the full chain
  PLAUSIBLE, not executed): `speecher-test.js` stubs `speecher.scope.SpeechSynthesisUtterance`
  (`:79`) and `window.speechSynthesis.speak` per test (`:95`, `:106`, `:117`), and `speecher.js` has
  15 `runLater` sites in the speak path. A timer left by an earlier test that fires after the
  stubs are restored hands a fake utterance to the real `speak`. In production only real utterances
  reach `speak`. Classification: a test-isolation failure in the Ember suite, surfaced on
  `develop`; not a product defect in the speech module.
- Link to #963: the temporal window is confirmed; the stack frame says where the throw lands, not
  who introduced it (#963's `speecher.js` hunk touched the import, `oops()` and
  `get_tts_voices()`, not `speak_utterance`). Two candidate explanations, both PLAUSIBLE: the
  158 added tests and about 30 new test files changed suite order (both failing tests passed on the
  2529 base: 2314 and 156 `ok`); and `get_tts_voices()` now falls back to the imported module, so
  `oops()` reaches `speak_text` where it previously threw on `undefined.get('oops')`.
- Extent: observed on one branch so far (5 runs, 4 with the speech failure). `develop`'s own run
  and PR run 34786101021 (`feat/melissa-dedupe-library-utility-boards`, 22:12Z) passed on the same
  2687 suite with test 2469 `ok`. Any PR on this base carries the risk; one branch has shown it.
- #962: zero `app/frontend` files in the diff. In `build-and-test` (`.github/workflows/ci.yml:102-164`)
  the checkout, Node and cache steps read the whole repo; every step that reads source runs with
  `working-directory: app/frontend`. Nothing this diff changes is an input to those steps, so there
  is no evidence #962 caused the failures, and nothing in it can fix them. Do not rerun to green as
  a substitute for surfacing them. Draft for the frontend owner (#963 was authored by traciday):

  > **Ember suite: two order-dependent global-error leaks since `develop` `4104b657b` (#963)**
  > On #962's branch (no frontend changes) `build-and-test` failed 5 of 6 runs on the 2687-test
  > suite, each `# fail 1`. (a) Four runs (34787748239, 34788511177, 34789100356, 34798323491):
  > test 2469 `speecher set_voice` fails with `TypeError: Failed to execute 'speak' on
  > 'SpeechSynthesis': parameter 1 is not of type 'SpeechSynthesisUtterance'` from
  > `speak_utterance` under `Backburner._runExpiredTimers`. `speecher-test.js` stubs
  > `SpeechSynthesisUtterance` (:79) and `speak` (:95, :106, :117) per test; a late `runLater`
  > from an earlier test can hand the fake utterance to the real `speak` after restore. Suspect
  > test isolation (unflushed timers), not product code. (b) One run (34785846824): test 157
  > `boards-layout-toggle` fails with `TypeError: localStorage.getItem is not a function` at
  > `capabilities.sync_access_token`; that test stubs `window.localStorage` per test. Both tests
  > passed on the 2529 suite before #963 (166 files, ~30 new test files, +158 tests).
  > `develop`'s own run and one other PR passed on the same base, so it is order-dependent and
  > intermittent.

## PR A1 dual review round 17 (head 38559fd0e) and fixes

Findings file `dual-review-round17-pra1.md`. Codex: approve, no findings. Adversary: approve,
1 Medium, 3 Low: three in prose, one a recorded fail-closed false positive in the new spec. The ignore-file check is closed: 16-case matrix, no
fail-open, no self-match, no spurious failure; the round-16 residuals flip red under the string
tests. One new fail-closed false positive left as is and recorded: `._.dockerignore`, the macOS
AppleDouble sidecar on non-APFS volumes, now reddens; unreachable in CI and on WSL.
Medium (adversary): the round-16 CI paragraph called the `build-and-test` failures flakiness. The
job logs show one test, one TypeError, four consecutive runs, starting at the base move that
brought in #963's change to `speecher.js`; two logs I called unretrievable were retrievable through
the jobs API and show the same failure; two of the three "passes" ran the previous 2529-test suite
and are not controls. Paragraph rewritten above from the API output, with a draft defect note for
the frontend owner. Lesson: "flaky" is a conclusion that needs the failing assertion and the base
history in hand, not a label for "different test names across runs".
Low: the PR body's Tests section said CI was green on the pre-rebase heads and silent on the five
post-rebase failures; one sentence added. Round 18 is a prose-only re-review of this record and
that sentence; the spec has not changed since `38559fd0e`.

## PR A1 dual review round 18 (head 7422bf347, prose only) and fixes

Findings file `dual-review-round18-pra1.md`. Codex: request-changes, 1 Medium, 2 Low. Adversary:
request-changes on prose, 3 Medium, 4 Low. Code unchanged and approved by both since `38559fd0e`.
The round-17 correction was itself wrong in three ways, all fixed in the paragraph above:
- The draft note listed run 34785846824 under the speech TypeError; that run failed on a different
  TypeError (`localStorage.getItem is not a function` at `capabilities.sync_access_token`) in a
  test that stubs `localStorage`. Two leaks, not one; the note now separates them.
- The note pointed the owner at product code. The throw can only happen with the test harness's
  stubs in place (`speecher-test.js` stubs the utterance constructor and `speak` per test), so it
  is a test-isolation failure surfaced on `develop`, not a speech-module defect. Reclassified, stub
  sites named, and #963's `get_tts_voices()` fallback recorded as a plausible unlock alongside the
  suite-order explanation.
- Overclaims removed: "#963 (100 files)" was the API page cap (166 files, 120 frontend); "stack
  frame confirmed" is where the throw lands, not evidence of authorship; "every PR inherits it" and
  "unrelated PRs" generalised from one branch (one other PR and `develop` passed); "reads nothing
  this diff touches" restated as no source-reading step consumes anything this diff changes;
  `ci.yml` step scoping stated accurately; round-17 record no longer says "none in shipping code".
Lesson: a correction written to satisfy a finding needs the same evidence pull as the original
claim; twice this session the fix prose carried a fresh overclaim (rounds 17 and 18).

## Status

- [x] Phase 1 inventory (2026-09-12).
- [x] Dual review round 1 on proposal v1: request-changes; v2 written (2026-09-12).
- [x] Scot's go: A1/A2 split, K_REVISION only, delete preview-comment.yml (2026-09-12).
- [ ] PR A1 #962 (draft; rebased onto #961; rounds 1-18 applied; round 19 re-review pending on prose only) -> A2 -> B -> C.
