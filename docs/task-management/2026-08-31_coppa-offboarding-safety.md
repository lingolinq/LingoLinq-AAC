# COPPA offboarding safety fixes (post-#898)

**Goal.** Close the five defects the #898 dual review found, now live on `main`
after the 2026-08-31 release: an ungated retroactive COPPA sweeper, an export
failure that still schedules deletion, a GET endpoint that mutates, and a
decline that does not revoke bearer tokens.

**Branch.** `scot/fix/coppa-offboarding-safety`, cut from `origin/staging`
(`bfd0facb2`). Targets `staging`, NOT `main`: hotfix-direct-to-main is for
urgent fixes, and none of these are reachable in prod today (see below).

## Verified context (do not re-derive)

- #898 merged as `3f752f1fd9`, rspec GREEN, deploy succeeded. `bfd0facb2` (#900),
  `243f16cfa` (#899), `2b52aef01` and `a0b9df3ec` are ALL on `main`. The branch
  was updated before merge, so the "3 commits behind" and "missing #900"
  blockers were resolved by the author. No cherry-pick needed.
- **Nothing runs `scheduler:dispatch` in production.** Render cron
  `lingolinq-prod-scheduler` (`crn-d68nfmbnv86c73eho6vg`, `0 * * * *`) is
  `suspended` by user, `updatedAt 2026-07-21T23:44:51Z` (the GCP cutover).
  Cloud Scheduler API is NOT enabled on `lingolinq-prod` (zero jobs); none of
  the 8 Cloud Run jobs is a scheduler; nothing else invokes the rake task.
  => the sweeper CANNOT fire today, and every other scheduled task
  (`purge_old_eu_ai_api_logs`, `redact_old_ip_addresses`, `advance_goals`,
  `check_for_expiring_subscriptions`, ...) has been dead ~6 weeks.
  Filed separately per Scot's direction; NOT fixed in this branch.
- The sweeper sits in the `if hour == 6` DAILY block (`scheduler.rake:106`
  guards from :106, the call is at :192), so even with the cron alive it is
  once-daily, not hourly.
- `user.rb:1030-1042` already documents the `invalidate_keys!` vs
  `invalidate_cached_keys` distinction for `revoke_parental_consent!`, and
  names the sibling sites that deliberately keep the cache-only form: grant,
  parent-email submit, family offboarding. **Decline is not among them**, so
  the cache-only call at `user.rb:793` is an oversight, not a choice.

## Decisions

- Kill switch is three-state per Scot (2026-08-31): unset => disabled (log and
  exit, no scan, no mutation); `report` => dry run (same candidate set, log
  count + global_ids + reason breakdown, mutate nothing); `true` => full run.
- Candidate discovery extracted to `User.expired_offboarding_consent_candidates`
  so report and run share ONE selection. Two implementations of "who would this
  affect" is how a dry run reassures you about a different set than the real one.
- Export failure releases the claim and returns false rather than mailing an
  "export unavailable" notice. Copilot's plan allowed the mail; retrying every
  sweep would then mail the parent repeatedly. An `AuditEvent` records the
  failure instead, which is the durable signal compliance needs.
- Log identifiers are `global_id` only. No names, emails, or birth data (FERPA/HIPAA).

## Log

- Verified merge state, scheduler wiring, and all five defects at `origin/staging`.
- Stashed unrelated WIP found in the tree: a valid, UNLANDED correction removing
  the false "children's data automatically purged at age 18" claim from the
  privacy policy (13 locales + erb + retention draft + register hash). That
  claim is live on BOTH staging and main and has no implementing code -- the
  only two matches for any age-18 concept in `app/` or `lib/` are the two copies
  of the claim itself. `git stash@{0}`, plus a patch in the session scratchpad.
  Flagged to Scot; not part of this branch.

## Changes made

1. `app/workers/offboarding_coppa_expiration_worker.rb` -- three-state
   `COPPA_OFFBOARDING_SWEEP_ENABLED` switch (`:disabled` default / `report` /
   `true`). `:disabled` does not even scan. `report` logs the count, the
   declined/expired split, and one `user_global_id=` line per affected account.
2. `lib/tasks/scheduler.rake` -- the dispatch line now prints `mode=` alongside
   the count, because "0 scheduled" was ambiguous between "nothing due" and
   "sweep is off".
3. `app/models/user.rb`
   - `OFFBOARDING_SWEEP_LOOKBACK` constant, with the drop-out caveat documented.
   - `expired_offboarding_consent_candidates` extracted so report and run share
     ONE selection.
   - `offboarding_export_reason` extracted for the same reason.
   - `schedule_offboarding_export_then_delete!` now ABORTS on a failed or
     path-less export via `release_offboarding_export_claim!`, which releases the
     claim, writes a `parental_consent_offboarding_export_failed` AuditEvent, and
     returns false so the next sweep retries.
   - `decline_parental_consent!` now calls `invalidate_keys!` instead of
     `invalidate_cached_keys`.
4. `config/routes.rb`, `app/controllers/parental_consents_controller.rb`,
   `app/views/parental_consents/decline.html.erb`, `config/locales/en.yml` --
   GET `/parental_consent/decline` renders a confirmation page and mutates
   nothing; new POST `/parental_consent/decline` -> `#decline_submit` performs
   the decline. Shared `prepare_decline_context` resolves a four-state `@state`.

## Test results

- `spec/workers/offboarding_coppa_expiration_worker_spec.rb` 12 examples, 0 failures
- `spec/controllers/parental_consents_controller_spec.rb` 19 examples, 0 failures
- `spec/models/user_org_offboarding_consent_spec.rb` 35 examples, 0 failures
- adjacent (`scheduler`, `device`, `user_mailer`, `session_controller`)
  270 examples, 0 failures, 7 pending

## One existing spec asserted the defect

`spec/models/user_org_offboarding_consent_spec.rb` "process_expired_offboarding_consents!
schedules delete after deadline" stubbed `Exporter.export_user` to return **nil**
and then asserted `schedule_deletion_at` WAS present -- i.e. it pinned the
behaviour where a failed export deletes the child's account anyway. Corrected to
a real path, and split so the nil case now asserts no deletion is scheduled and
the account stays due for retry. Worth remembering: the failing test was the
fix working, not a regression.

## Assumptions

- Export failure does NOT mail the parent an "export unavailable" notice.
  Copilot's plan allowed it; with retry-on-next-sweep semantics that would mail
  repeatedly. The AuditEvent is the durable signal instead. `export_unavailable`
  stays in the locale file but is now unreachable from this path.
- `protect_from_forgery with: :null_session` means the POST is not CSRF-gated by
  exception. The property gained is that automated fetchers issue GETs.
- The four new confirm-page strings are English-only. `es.yml` has no
  `parental_consent` section at all, so the whole page was already English-only
  and `config.i18n.fallbacks = true` covers it. Adding only these four would be
  inconsistent; the Spanish gap is tracked as its own item.
- `#complete` and `#revoke` still act on GET. `#complete` is not destructive.
  `#revoke` is out of scope here but has the same shape, and is worth the same
  treatment in a follow-up.

## Dual review of PR #903 (2026-08-31), and what it changed

Ran codex + adversary in parallel on my own branch. Both found real defects; two
were regressions I had introduced, one was a PII leak, and two of my specs proved
nothing. Fixes applied on the same branch.

### Cross-confirmed by both reviewers

- **90-day lookback orphans aged accounts.** `OFFBOARDING_SWEEP_LOOKBACK` bounds
  the AuditEvent scan, so an offboarding that ages past it is due forever but never
  discovered. Made worse by defaulting the sweep OFF: every day it stays off, more
  of the backlog crosses the horizon, and `report` then prints a reassuringly small
  number -- which is exactly the number used to justify enabling it. NOT fixed here
  (it needs state-based discovery); documented on the constant, covered by a spec
  that pins the behaviour, and called out in #902 as a pre-enable step.
- **`prepare_decline_context` did not mirror the model's refusal conditions.**
  Fixed: added `declinable?` covering `pending_parent_consent`, `parent_consent_granted_at`,
  `offboarding_export_scheduled_at` and expiry, plus a `:not_declinable` state.
- **Report specs were entirely doubles.** Fixed with DB-backed specs.

### Found only by the adversary

- **HIGH, a regression I introduced.** `decline_parental_consent!` discards the
  return of `schedule_offboarding_export_then_delete!`, so an interactive decline
  whose export failed still returned true and rendered "scheduled for export and
  deletion". Pre-PR the account was wrongly DELETED; post-PR it was silently
  RETAINED while the parent was told it was handled -- and the only retry is a sweep
  this PR defaults off and that nothing invokes in prod. Fixed: `decline_outcome_state`
  reads the persisted result and renders a distinct `:declined_export_pending` state.
- **My token spec was vacuous.** `expect(d.valid_token?(d.settings['keys'].first))`
  ran after asserting `keys == []`, i.e. `valid_token?(nil)` -- false for any device.
  Fixed by capturing the minted token before the decline.
- Failure row written even when another finisher had won the race. Fixed.
- Report logging: one line per account pairing global_id with reason. Capped at 200.

### Found only by codex

- **HIGH, PII into an immutable record.** `error.to_s[0, 300]` persisted the raw
  exporter message. `lib/exporter.rb:94` builds its S3 key from `user.user_name`
  TWICE, so an upload failure writes a student's username into an AuditEvent and
  the logs. Truncation is not sanitisation, and `PiiScrubber` does not redact
  usernames by design. Fixed: persist `error_class` only; the message goes to the
  log, scrubbed. Same posture as `AuditEvent.log_command`'s own fallback.
- **Claim release has no ownership token**, so a >6h stale worker can clear a newer
  worker's claim. Real; NOT fixed here (needs a claim token) -- noted as follow-up.
- **Failed export does not cancel a PRE-EXISTING `schedule_deletion_at`.** Traced:
  the fuse can come from `api/users_controller.rb:470` or `subscription.rb:1230`,
  and `Flusher` (`lib/flusher.rb:318`) deletes on the fuse alone with no export
  check. Real, but PRE-EXISTING: this PR only ever sets the fuse AFTER a successful
  export, so it does not create the bad combination. Follow-up, not a blocker.
- AuditEvent `after(:each)` cleanup can be rolled back. Fixed: added `before(:each)`
  per the repo's own convention in user_spec.

### Also fixed while in there

- Candidates were materialised into an Array of full User records; the premise of
  the feature is a large backlog and each record carries a decrypted settings blob.
  Now `each_expired_offboarding_consent_candidate` STREAMS, restoring the original
  one-at-a-time behaviour. Report accumulates two strings per row, not records.
- `reason` was resolved at discovery time and could be minutes stale; now derived
  inside the claim lock where `with_lock` has just reloaded the record.
- No per-user rescue in the sweep: one raise abandoned the whole remaining backlog.
- `form_tag` hardcoded the path; now uses `parental_consent_decline_path`. Note the
  POST route must stay UNNAMED -- the GET already claims that helper for the same
  path, and adding `as:` raises "Invalid route name, already in use" at boot.

### Not accepted

- N+1 `find_by_global_id` per candidate: kept. Batching would mean loading all
  records to filter on `coppa_offboarding_export_due?` anyway, which is the memory
  problem the streaming change just fixed. The query count is unchanged from the
  original code.
