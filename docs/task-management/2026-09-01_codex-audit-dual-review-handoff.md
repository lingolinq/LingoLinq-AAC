# Handoff: dual review of the Codex whole-tree audit, and PR #911

Session date: 2026-09-01. Written for a successor session picking this up cold.
Do not confuse this file with `docs/task-management/2026-09-01_session-handoff.md`,
which belongs to a different concurrent session.

## What this thread was

Scot pasted the output of a Codex whole-tree compliance/security audit of
`origin/staging` at `164e1c6c80639a87192d2ad0bb615b81ddb3cae5` and asked for a dual
(adversarial + senior) review of **the audit itself**, not of a PR. The work then
extended into filing the surviving findings and opening a PR.

Three things happened, in order:
1. Verified the audit's ~40 claims against code at that exact SHA.
2. Exchanged corrections with Codex, which reviewed the review; both converged.
3. Filed the 12 surviving findings and opened **PR #911** against `staging`.

## Current state

- **Branch:** `scot/compliance/audit-findings-2026-09-01`
- **Commits:** `fea35bbd6` (files the 12 findings), `912c6faff` (merge of `origin/staging`)
- **Backup ref:** `backup/audit-findings-fea35bbd6` (pre-merge state, keep until #911 merges)
- **PR:** #911 -> `staging`, OPEN, MERGEABLE
- **CI at handoff:** `audit-artifacts-integrity` PASS, `secret-detection` PASS,
  `security-scan` PASS, `codex-review-tests` PASS; `rspec` and `build-and-test` pending.
  This PR touches no Ruby or JS, so a red rspec/build is almost certainly the known
  flakes (see LEARNINGS and the memory entries on the persistence-sync and
  boards-layout-toggle flakes), not this change.
- **Register:** 199 findings. `meta.auditedSha` deliberately UNCHANGED at
  `59f502aa4a967c8c704637cc66a18ff05118c7d8`.

## Durable artifacts written

| Path | What |
|---|---|
| `~/ai-company-brain/outputs/docs/2026-09-01-codex-audit-dual-review.md` | The full review. Read this first. |
| `~/ai-company-brain/outputs/drafts/2026-09-01_pr911-finding-inputs/high.json` | The 7 critical/high findings, in `promote-finding.rb` input shape |
| `~/ai-company-brain/outputs/drafts/2026-09-01_pr911-finding-inputs/medium.json` | The 5 mediums, in `audit-merge.rb` finder shape |
| `~/ai-company-brain/outputs/drafts/2026-09-01_pr911-finding-inputs/pr-body.md` | The PR #911 body |

**Those two JSON inputs are the important ones.** If `staging` moves again before
#911 merges and the register conflicts, do NOT hand-resolve the JSON. Re-derive (see
Gotchas).

## The 12 filed findings

All `status: open`, `disposition: untriaged`, no attestation. Only Scot triages.

| Sev | ID | Short |
|---|---|---|
| Critical | LL-1baffd92d5 | `claim_user` cross-tenant account takeover |
| High | LL-4f1eb5fd0a | `Lesson#check_url` SSRF bypassing SafeHttp |
| High | LL-135ee6ca59 | AI consent gate never enforced |
| High | LL-c7bbfa452a | School-authorized signup skips COPPA marker |
| High | LL-933e61efd7 | Five unbacked privacy-page promises |
| High | LL-400adcead5 | Machine-translated disclosures outside guard coverage |
| High | LL-3e36a18199 | Production scheduler has had no trigger since 2026-07-21 |
| Medium | LL-20703f4fa8 | `AiApiLog.error_message` unscrubbed/unbounded |
| Medium | LL-fba170716e | SNS residuals (narrowed, see below) |
| Medium | LL-d033b27acd | Document register reported "none overdue" while two were |
| Medium | LL-37860cbcfa | No Action pinned by digest in the `id-token: write` job |
| Medium | LL-84c67d758d | terms-agree dialog has no accessible name (WCAG 4.1.2) |

## Still to do

1. **Watch #911 to green and merge.** Nothing in it should break rspec/build.
2. **LL-1baffd92d5 is the priority and nothing is fixed yet.** Confirm on staging with
   SYNTHETIC accounts, never production, then scope the fix: invitation or claim token,
   reject a target already carrying another org's `managing_organization_id`, atomic
   transition, record prior+new org on the AuditEvent.
3. **LL-3e36a18199 blocks the whole retention story.** Until a scheduler trigger exists,
   treat every retention/deletion claim as unmet. `Flusher.flush_deleted_users` has not
   run since 2026-07-21, so deleted users are not being flushed (GDPR Art. 17).
4. **P4 follow-up, listed in the PR body but NOT done.** Two live DRAFT docs still claim
   retention is "Enforced today ... via `scheduler:dispatch`":
   `DOC-e62caf7fb9` (`docs/legal/2026-08-09_data-retention_draft.md:42,45`) and
   `DOC-48adac383b` (`docs/legal/2026-08-25_ai-data-flow-classification.md:313,316`).
   Two others carry the same claim but are **attested AND superseded**
   (`DOC-90b5d33227`, `DOC-6d37a68cf4`) - pinned snapshots, do NOT edit them.
5. **Counsel review of the machine-translated disclosures (LL-400adcead5).** Poland is
   the live exposure; `pl.json` is among the twelve and Polish beta invites are held.
6. Not done and not requested: no Notion sync, no Drive update, no restamp.

## Facts already established - do NOT re-derive these

- The audit's target `164e1c6c8` is PR #901, an i18n locale fill. It touches **none** of
  the files the audit cites. Every audit finding is pre-existing tree state.
- The audit's register arithmetic was **exactly right** (186/110/10/58/5/3, 7 critical all
  verified-closed, 13 unresolved High at that SHA). Its preflight was honest.
- **`meta.auditedSha` is an audit POINTER, not a freshness field.** `audit-reports/README.md:42-60`.
  The audit calling it "stale" was its biggest error. Never restamp to dodge anything.
- Refuted at the SHA, do not re-raise: Art.50 board marking IS persisted
  (`board.rb:1935-1942`, `board_cloner.rb:125-128`); deletion CREATES an AuditEvent
  (`flusher.rb:428-433`); the search/uploader SSRF is dead code (`AccessibleBooks` is
  undefined tree-wide, behind a disabled `tarheel_reader` flag); the WIF rerun claim is
  INVERTED (`phase1-setup.sh:328-335` reconciles via `update-oidc`); the PiiScrubber
  criticism quoted the log-only backstop `scrub_log_line` rather than the egress path
  `redact_string` (`pii_scrubber.rb:526-538`); the app is on Ember 5.12; and
  `assign-lesson.hbs` contains **no iframe at all** (fabricated citation).
- **The SNS finding was deliberately narrowed.** Both Notification branches DO verify
  before processing (401 at `callbacks_controller.rb:28-29` before `Transcoder.handle_event`,
  `:42-43` before `RemoteTarget.process_inbound`), matching the attested closure of
  LL-6d8314e37b. Only three residuals were filed. If anyone re-raises "unauthenticated SNS
  callback", it is wrong. The stale `# TODO: confirm signature` at `:8` is what misled the
  auditor and should be deleted.
- Six audit findings duplicate open rows and were NOT filed: LL-104bfa61dc,
  LL-e8614c103f, LL-0b5443f43b, LL-52ff2a9a79, LL-33d756b764, LL-c226391436.
- The terms-modal defect is **switch scanning**, not a focus trap. `modal-dialog.js:104-135`
  is a real Tab trap with wraparound. Only six templates repo-wide carry `.modal_targets`,
  so the gap is systemic, not terms-specific.

## Gotchas and tips

- **Read at the SHA, never the working tree.** `git show <sha>:path | sed -n 'N,Mp'`.
  The working tree was a different, dirty branch for most of this session.
- **Re-derive, never hand-merge, a register conflict.** `meta.auditedShaPriorNote` records a
  real incident where a file-copy assembly silently reverted 4,197 characters of another
  PR's work. The safe sequence, used successfully here:
  `git merge origin/staging` -> `git checkout origin/staging -- audit-reports/<the five files>`
  -> re-run `promote-finding.rb` + `audit-merge.rb --no-restamp` with the preserved input
  JSONs -> `regenerate-register.sh` -> `git add audit-reports/` -> commit.
  Finding ids are `sha256(ruleKey|path)`, so re-derivation reproduces identical ids.
- **`git reset --hard` is denied by permissions here.** That is correct and the merge path
  above works without it. Make a `backup/` branch ref before anything risky.
- **`promote-finding.rb` only accepts critical/high.** Mediums and lows must go through
  `audit-merge.rb --sha <trueCommit> --no-restamp`. Different input shapes: promote wants
  `{source, reviewer, findings[]}`, merge wants `{domain, findings[]}`.
- **Both scripts REFUSE a finding whose text matches a PII or secret pattern.** The traps
  that will actually bite you: any dotted-quad (so never write a metadata IP address in a
  finding), `\d+_\d+` (global-id shape), and `token:`/`secret=`/`api_key=` followed by 12+
  chars. Write around them.
- **`regenerate-register.sh` takes 8-12 minutes.** Give it `timeout 900` and a matching
  tool timeout; a 2-minute default will kill it mid-run.
- **contentHash drift triage:** check whether the failing row is ATTESTED. Unattested
  (`attestation: {}` / `attestedContentHash: null`) -> regenerate and commit. Attested ->
  stop, do not render, use `/re-attest-record`.
- **`DOCUMENT-REGISTER.json` schema is `.documents[]`,** not `.records[]` or `.rows[]`.
  Findings status lives at top-level `.status`, NOT `.disposition.status` - counting the
  wrong field silently returns zeros.
- **Subagent reports over ~16k chars are truncated in transit.** Ask for a compact resend
  with an explicit character budget and "table only, drop the reasoning trace".
- **Verify load-bearing subagent verdicts yourself.** All six agents were right here, but
  the three I spot-checked were the three that mattered most.
- Do not `git add -A`. There is an unrelated untracked file
  `docs/task-management/2026-09-01_session-handoff.md` from another session; leave it.

## Corrections made during the session (do not repeat)

- I initially said "two of three reviewers returned nothing usable". Wrong: two completed,
  one did not, and that third later returned results. Codex caught it.
- I initially said 11 locale files; it is **12** (`ar de es fr ga ja pl pt ru uk zh zh_TW`).
  Eleven of them are unguarded, since the guard covers English and Spanish only.
- I initially rated the lesson SSRF Medium; Codex argued High and was right, because a blind
  result does not justify a downgrade while egress controls are unconfirmed. Filed as High.
- Both the Codex audit and my first pass missed that the production scheduler is dead. Both
  reasoned from source at a SHA and never asked whether the code was reachable in production.
  That is the standing lesson from this session.
