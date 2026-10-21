# #1063: school hand-back notifies the family instead of gating access

Date: 2026-10-17. Branch `fix/scot-1063-offboarding-notify-00e44d38`, HEAD `117a81238`
(= `origin/develop`, fetched 2026-10-17). Phase 1 only of the brain plan
`outputs/plans/2026-10-16-offboarding-and-disclosure-guard-fix-plan.md`; its review's
"Decisions recorded" section governs. Phase 2 (disclosure guard) is out of scope.

Status (2026-10-18): implemented. Scot approved the existing-test change list (groups A and B,
with `:693` moved to A) and restored Q6. Results, the rerun-confirmed test list and the mutation
checks are in section 6.

Test environment: every count in sections 2 and 6 from 2026-10-18 on comes from throwaway
containers (`postgres:15` on 127.0.0.1:55431, `redis:7` on 127.0.0.1:55479), set up the CI way
(`extras:assert_js`, `db:create db:schema:load`). The earlier counts in section 2 came from a
database on the host's port-5432 cluster, which sessions must not use; they were rerun in the
container (same results: 29 examples, 23 failures for the red specs).

## 1. Fact sheet (rechecked at HEAD)

### (a) Where each value is read

- Access gate reads only `settings['coppa']`: `coppa_parental_consent_blocks_access?`
  (`app/models/user.rb:417-421`) = pending or revoked or declined. Login refuses on those
  states plus `coppa_needs_parent_email?` (`app/controllers/session_controller.rb:109-116`).
  CONFIRMED.
- The offboarding gate is written in one place: `begin_family_offboarding_consents!` builds a
  fresh pending blob and **replaces** `settings['coppa']` (`user.rb:603-634`), entered when
  `requires_coppa_offboarding?` is true (`user.rb:531-537`), which includes signup-pending and
  revoked states. So a signup or revoked blob is overwritten today. CONFIRMED (red test
  "leaves a signup/revoked consent blob byte-identical" fails with the offboarding blob).
- AI preference reset runs only on `attested_under_16 || eu_under_16?` (`user.rb:640`). On
  automatic expiry with no birth date, `force_under_13` sets `attested_under_13` only
  (`license.rb:68`, `user.rb:566`), so the reset is skipped. CONFIRMED (red test).
- Deletion eligibility: `coppa_offboarding_export_due?` (`user.rb:776-795`): declined is due;
  pending past `parent_consent_expires_at`/`offboarding_deadline_at` is due (`user.rb:789-792`).
  Sweep discovery reads `parental_consent_offboarding_started` AuditEvents (`user.rb:1053`).
  CONFIRMED.
- Surviving support today: `License.active_seat_elsewhere?` (`license.rb:90-93`): any active
  student seat at another org, link or not. Callers: `License.expire_stale_licenses!`
  (`license.rb:61`, read AFTER `release_user!` at `:51`), `Organization#remove_user`
  (`organization.rb:1536`, after the detach), and the in-lock recheck (`user.rb:576`).
  CONFIRMED.
- Release removes the org_user link unconditionally (`license.rb:210`), even when the same
  org still holds another seat for the student. CONFIRMED.
- `claim_user` writes the seat inside `user.with_lock` (`organization.rb:119`) but writes the
  sponsored link AFTER the lock (`organization.rb:210`, comment "The attach itself stays
  outside the lock"). CONFIRMED.
- Removal: birth month/year required whenever COPPA is on (`organization.rb:1499-1506`); parent
  email validated with the shared validator (`organization.rb:1510-1515`); API passes
  `offboarding_parent_email` through (`organization.rb:2442`). CONFIRMED.
- Legacy-path notice: `update_subscription_organization("r...")` queues RemoteAction
  `notify_unassigned` 12 h out with `prior_org = managing_organization` (`subscription.rb:94`,
  `:174`). `managing_organization` is link-derived and prefers the sponsored accepted link
  (`supervising.rb:74-84`), so for the departing sponsor the path names that org. The mailer
  sends only if the link is gone (`user_mailer.rb:272-277`). The licensed path
  (`perform_release!`) queues no notice. CONFIRMED by read; assumption G(a) in the review is
  resolved: today's legacy notice normally does send.
- RemoteAction rows are processed hourly by `scheduler:dispatch` -> `Uploader.remote_remove_batch`
  (`lib/tasks/scheduler.rake:123-126`, `lib/uploader.rb:302-321`); the row is destroyed after its
  job is enqueued; an unknown action is kept (`remote_action.rb`, final `else`). Delivery is a
  single Resque job with no retry (`app/mailers/concerns/general.rb:24-35`). CONFIRMED by read.
  Whether prod's scheduler actually runs it now: ASSUMED (memory says live since 09-02; not
  rechecked, and nothing below depends on it beyond "the notice may be late or lost").
- Recipient: `mail_message` returns nil with no email, sends to `channels_for` otherwise
  (`app/mailers/concerns/general.rb:4-13`). CONFIRMED.

### (b) Shapes the state can hold

`settings['coppa']` writers: signup registration, `submit_parental_consent_email!`
(`user.rb:717-764`), grant, revoke, decline (`user.rb:800-868`), export claim/finish
(`user.rb:876-1001`), and the offboarding arm (`user.rb:603-634`). After this change the
offboarding arm stops writing it; the other writers are untouched.

Legacy `offboarding: true` blobs that may already exist: pending without email; pending with
email and token; granted; granted then revoked; declined; revoked then re-requested (looks like
pending). The change makes only "pending past deadline" stop being deletion-eligible; every
legacy blob still gates access exactly as today (no bulk unlock: plan decision 7, review D6).

Sponsorship shapes for another org: seat + accepted sponsored link (claim); seat without link
(family removed the org: `supervisor_key_processor.rb:91-96` detaches the link and leaves the
seat); legacy link without seat (`add_user` fallback, `organization.rb:1476-1487`); pending,
unsponsored, eval, supervisor. Same-org second seat (the departing org's own other seat).

### (c) Cross-file claims checked

- AI call sites: board generation, word prediction, suggestions and integrations go through
  `ai_feature_enabled_for?`, which reads the user's AI preferences (`feature_flags.rb:270-277`,
  `:380-`). CONFIRMED.
- **Two AI paths do NOT read the user's AI preferences** and are blocked for a handed-off
  under-13 today only by the pending state:
  - voice transcription (`app/models/button_sound.rb:48-60`: "is not gated by the account's
    personal AI preference (2026-09-30)");
  - eval narration (`lib/eval_narrator.rb:146-151`: COPPA, EU, org opt-out only).
  After hand-back the family account has no org links, so
  `Organization.external_ai_processing_allowed_for_user?` returns true
  (`organization.rb:2113-2118`) and `ai_enabled_for?` returns true (`feature_flags.rb:259-266`).
  The plan says: if tracing disproves "the reset covers every applicable AI control", stop and
  propose. It does. See Q1.
- Sentry child scrub reads `coppa_parental_consent_pending?` (`config/initializers/sentry.rb:127-133`):
  handed-off under-13 events stop being scrubbed. CONFIRMED (Q4).
- No Ember test references `confirm-org-action` (review M7; not re-run here).
- Billing: the offboarding method never touches `expires_at` or `settings['subscription']`
  (read of `user.rb:562-689`); guard test added.

## 2. Red tests (written first, run against unchanged code)

New files only:
- `spec/models/user_school_handoff_spec.rb` (26 examples)
- `spec/controllers/session_school_handoff_spec.rb` (1)
- `spec/mailers/user_mailer_school_handoff_spec.rb` (2)

Run on an isolated local DB (`DATABASE_URL=postgresql:///lingolinq-test-1063`; the shared
`lingolinq-test` holds an `encryption_hash` from another key): **29 examples, 23 failures**.
Baseline before writing them: offboarding model + worker specs 67/0; related controllers,
mailer, license, org, remote_action, feature_flags, email templates 1328/0 (6 pending).

Red for the intended reason (failure message checked for each):
access block after hand-back; age basis; signup blob and revoked blob overwritten; repeat
hand-back; legacy notice dedupe; removal rejects matching parent email; unknown-age AI reset;
orphan seat counted as support; legacy-only sponsor not counted; same-org seat not counted;
never-sponsored detach requires birth / resets AI; hand-back becomes deletion-eligible; legacy
pending past deadline is due; RemoteAction action unknown; no-email hand-back still gates;
login token refused; mailer action missing.

Red only because the new event type is not written today (guards after the fix): pending,
unsponsored and eval link at the other org.

Green today, kept as guards: billing untouched; no notice for 13-15; legacy unassigned notice
kept when no hand-back notice; licensed sponsor at another org skips; the race (claim landing
before the lock is seen by the in-lock check); legacy decline still due.

## 3. Proposal

### Diagnosis

The hand-back gate is a pending COPPA blob written by the offboarding arm (`user.rb:603-634`).
Every reader (login, SAML, serializer, AI hard gate, Sentry, deletion sweep) keys on that blob,
so writing it locks the child out, starts a 14-day deadline ending in export-then-delete, and
overwrites any signup consent history.

### Recommended fix (A)

1. `begin_family_offboarding_consents!`: under the existing user lock,
   - replace the in-lock `License.active_seat_elsewhere?` with a new support predicate (below);
   - when under 13 (attested, or forced on expiry with no birth data) AND `school_authorization`
     is present: move it to `school_authorization_ended` (as today), write a new AuditEvent
     `school_authorization_handoff` with `age_basis` (`attested` / `unknown_assumed_under_13`),
     create RemoteAction `notify_school_handoff` (`<user>::<org>`, due now) in the same lock, and
     delete a pending `notify_unassigned` row for the same `<user>::<org>`;
   - never write `settings['coppa']`;
   - AI reset condition becomes `attested_under_16 || attested_under_13 || eu_under_16?`
     (adds the forced unknown-age case);
   - drop the `parent_email:` keyword and the consent-request mail.
   Idempotency: the transition fires only while `school_authorization` is present, and it is
   removed in the same locked write, so a repeat finds nothing to end.
2. Support predicate (D3), evaluated after the detach:
   another org counts when the student has an accepted (not pending), sponsored, non-eval
   `org_user` link to it (seat + link, or legacy link alone; a seat without a link does not
   count); the departing org counts when it had that link immediately before the detach AND
   still holds another active student seat for the student. Callers capture the departing
   org's pre-detach link before `release_user!` / the legacy detach and pass it in.
3. `Organization#remove_user`: read pre-detach sponsorship first (active student seat at this
   org, or accepted sponsored non-eval link). If none (D4): skip the birth requirement, skip
   offboarding entirely (no attestation stamp, no AI reset, no transition). Otherwise unchanged
   birth requirement. Stop reading/validating `offboarding_parent_email`.
4. `License.expire_stale_licenses!`: capture the departing org's link before `release_user!`;
   use the new predicate.
5. `coppa_offboarding_export_due?`: delete the pending-past-deadline branch; keep declined.
6. `RemoteAction#process_action`: `notify_school_handoff` -> `UserMailer.schedule_delivery(:school_handoff_notice, user_id, org_id)`.
7. `UserMailer#school_handoff_notice` + text/html templates + `en.yml` strings: informational
   only (the organization no longer supports the account; the account stays usable; AI
   features were turned off and can be turned on in preferences). No link, deadline, reminder.
8. Frontend: remove the parent-email field and its request fields from `confirm-org-action`;
   rewrite `offboarding_age_help` (no "needs parental consent" lockout claim); show the birth
   prompt only for sponsored, accepted rows; update the affected `public/locales/*.json` keys.

Delivery contract: at most one recorded dispatch per transition (the RemoteAction row, written
atomically with the transition). Delivery itself is at-most-once: a lost Resque job is not
retried. No email, disabled email or a bounce never blocks access or schedules deletion.

### Alternatives considered

- B. Keep the COPPA blob and special-case readers: rejected in the plan (missed readers,
  continued overwriting).
- Direct `UserMailer.schedule_delivery` after commit instead of a RemoteAction row: simpler,
  but loses the durable record if Redis drops the job before commit hooks run; the RemoteAction
  row also gives the dedupe point for the legacy notice. Recommend the row.
- Reuse `organization_unassigned` for the hand-back: smaller, but that mail would then go out on
  every licensed release, changing unrelated notifications. Rejected.
- Same-org seat: fixing `perform_release!` to keep the link while the same org holds another
  seat would be more correct, but changes access and boards for every release. Out of scope;
  the pre-detach-link rule honours D3 without it.

### Risks

- Q1 below: two AI paths lose their only under-13 block.
- In-flight claim window (Q2).
- Legacy pending blobs stay locked until manual reset (plan decision 7, review D6), and with the deadline branch
  gone the sweep no longer removes them.
- `requires_coppa_offboarding?` becomes unused (Q5).
- Sentry scrub narrows (Q4).

### Mutations that must turn each test red

Restore the pending write (access, login-token, byte-identical); restore the old AI reset
condition (unknown-age); restore deadline eligibility (legacy pending blob); drop the link
requirement (orphan seat); exclude same-org seats (same-org); delete the in-lock recheck (race);
drop the `school_authorization`-present guard (twice -> once); reintroduce removal-path email
validation (removal); remove the pre-detach sponsorship check (never-sponsored).

## 4. Existing tests to change (rule 14: needs Scot's approval before any edit)

Predicted from reading at HEAD; to be re-confirmed by a run after implementation, and the list
re-presented if the run differs.

A. Assertion changes (they encode the gate, the parent-email field, or deadline deletion):
- `spec/models/user_org_offboarding_consent_spec.rb`
  - `:113` "stamps pending COPPA with needs_parent_email..." -> asserts pending/needs-email/blocks.
  - `:130` "sends consent email when parent email is provided" -> removed field.
  - `:196` "stamps COPPA for under-13 from both US and EU orgs" -> asserts pending.
  - `:362` "starts COPPA offboarding when birth month/year is under-13" -> asserts pending.
  - `:374` "sends consent email when parent email is passed" -> removed field.
  - `:448` "offboards on removal when the only other active seat is a supervisor seat" -> asserts
    pending; behaviour (hand-back runs) unchanged.
  - `:492` "uses the stored attestation once the surviving seat expires" -> asserts pending; with
    no `school_authorization` the new code ends nothing and sends nothing (AI reset still runs).
  - `:522` "still offboards when the released seat was the last one" -> asserts pending/deadline.
  - `:537` "requires birth month/year when COPPA is enabled" -> uses `add_user(..., false, true)`
    (sponsored), so it should still pass; listed only in case the run shows otherwise.
  - `:548`, `:583`, `:603` (expiry group) -> assert pending / old event type.
  - `:563` "does not offboard when another organization still holds an active seat" -> its other
    seat is created with `License.create!` and no link, which D3 now calls an orphan seat, so the
    hand-back runs. Setup must add the link (claim) to keep encoding "surviving sponsor skips".
  - `:678` "process_expired_offboarding_consents! schedules delete after deadline" -> encodes the
    removed deadline deletion. Proposed: replace with the declined case or delete (new spec
    covers "past deadline is not due").
- C4 `:267`/`:294` (in-lock recheck spies): `:267` should pass (claim gives seat + link) but its
  spy wraps `License.active_seat_elsewhere?`, which the new predicate replaces, so the spy target
  must be renamed; `:294` also asserts pending.

B. Setup-only changes (they use `begin_family_offboarding_consents!` to manufacture a legacy
pending blob; assertions kept, setup seeds the blob and the legacy AuditEvent directly):
- `user_org_offboarding_consent_spec.rb`: `:312` (submit email), `:621`, `:665` helper (`:693`,
  `:704` users), `:743` helper (`:761`-`:851`), `:896` helper (`:919`-`:950`), `:963`.
- `spec/controllers/parental_consents_controller_spec.rb`: `:48` example and the
  `offboarding_user` helper `:234-:250` (examples `:274`-`:412`).
- `spec/controllers/session_controller_spec.rb:583`.
- `spec/controllers/api/users_controller_spec.rb`: `:2154`, `:2189`, `:2223`.

C. Not changed: `user_org_offboarding_consent_spec.rb` `:147`-`:222` (under-16/EU), `:233`-`:311`
apart from the spy rename above, `:350` (the shared validator raises before any state check),
`:426`/`:464` (claims give seat + link), `:645`, `:740`-`:851` assertions, `:862`, `:81`-`:101`
(`requires_coppa_offboarding?`, if kept); the worker spec; `user_mailer_spec.rb:164`;
`organizations_controller_spec.rb` "should allow removing a user"; the signup inequality
example in `users_controller_spec.rb`.

## 4a. Proposal review (adversary agent, 2026-10-17): verdict "block as written"

Verified by me before adopting:
- CONFIRMED: the never-sponsored skip misses the authorizing org (Q6).
- CONFIRMED: `origin/staging` (a9bfdd703) and `origin/main` (cbfeb2043) lack the
  "unknown action is kept" branch in `remote_action.rb` (it arrived with #1117), so on a rollback
  or on staging's scheduler a `notify_school_handoff` row is deleted unsent. Revision: do not
  delete the legacy `notify_unassigned` row; dedupe at read time instead (the
  `organization_unassigned` mailer skips when a hand-back notice for that org exists). The
  hand-back row itself is still lost on a pre-#1117 build; it ships only once #1117 is on main.
- CONFIRMED: `license.rb:48` commits `status: 'expired'` before `release_user!` (`:51`) with no
  rescue, so a stuck row can leave a licensed org's link in place. Revision: a link without a
  seat counts as legacy support only when that org holds no License row naming the student.
- Same-org on `remove_user` (Q7). Section 4 corrections: `:693` moves to group A (it asserts the
  account stays due after a failed export of a deadline-expired blob); `:391`, `:405`, `:416`
  belong in group C. The race test only covers a claim that finished before the lock, not the
  Q2 window; the "twice" test calls the method directly. Add tests: double `remove_user`,
  authorizing-org unsponsored removal, a hand-back that leaves other orgs' rows alone, a stuck
  expired licensed link. Store `age_basis` in `school_authorization_ended` too (the AuditEvent
  data is encrypted), which Q1(b) needs. Missed readers: `audit-reports/compliance-calendar.json`
  counts the old event type (governance follow-up); `scheduled_deletion_proceeds?`
  (`subscription.rb:1621`) changes harmlessly. Frontend: both `people.js` and `reports.js` open
  the dialog with only `{action, user_name}`, and `models/organization.js` carries the
  parent-email field.

## 5. Open questions

**Scot, 2026-10-18 (supersedes the framing below).** Schools do not create accounts for
under-13s and hand them to the child under the child's own email. Where a personal email is on a
handed-off minor's account it belongs to a parent or guardian, and the account is adult-managed.
Applied:
- Q6 is dropped. The D4 never-sponsored skip stands as decided. **Superseded the same day:**
  Scot restored the original Q6 fix. The organization that authorized the account counts as a
  sponsor for the D4 check (it is not the child's-own-email case): without it, a school that
  created the account without a seat could leave, the guardian would get no notice, and
  `school_authorization` would never end, which today's code does end.
- Q1 no longer blocks: accept and record. Transcription is ungated by AI preference for every
  account by the 2026-09-30 decision; narration runs only for a supervisor the guardian links.
  The D2 reset plus the guardian's own controls is the adopted behaviour.
- Q2, Q3, Q4, Q5 and Q7 proceed on the recommendation given.
- The review-driven technical fixes in 4a (read-time dedupe, no-License-row test for legacy
  links, `age_basis` stored on `school_authorization_ended`, extra tests) still apply; they do not
  depend on who holds the account.

- **Q1 (was: blocks implementation).** Voice transcription and eval narration do not read AI
  preferences, so after hand-back they run for an under-13 with no guardian decision (latent
  while runtime credentials are withdrawn, #1136). Options: (a) accept and record it;
  (b) keep the COPPA hard gate for handed-off under-13s on just those two paths (deny while
  `school_authorization_ended` holds an under-13 basis and no active parental consent);
  (c) the rejected general hard-block predicate. Recommendation: (b), narrowest change that
  keeps today's effective behaviour on the two paths the reset cannot reach.
- **Q2.** In-flight claim: the seat is visible under the lock, the link is not. A seat with no
  link counts as no support (D3), so a release racing a brand-new claim can hand back while the
  new org is attaching. Accept (recommended: the consequence is a notice and AI off, no lockout),
  or count a linkless seat granted in the last few minutes.
- **Q3.** Eval links: the review's definition (M4) excludes eval, so detaching an eval account
  skips offboarding entirely. Confirm, or count eval as sponsorship for the D4 check only.
- **Q4.** Sentry scrub: file a follow-up (recommended, per the plan), or add the handed-off
  under-13 to `child_user?` in this PR.
- **Q5.** `requires_coppa_offboarding?` becomes unused: keep it (no test edits), or delete it and
  its four examples (needs approval).
- **Q6 (from review, High).** Never-sponsored skip vs the authorizing org: an org can create its
  own under-13 (`school_authorization.organization_id` = that org, `user.rb:2824`) and attach them
  unsponsored (`new-user.js` `add_unsponsored_user` -> `organization.rb:2426`; accepted because
  `subscription.rb:98` clears pending for the authoring org). Removing them would end nothing and
  notify no one, and no seat exists to expire later. Recommendation: count "departing org is the
  authorizing org" as sponsorship for the D4 check.
- **Q7 (from review).** Same-org rule on manager removal: `remove_user` releases one seat
  (`organization.rb:1518`); a leftover duplicate seat would hold off the hand-back until it
  expires. Recommendation: apply the same-org count to expiry only, not to an explicit removal.
- Governance (Scot): `LL-f150e0e828` remediation text; `docs/legal` sweep of the five files in
  review H2 via the governed route; policy-doc C4 wording in the brain. M8 has no existing issue
  (searched 2026-10-17); filing needs your go-ahead.

## 6. Implementation results (2026-10-18/19)

Implemented as section 3 with the 4a revisions, Q6 restored, and Q1-Q5/Q7 on the recommendations.
Departures from section 3, with reasons:
- My own new test "replaces the legacy unassigned notice" became "skips the legacy unassigned mail
  at send time": the 4a revision keeps the row and dedupes in `UserMailer#organization_unassigned`
  (`User#recent_school_handoff_notice_for?`, 7-day window from `handoff_notice_at`).
- Q6 requires an `org_user` link of any state to the authorizing organization, so a removal call
  for a student who is not attached is not a hand-back.
- Frontend: the birth prompt still shows for every removal. With Q6 the client cannot tell which
  removals are sponsoring (it does not see `school_authorization`), and the server asks for the
  birth date exactly when it needs it. The parent-email field, its payload key, and the old help
  text are gone. The inert parent-email plumbing in `organization/people.js`,
  `organization/reports.js` and `models/organization.js` stays: `.eslint-todo` pins findings by
  line (`people.js` 296, `confirm-org-action.js` 107), and removing lines above them would trip
  `lint:js:ci`. Removing it needs a rebaseline, which needs approval.
- Other 12 `public/locales/*.json` files still hold the old help-text and parent-email keys
  (unused). The new key `offboarding_handoff_age_help` renders its English default there.
- `parental_consent_mailer.offboarding_footer` (legacy consent mail) no longer says an unanswered
  request ends in deletion. `parental_consent_offboarding_export_mailer.intro` still says "declined
  or the consent window expired"; left as is.
- Spanish mailer strings: `config/locales/es.yml` holds no mailer keys, so the notice is English
  only, like the other mailers.

### Test environment incident (reported to Scot)

Before 2026-10-18 the RSpec runs used the host cluster on port 5432 (socket): `lingolinq-test`
via `DB_USER=scotw` (5 invocations, none of which ran an example: two stopped in Bundler on
missing gems before connecting, and three connected and failed at boot reading `Setting`, the
encryption-key mismatch; corrected 2026-10-20 from "6 runs") and a database I
created, `lingolinq-test-1063` (`rails db:create db:schema:load`, then 3 runs). Nothing was
dropped. From 2026-10-18 all runs used containers `ll-spec-pg-7b6bd0` / `ll-spec-redis-7b6bd0`,
removed with their volumes at the end.

One container baseline was discarded: it ran while I was editing application files (the test
environment loads code lazily), and its red-spec count (2 failures, not 23) showed the mix. The
clean baseline was rerun with the application files checked out at the base commit.

### Results (containers)

| Run | Examples | Failures | Pending |
| --- | --- | --- | --- |
| Base `117a81238`, related suites | 1659 | 0 | 6 |
| Base, new specs | 29 | 23 | 0 |
| Change, no existing-test edits | 1659 | 44 | 6 |
| Change + approved edits + new specs + i18n completeness | 1695 | 0 | 6 |

The 44 failures were exactly groups A and B (base-commit line numbers): offboarding spec :113,
:130, :196, :267, :294, :312, :362, :374, :448, :492, :522, :548, :563, :583, :603, :621, :678,
:693, :704, :761, :771, :780, :789, :800, :815, :834, :851, :919, :928, :939, :945, :963;
parental consents :48, :273, :297, :328, :339, :377, :391, :403; session :583; users controller
:2139, :2174, :2208 (the examples holding the approved :2154/:2189/:2223 calls). No group C
example failed. `lint:js:ci`: new=0. `ember-template-lint` on the changed template: clean.

### The 5 new examples added after the base red run (2026-10-20)

Run in containers with the application files at `117a81238` and the specs at `d8ecfcc66`:
- "hands back when it removes an unsponsored student it authorized": fails on base. Base runs the
  old gate (authorization ends, pending consent, old event), so it fails on the new event, not on
  whether the hand-back happens.
- "still needs the birth date for that removal": passes on base (base asks for a birth date on
  every removal). A guard on unchanged behaviour.
- "records one hand-back when the same removal is sent twice": fails on base, which offboards on
  both removals and writes two old events.
- "hands back when another organization's link outlived its expired seat": fails on base only on
  the new event (base also hands back, through the gate).
- "leaves other organizations' queued notices alone": fails on base only on the new event (base
  also hands back and keeps the other row).

### Mutations (one at a time, restored from a private copy, tree verified clean after)

All red except one: M1 pending write restored (3 tests); M2 old AI reset condition; M3 deadline
eligibility (2); M4 orphan seat counted; M5 same-org seat ignored; M6 in-lock recheck removed; M7
school_authorization guard dropped ("runs twice" red; "same removal sent twice" stays green
because the second removal is already skipped by D4, so that test guards D4, not M7); M8
removal-path parent email reintroduced; M9 D4 check removed (2); M10 Q6 rule removed (2); M11
stuck expired link counted; M12 send-time dedupe removed; M13 RemoteAction branch removed.
