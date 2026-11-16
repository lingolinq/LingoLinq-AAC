# 2026-11-10: Cloud Armor setup keeps hand tuning on re-run

Branch: `traci/fix/armor-setup-keeps-tuning`. Surface: `scripts/gcp/phase5-frontend-lb.sh` step 2
(`[ARMOR]`), `scripts/gcp/PHASE5-CUTOVER-RUNBOOK.md` steps 8 and 9c,
`scripts/gcp/PHASE5-CLEAN-DB-REHEARSAL.md`.

## Problem

The production Cloud Armor policy is tuned by hand after the script creates it (JSON parsing,
signature opt-outs in rule expressions, preconfigured-WAF field exclusions, log level). Re-running
the script had to be safe against that state, and enforcement had to move from all four WAF rules
at once to one rule at a time.

## What the old step 2 changed on an existing policy

Checked against the gcloud 591.0.0 source in `lib/surface/compute/security_policies/` and
`lib/googlecloudsdk/api_lib/compute/security_policies/client.py`.

| Call (old script) | When | What it overwrote |
|---|---|---|
| `security-policies update --log-level=VERBOSE` | every Armor run | `advancedOptionsConfig.logLevel` back to VERBOSE. gcloud copies the existing `advancedOptionsConfig` and sets only the flags passed, so JSON parsing and other advanced options were kept (`update.py`, `CreateAdvancedOptionsConfig`). |
| `rules update <1001-1004> --action=deny-403 --no-preview` | `ARMOR_ENFORCE=1` | preview on all four rules at once; action reset to deny-403; `rate_limit_options` added to the update mask because the action is not a throttle action (`rules/update.py`). No `--expression`, so the expression and exclusions were not sent. |
| `rules update 2000 ... --no-preview` | `RATE_LIMIT_ENFORCE=1` + confirm | rule 2000 threshold, actions, key and preview, by design (unchanged). |
| `backend-services update --security-policy` | every Armor run | re-attaches the same policy to the backend; not a policy change (unchanged). |

Existing WAF rules were never rewritten with `--expression`; they were already describe-guarded.

## What changed

- Policy is create-only. On create, the script sets `--log-level` (default NORMAL) and
  `--json-parsing` (default STANDARD) through `ARMOR_LOG_LEVEL` and `ARMOR_JSON_PARSING`; VERBOSE is
  an explicit opt-in for a rehearsal. If that follow-up update fails the script stops with the
  manual command, because a re-run would treat the policy as existing and never set them. An
  existing policy is not updated; the run prints its live log level and JSON parsing and warns if
  it is VERBOSE.
- Existing WAF rules are never rewritten. Hand-tuned expressions, opt-outs and exclusions are
  preserved.
- Enforcement is per rule: `ARMOR_ENFORCE_RULES` (1001-1004, comma or space separated) plus
  `CONFIRM_ARMOR_ENFORCE=1`. (Superseded in review round 3: one rule per run and
  `CONFIRM_ARMOR_ENFORCE=<that rule>`.) The flip sends `rules update <rule> --no-preview` only. Rules not named
  keep their preview state. `ARMOR_ENFORCE=1` is retired and refused. A request for 2000, an unknown
  rule, a missing confirm, or a missing `CONFIRM_LB=1 CONFIRM_ARMOR=1` is refused before any gcloud
  call.
- Rule 2000's separate gate is unchanged. (Superseded in review round 3 results: the enforce run now
  sends `--no-preview` only unless both threshold variables are passed, and refuses a missing policy or
  rule 2000.)
- Step 2e readback also prints each WAF rule's action.
- Header, usage lines, plan banner, handoff text and both runbooks updated.

## Review round 1 fixes

- The backend attach no longer runs blind. A new read-only Step 2-pre reads the policy attached to
  the backend before anything is created. A DIFFERENT attached policy stops the run (a stale or
  mistyped `ARMOR_POLICY` used to create a default policy and swap it onto the backend). A read
  failure also stops it. Step 2d attaches only when nothing is attached, and for a policy that
  already existed only with `CONFIRM_ARMOR_ATTACH=1`, because a bare backend may have been detached
  on purpose. When the policy is already attached, the step is skipped.
- A WAF rule never starts in enforce. `ARMOR_ENFORCE_RULES` is refused when the policy or a named
  rule does not exist yet, and new rules are always created with `--preview`.
- `ARMOR_ENFORCE_RULES` is parsed with `read -a`, so there is no globbing or option parsing. A
  value that names no rule (`,,`) is refused, and so is `CONFIRM_ARMOR_ENFORCE=1` with no rule named.
- For an existing policy, the run warns when JSON parsing is unset or DISABLED, as it already did
  for VERBOSE (that state is what an interrupted first run leaves behind). It still changes nothing.
- The header no longer claims every existing rule is left alone: the rule 2000 enforce run
  re-applies 2000's rate-limit config. (Superseded in review round 3 results: it re-sends the config
  only when both `RATE_LIMIT_COUNT` and `RATE_LIMIT_INTERVAL_SEC` are passed.)
- Runbook 9c: one probe per rule, run only for the rule just flipped. One-rule and all-rules
  rollback are now separate blocks with a `RULE` variable. Added a `rules describe` step to confirm
  the flipped rule's expression and exclusions survived.

## Why `--no-preview` alone is safe for exclusions

With only `--preview`/`--no-preview`, gcloud builds a `SecurityPolicyRule` that has priority and
preview only (match, preconfiguredWafConfig, rateLimitOptions unset) and an empty update mask, and
sends `patchRule` (`client.py` `_MakePatchRequestTuple`). The Compute API describes
`securityPolicies.patchRule`'s `updateMask` as "Indicates fields to be cleared as part of this
request". That text is from the API's generated client in gcloud 591.0.0
(`generated_clients/apis/compute/v1/compute_v1_messages.py`, `ComputeSecurityPoliciesPatchRuleRequest`),
which is generated from the API reference; the live reference page was not read here. On that
reading an empty mask clears nothing and only the fields set in the body change. gcloud's own
`rules add-preconfig-waf-exclusion` depends on the same behaviour: it sends only
`preconfiguredWafConfig`. Not observed against a live policy here.

## Verification

- `bash -n` passes. `shellcheck` is not installed on this machine, so it was not run.
- macOS `/bin/bash` is 3.2 and has no `declare -A`, which the script already used, so the dry runs
  ran in a local `ruby:3.4.4-slim` container (bash 5) with `--network none`, against a fake
  `gcloud` on PATH that logs argv and answers `describe` as present (or, for the "missing" cases,
  absent until created). LB resources always read as present, so step 1 only skips.
- Mutating calls recorded (excluding `services enable`, which step 1 runs every time):
  - existing policy and rules, no enforce: only `backend-services update --security-policy`.
  - (Superseded: the `=1` confirm form is now refused; the confirm repeats the rule number, see
    review round 3.) `ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1`: `rules update 1002 --no-preview` plus the
    backend re-attach. Nothing for the policy or rules 1001, 1003, 1004, 2000.
  - missing policy: `create`, then `update --log-level=NORMAL --json-parsing=STANDARD`, then
    `rules create` for 1001-1004 (preview) and 2000 (preview).
  - missing policy with `ARMOR_LOG_LEVEL=VERBOSE`: same with `--log-level=VERBOSE`.
  - `ARMOR_ENFORCE=1`, list containing 2000, list without the confirm, list without
    `CONFIRM_ARMOR`: exit 1 with zero gcloud calls.
  - After review round 1, with the backend reporting the policy as already attached: an existing
    policy with no enforce makes no changing call at all. Another policy attached, enforce on a
    missing policy or rule, or a failed read of the backend: exit 1 before any Cloud Armor or
    backend change. A bare backend with an existing policy: `[GATE]`, no attach; with
    `CONFIRM_ARMOR_ATTACH=1`: attach. (Superseded: `CONFIRM_ARMOR_ATTACH=1` is now refused; the
    confirm is the policy name, see review round 3.) `,,`, `-n`, `*`, and a confirm with no rule: exit 1 with zero
    gcloud calls. JSON parsing unset or DISABLED: `[GATE]` and no change. A missing rule is
    recreated with `--preview`.
  - The script on `origin/develop`, same existing-policy stub: `update --log-level=VERBOSE` every
    run, and with `ARMOR_ENFORCE=1` four `rules update --action=deny-403 --no-preview` calls.
- The stub's `rules describe --format=value(preview)` always answers `True`, so the readback after
  the stubbed flip still reads True. That is the stub, not the script.

## Not verified

- Server-side patch semantics for a preview-only `patchRule` observed live (see above; the
  documented behaviour is quoted from the generated client, not observed).
- No run against a real policy.

## Review round 3 (dual review)

Each behaviour change got a case in `scripts/gcp/test/phase5-armor-test.sh` first. Run against the
round 2 script (saved copy) the new cases failed; against the fixed script all pass (see
"Round 3 verification" below). The driver runs the script under `env -i` with a PATH holding only a private
bin directory (`scripts/gcp/test/fake-gcloud` linked as `gcloud`, plus a few coreutils); the fake
refuses to run unless it is the first `gcloud` on PATH and `STUB_LOG`/`STUB_STATE` are set.

| # | Finding | Fix | Cases |
|---|---|---|---|
| 1 | `ARMOR_ENFORCE_RULES` accepted several rules, and could ride along with `RATE_LIMIT_ENFORCE=1` | More than one entry (a repeated rule counts) is refused; so is a rule together with `RATE_LIMIT_ENFORCE=1`. Both before any gcloud call. | `R3_1a`-`R3_1d` |
| 2 | `CONFIRM_ARMOR_ENFORCE=1` and `CONFIRM_ARMOR_ATTACH=1` did not name what they confirmed | `CONFIRM_ARMOR_ENFORCE` must equal the rule number; `CONFIRM_ARMOR_ATTACH` must equal the policy name. The old `=1` forms are refused with a message giving the new form. Header, plan banner, handoff, runbook 9c updated. | `R3_2a`-`R3_2f`, `B`, `F`, `N`, `O`, `U` |
| 3 | Odd input (newline, tab, other characters) reached the parser | The raw value must contain only digits, commas and spaces, checked before splitting. | `R3_3a`-`R3_3d`, `T`, `V` |
| 4 | A failed `describe` of the policy, a WAF rule or rule 2000 counted as "missing", so a permission or network error led to creating a default policy or rule | Step 2-pre reads the policy and all five rules once, before any change, through `armor_exists`: only a not-found error is "missing", anything else prints gcloud's error and stops. The backend showing this policy attached while the policy reads as not found also stops. The fake now prints gcloud's real error shape for 404s and can simulate a non-404 error. | `R3_4a`-`R3_4g`, `C`, `Y` |
| 5 | macOS `/bin/bash` 3.2 died at `declare -A` part way through a run | Version guard before anything else. | `R3_5` (needs a bash < 4; run on the macOS host, see below) |
| 6 | Rate-limit checks ran only inside the Armor step, after gcloud calls; `RATE_LIMIT_ENFORCE=1` without `CONFIRM_LB=1 CONFIRM_ARMOR=1` was a silent no-op | Moved to the up-front block; the no-op case is refused. Rule 2000's semantics otherwise unchanged. | `R3_6a`-`R3_6d`, `K` |
| 7 | Runbook 9c's "before" copy came after the flip and had no location; no export before a policy teardown; paste blocks defaulted `RULE=1002` | "Before" describe now precedes the flip, writes under `$HOME/armor-backups`, and the after-describe is diffed against it. Full `security-policies export` (flags checked in gcloud 591.0.0 `export.py`) before the teardown in the handoff text. `RULE=` is an empty placeholder. Never-commit line on each. | `R3_7` (handoff text) |
| 8 | Doc claims | Header says the attached-policy stop happens before anything in Cloud Armor is created or attached; documents that a missing 1001-1004 rule is recreated in preview on a re-run; the patch-semantics note quotes the `updateMask` field description instead of "inferred from symmetry". | n/a |

Not-found matching (superseded by review round 3 results, item 3: the pattern is now tied to the
resource being read and to the error block): gcloud's compute client prints "Could not fetch resource:" plus the server's
message and drops the status code (`api_lib/compute/client_adapter.py` `MakeRequests`,
`api_lib/compute/utils.py` `RaiseException`/`ParseErrors`, `api_lib/compute/batch_helper.py`). For
a missing resource the message is "The resource '<path>' was not found". The script matches that,
`notFound`, an HTTP 404 in debug output, and "does not contain a rule with the specified priority".
That last wording for a missing rule priority is ASSUMED (not in the SDK source, not observed); if
the server words it differently, a run against a policy with a deleted rule stops with the error
printed instead of recreating the rule, which is the fail-closed direction.

Other changes: the WAF rules are iterated in a fixed order (1001-1004), so the created order is
deterministic; previously it followed associative-array order.

### Round 3 verification

- `bash -n scripts/gcp/phase5-frontend-lb.sh` passes under bash 5.2 (container) and 3.2 (macOS).
- `scripts/gcp/test/phase5-armor-test.sh` in `ruby:3.4.4-slim` (bash 5.2.15) with `--network none`:
  against the round 2 script, 19 passed and 34 failed (every behaviour case for items 1-4, 6 and 7,
  plus the old cases whose confirm form changed). Against the fixed script, 53 passed, 0 failed,
  1 skipped (`R3_5`, which needs a bash older than 4).
- `R3_5` by hand on the macOS host (bash 3.2.57) with the same isolated PATH: the round 2 script
  made 22 calls to the fake, then died at `declare -A` with exit 2; the fixed script exits 1 with
  zero gcloud calls and the bash 4 message.
- The driver refuses to start under bash 3.2 (exit 2). Run directly, the fake refuses (exit 97)
  because it is not the first `gcloud` on PATH.
- No run against a real policy or the real gcloud.

## Review round 3 results

The round 3 fixes above were reviewed again (senior-dev and red team). Findings and fixes below. Each
behaviour change got a driver case first; against the script as it stood before these fixes (saved
copy), 12 cases failed (`K_rate_limit_enforce` with its new expectation, `R3b_1b`-`R3b_1e`,
`R3b_2a`, `R3b_2b`, `R3b_3a`-`R3b_3d`, `R3b_6`). `R3b_1a`, `R3b_1f` and `R3b_3e` passed before and
after: they guard behaviour that did not change. With the fixes, all pass.

Senior-dev review:

| Finding | Fix | Cases |
|---|---|---|
| High: the piped `... \| expect_calls` checks in the driver ran `expect_calls` in a subshell, so a failure it recorded was lost and every piped check passed | `shopt -s lastpipe` in the driver, plus a self-check case that pipes a deliberately wrong expectation and must record a failure. Falsified: with `lastpipe` removed, the self-check fails. (Fixed before this round's other items.) | `Z_selfcheck_piped_mismatch_fails` |
| Medium: `RATE_LIMIT_ENFORCE=1` against a missing policy or missing rule 2000 created rule 2000 straight in enforce | Step 2-pre refuses `RATE_LIMIT_ENFORCE=1` when the policy or rule 2000 does not exist, before any change, as for the WAF rules. The create branch now always passes `--preview` (`RL_PREVIEW_FLAG` removed). | `R3b_2a_rl_enforce_missing_policy`, `R3b_2b_rl_enforce_missing_rule2000` |
| Lows L1-L5 | The texts of L1-L5 were not restated to this fix pass. The fixes made this round are the items in the red-team table below plus the rule 2000 header, handoff and runbook wording. The senior-dev pass on PR #1319 (round 4, below) re-read the whole diff and reported its Lows afresh; an earlier L item it did not raise again is treated as closed. | as below |

Red team:

| Finding | Fix | Cases |
|---|---|---|
| Medium: enforcing an existing rule 2000 re-sent the threshold at the script's defaults (600/60), resetting a hand-tuned threshold | Whether `RATE_LIMIT_COUNT` and `RATE_LIMIT_INTERVAL_SEC` were passed (non-empty) is recorded before the defaults are applied. The enforce flip of an existing rule 2000 sends `rules update 2000 --no-preview` only. Only when BOTH are passed does it re-send the threshold together with conform `allow`, exceed `deny-429` and key `IP` (the earlier full re-apply). Passing only one on an enforce run is refused up front. An empty value counts as not passed. The plan banner and step 2c log no longer claim 600/60 for an existing rule. | `K_rate_limit_enforce` (expectation changed to `--no-preview` only, the specified behaviour change), `R3b_1a_rl_enforce_explicit_threshold`, `R3b_1b_rl_enforce_count_only`, `R3b_1c_rl_enforce_interval_only`, `R3b_1d_rl_enforce_empty_values_mean_unset`, `R3b_1e_rl_enforce_banner_says_live_threshold_kept`, `R3b_1f_new_rule2000_uses_given_threshold` |
| Low: the not-found classifier matched "was not found" (and `notFound`, `404`) anywhere in stderr, including a warning line | `armor_exists` takes a pattern for the resource being read. Only the gcloud error block is read (lines before the first `ERROR:` line are ignored), and "missing" means every problem line in the block is the not-found message for that resource: the policy's `The resource '.../securityPolicies/<policy>' was not found`, or for a rule the resource-path form for `<policy>/rules/<prio>`, "The specified security policy rule was not found", or "... does not contain a rule with the specified priority". The generic `notFound` / `404` patterns are gone. Anything else stops the run. The fake gained knobs for a warning line containing "was not found" before a non-404 error, a not-found naming another policy, and the "specified" wording. | `R3b_3a_policy_warning_plus_error`, `R3b_3b_rule_warning_plus_error`, `R3b_3c_notfound_names_other_policy`, `R3b_3d_rule_notfound_names_other_policy`, `R3b_3e_missing_rule_specified_wording`; existing `R3_4a`-`R3_4g` still pass |
| Low: the runbook 9c "before" copy could be written empty (empty `RULE`, failed describe) and the flip still run | Each 9c paste block that uses `RULE` starts with `: "${RULE:?...}"` and chains its steps with `&&`. The save block writes the rule's describe and a full `security-policies export` of the policy to `$HOME/armor-backups`, checks both are non-empty and ends with `saved:`; the flip block runs only when both files are non-empty. The rate-limit enforce block also exports the policy first. Never-commit lines kept. The guard pattern (`: "${RULE:?...}" && ...` and the `[ -s ] || { echo; false; }` check) was checked by hand in interactive bash 3.2 and zsh: an empty `RULE` or an empty file stops the chain and the shell stays open. The full blocks were not run (they call the real gcloud). | n/a (runbook) |
| Low: an exported `CONFIRM_*` or `ARMOR_ENFORCE_RULES` carries over to a later run | The script cannot tell an inline value from an exported one, so no refusal was added. The script header, the handoff text and runbook 9c say to pass these inline, never `export` them, and to `unset` them if they were exported. | n/a (docs) |
| Low (also senior-dev): an unreadable live log level (`?`) was printed but not flagged | `[GATE]` warning that the log level could not be read and may be VERBOSE, as for JSON parsing. | `R3b_6_log_level_unreadable` |

What `rules update 2000 --no-preview` sends, from the gcloud 591.0.0 source
(`surface/compute/security_policies/rules/update.py`,
`command_lib/compute/security_policies/security_policies_utils.py` `CreateRateLimitOptions`,
`api_lib/compute/security_policies/client.py` `SecurityPolicyRule._MakePatchRequestTuple`):
CONFIRMED that with no rate-limit flag `CreateRateLimitOptions` returns `None`, no `--action` means
nothing is added to the update mask, and the patch body carries priority and preview only, so no
threshold, key or exceed action is sent. CONFIRMED from the script that rule 2000 is created with
`--action=throttle --exceed-action=deny-429 --preview`, so preview is the only difference between
the created rule and an enforcing one. ASSUMED (not observed live): that the server keeps
`rateLimitOptions` on such a patch, by the same `updateMask` reading as for the WAF flip. Also
ASSUMED: the rule-level not-found wordings; an unknown wording stops the run (fail closed). If a rule
2000 had its exceed action changed by hand, the flip enforces that action; the step-2e readback
shows the threshold, not the exceed action.

### Round 3 results verification

- `bash -n` passes under bash 5.2 (container) and 3.2 (macOS).
- Driver in `ruby:3.4.4-slim` with `--network none`: before the fixes 56 passed, 12 failed, 1
  skipped; after, 68 passed, 0 failed, 1 skipped (`R3_5`, no bash older than 4 in the container;
  this host has no bash 4 to run the driver natively, so `R3_5` was not re-run this round).
- The worktree was moved onto `origin/develop` 0d50497 (#1291) with the changes uncommitted:
  `git diff origin/develop` touches only the four files of this change plus the learnings file, and
  removes no line from the learnings file.
- This round of fixes was verified by the driver, not by a fourth review round.
- No run against a real policy or the real gcloud.

## Review round 4: senior-dev pass on PR #1319 (2026-11-15)

`REVIEWED=PR lingolinq/LingoLinq-AAC#1319 at c9f23b8c861c09f34a20482f7b03e1985cb10bf9`, after the
PII preflight (`review-preflight.sh pr 1319`, exit 0). Verdict: approve with comments; no Critical or
High. Traci asked for this pass and for the fixes. Each new case was run first against the script
before these fixes (saved copy): R4_1a, R4_1b, R4_1d, R4_1e and R4_4 failed; R4_1c, R4_2 and R4_3
passed, pinning behaviour that was already right but untested.

| Finding | Fix | Cases |
|---|---|---|
| Medium: an enforce flip went ahead on an existing policy attached to nothing (an incident detach, or a first run interrupted before Step 2d); Step 2d only printed a gate, the run exited 0 and the Step 2e readback showed preview=false while nothing was filtered. Same for `RATE_LIMIT_ENFORCE=1`. CONFIRMED by reading Step 2-pre and 2d. | Step 2-pre refuses `ARMOR_ENFORCE_RULES` or `RATE_LIMIT_ENFORCE=1` when no policy is attached, before any change, unless the same run attaches it (`CONFIRM_ARMOR_ATTACH`). Step 2e prints the attached policy (or NONE). The Step 2d gate also names an interrupted first run as a cause. | `R4_1a_enforce_detached`, `R4_1b_rl_enforce_detached`, `R4_1c_enforce_detached_confirmed`, `R4_1d_readback_names_attached`, `R4_1e_readback_names_none` |
| Medium: untested fail-closed paths | Fake knobs `STUB_UPDATE_FAIL`, `STUB_ERROR_STYLE=batch`, `STUB_NOTFOUND_PROJECT`. | `R4_2_update_fail_after_create`, `R4_3_batch_title_notfound` |
| Low: the not-found patterns accepted any project before `/securityPolicies/` | Both patterns name `projects/$PROJECT_ID/global/securityPolicies/...`; a not-found for another project stops the run. | `R4_4_notfound_other_project` |
| Low: runbook 9c flip did not tie `BEFORE` to the current `RULE` | The flip block refuses a `BEFORE` or `EXPORT` saved for another rule; the compare block refuses a `BEFORE` for another rule. Checked by hand in zsh with a 1003 copy and `RULE=1002`. | n/a (runbook) |
| Low: this log left L1-L5 open without listing them | The row above now says how they were closed. | n/a |
| Low (nit): two describes for log level and JSON parsing | Not changed. | n/a |

The first version of the Step 2e attached-policy line printed the name followed by the whole URL
(`${X:-...}` also expands when X is set); R4_1d only checked a prefix and passed. Both readback cases
now match the whole line; the buggy line fails R4_1d.

Driver after the fixes, in `ruby:3.4.4-slim` (bash 5) with `--network none`: 76 passed, 0 failed,
1 skipped.
