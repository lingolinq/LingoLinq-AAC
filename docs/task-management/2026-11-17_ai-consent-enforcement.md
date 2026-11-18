# AI data-sharing consent: enforce it at every AI call site (#1136)

Date: 2026-11-17. Branch: `compliance/scot-ai-consent-hubspot-gates-02375437`. Base: `develop` at `d6b3cc859`.
All `file:line` citations below were read at that base commit.

## Decisions this work builds on (Scot, 2026-11-17)

1. Consent covers every account and every AI feature (word prediction, board generation, focus
   words, evaluation narration). This overrides the issue text, which left board generation out.
2. No government ID. No new consent screen. The lightest model, matching how Google Workspace for
   Education and Microsoft 365 Education handle AI (the school is the gate; no per-student prompt):
   - self-signup accounts agree at registration (one sentence in the terms step);
   - a district authorizes AI once for the accounts it manages, and that alone covers them;
   - the district setting defaults to off;
   - existing accounts get one click on the existing one-time AI notice;
   - under-13 and EU under-16 accounts keep the existing parent approval step, with AI wording added;
   - turning "Allow AI features" off is how an account withdraws.

## 1. Fact sheet

### (a) Where is the consent READ today?

- CONFIRMED: nowhere in production. `User#ai_consent_granted?` (`app/models/user.rb:1567`) has no
  caller under `app/` or `lib/` (`git grep ai_consent_granted? -- app lib` returns only the
  definition and comments).
- CONFIRMED: the model call for each feature, and the gates that run before it:

| Feature | Controller entry | Library gate | Model call |
|---|---|---|---|
| Word prediction | `words_controller.rb:57-63` | `ai_word_predictor.rb:65-71` | `ai_word_predictor.rb:345` |
| Word prediction (tokens) | `word_suggestions_controller.rb:13-31` | same, via `predict_from_tokens` (`:182`) | same |
| Board generation | `boards_controller.rb:627-645` | `ai_board_generator.rb:50-70` | `ai_board_generator.rb:683` |
| Focus words | `integrations_controller.rb:98-104` | `ai_board_generator.rb:283-301` | `ai_board_generator.rb:683` |
| Evaluation narration | `eval_sessions_controller.rb:44,84` | `eval_narrator.rb:146-152` (`ai_allowed_for?`) | `eval_narrator.rb:251` |

- CONFIRMED: two places return AI output without reaching the library gate, so a library-only
  check would miss them: the word-prediction cache (`ai_word_predictor.rb:103-105`, read before
  `AiClient.available?`) and the focus-word cache (`integrations_controller.rb:119-128`,
  `AiFocusWordSet` hit returns before `generate_focus_words`). Both sit AFTER the existing gate
  lines, so a consent check placed beside the existing COPPA check precedes both.
- CONFIRMED: `AiPredictionGenerator` (`lib/ai_prediction_generator.rb:238`) is called only from
  `lib/tasks/generate_predictions.rake` and sends static word lists, no account data. Not gated.

### (b) What shapes can the consent hold, and who writes each?

- CONFIRMED: `settings['ai_consent']` has no production writer. `grant_ai_consent!`
  (`user.rb:1616`) and `revoke_ai_consent!` (`user.rb:1703`) are called only from specs. So on
  every real account today the value is absent, and the check will block every account until a
  grant route ships. The check and the grant routes must reach production together.
- Shapes `ai_consent_granted?` handles (`user.rb:1567-1575`): missing or non-Hash (false), no
  `granted_at` (false), `revoked_at` present (false), version blank or different from the current
  one (false), otherwise true. Current version is 1 (`lib/lingo_linq/ai_consent_disclosures.rb:51`).
- CONFIRMED: `grant_ai_consent!` refuses a grant where `granted_by_user_id` is the account itself
  (`user.rb:1628`, `self_grant_forbidden`). The registration and one-click routes are self-grants,
  so this rule has to change for adult accounts.
- CONFIRMED: `AI_CONSENT_SOURCES` is `email_link in_app admin_backfill` (`user.rb:1581`). There is
  no `registration` source.
- District setting: CONFIRMED there are two, and neither is the switch the design needs.
  `settings['disable_ai_features']` is read by `FeatureFlags.ai_enabled_for?`
  (`lib/feature_flags.rb:264`) but nothing writes it and no screen shows it.
  `settings['external_ai_processing']` has a screen (`templates/organization/settings.hbs:55-61`)
  but governs only Google voice transcription (`button_sound.rb:48`). So a district has no way to
  authorize or switch off the Claude features today. A new district record is needed.
- "Managed account": `FeatureFlags.ai_enabled_for?` resolves the district as
  `user.managing_organization` (`app/models/concerns/supervising.rb:74`, the org the account is
  attached to as a `user`, sponsored first). The new check uses the same lookup so the two agree.
- A nil user: CONFIRMED the sibling gates let nil through (`coppa_blocks_ai_for?` returns false
  unless a user, `feature_flags.rb:314`; `ai_word_predictor.rb:65` skips the flag check when
  `user` is nil). CONFIRMED every controller entry requires a signed-in account
  (`words_controller.rb:53` returns 401; the other four run `require_api_token`). The narrator
  already refuses a nil student (`eval_narrator.rb:147`).

### (c) Cross-file claims checked

- "Adding the check inside `ai_feature_enabled_for?` is enough": FALSE.
  `eval_sessions_controller.rb:112` uses that method to decide whether the clinician may open the
  narration endpoint at all, and answers 400 when it is false. A consent check inside it would
  stop a clinician with no consent from getting even the local template. The plan requires the
  template fallback, so the consent check must be its own call.
- "The existing one-time AI notice can carry the agreement as is": FALSE. It is shown only where
  `article_50_disclosure_required` is true (EU or unknown jurisdiction;
  `utils/article50_gate.js` `needsAcknowledgement`), and it has no way to decline
  (`ai-disclosure.hbs` is `@uncloseable` with one button). Reusing it needs a second trigger and a
  "Not now" exit.
- "Baseline is green": 542 examples, 1 failure on untouched `develop` in this environment
  (`spec/controllers/api/word_suggestions_controller_spec.rb:29`). ASSUMED cause: local `.env`
  supplies a Bedrock credential the example expects to be absent. Not load-bearing; to be
  confirmed by running with the credential unset.

## 2. Proposal

### Diagnosis

An account with no AI data-sharing consent on file reaches every AI feature, because no call site
reads `settings['ai_consent']` (fact a). No account can have a consent on file, because nothing
writes one (fact b).

### The check

`FeatureFlags.ai_consent_blocks_ai_for?(user)`, next to `coppa_blocks_ai_for?`:

- false when `AI_CONSENT_HARD_GATE=false` (emergency rollback, mirrors `COPPA_AI_HARD_GATE`);
- false for a nil user (see candidates below);
- for an account with a `managing_organization`: blocked unless that district has a current AI
  authorization (`Organization#ai_authorized?`: a record with who, when and the disclosure
  version, written when a district manager turns the setting on; not revoked; version current);
- for every other account: blocked unless `user.ai_consent_granted?`.

Placement: beside each existing COPPA line, in all five controller actions (answering
`403 {error: "ai_consent_required", disclosures_version: N}`, before the feature-flag check so
the specific reason is not masked) and in the three libraries (before the cache read in the
predictor). Narration checks the STUDENT in `EvalNarrator.ai_allowed_for?` and falls back to the
local template; the response carries `ai_consent_required: true` when AI was asked for and
refused for that reason.

### Candidate fixes

- **A (plan as written): put the check inside `ai_feature_enabled_for?` and treat a nil user as
  blocked.** One line covers every caller. Rejected: it breaks the narration template fallback
  (fact c), and blocking nil changes about twenty existing library examples that call with no
  user, for a case no production path reaches.
- **B (proposed): a separate predicate called explicitly at the eight sites, nil user not
  blocked, plus a coverage spec** that fails when any controller action or library method reaches
  an AI library or `AiClient.build!` without the check. Larger diff, smaller behaviour change:
  only accounts lose access, and each site keeps its own fallback.
- **Simplest alternative considered: library-only check.** Rejected: the focus-word cache returns
  before the library runs (fact a), and the controllers could not give the screen a specific
  reason.

### Grant routes (same PR, separate commits)

1. Self-signup: `Api::UsersController#create` and the Google signup record a grant (new source
   `registration`) when the terms are agreed, for accounts with no COPPA record, not EU under-16
   and not district-managed.
2. Existing accounts: `POST /api/v1/users/:id/ai_consent` (source `in_app`), allowed only for the
   signed-in account acting on itself; refused with a named reason for a district-managed account
   (`org_authorization_required`) and for a COPPA-record or EU under-16 account
   (`parental_consent_required`).
3. Parent approval: `grant_parental_consent!` and `grant_eu_ai_parental_consent!` also record the
   AI consent (source `email_link`).
4. District: `ai_authorized` on the organization update, manager only, audited.
5. `grant_ai_consent!` allows a self-grant only for sources `registration` and `in_app` and only
   for an account with no COPPA record that is not EU under-16.
6. Withdrawal: no new control. `user_pref_allows_ai?` already blocks when "Allow AI features" is
   off.

### Risks I can see

- The check and the grant routes must ship together or AI is off for everyone.
- Existing district accounts lose AI until a district manager confirms once. I read "existing
  districts keep their current setting until an admin confirms" as: no setting is flipped for
  them, and AI for their managed accounts waits for that confirmation. The other reading
  (grandfather them) is a one-line change. Needs Scot's confirmation.
- A supervisor speaking as a communicator: the server checks the signed-in account, not the
  communicator. Unchanged by this work; flagged.
- Existing examples that expect an AI call from an account with no consent will fail. Their setup
  gains a consent; no assertion changes. The two `self_grant_forbidden` examples
  (`spec/models/user_spec.rb:5976,5990`) encode the rule Scot changed; they are rewritten to the
  new rule (still refused for parent-route accounts) and listed in the PR.

### Questions I could not resolve (for counsel, not decided in code)

- Whether agreement bundled into the terms step is specific enough for GDPR consent.
- Whether a district's authorization can stand in for a parent's for an under-13 managed account.
- Disclosure v1 text names word prediction only; a reviewed v2 is needed for board generation.

### Tests, and the mutation that must make each fail

- Predicate: no record, stale version, revoked, and current grant; managed account with and
  without district authorization; rollback switch. Mutation: make the predicate return false.
- Each library: no AI call (`call_anthropic` / `AiClient.build!` not received) and no cache hit
  served without consent. Mutation: delete the library's consent line.
- Each controller: 403 `ai_consent_required` and the library not called; narration returns the
  template with the flag. Mutation: delete the controller's consent line.
- Coverage spec, modelled on `spec/controllers/article_50_disclosure_backstop_coverage_spec.rb`.
  Mutation: remove the check from one action and confirm the spec names it.

---

# HubSpot: adults only (#1123) and removal on deletion (#384)

## Fact sheet

### (a) Where is the "may this account go to HubSpot" value READ?

- CONFIRMED: twice, both in `lib/external_tracker.rb`: `track_new_user` (`:7`, before the job is
  scheduled) and `persist_new_user` (`:14`, when the job runs). Both read
  `user.external_email_allowed? && user.supporter_registration?` and then `cookies_opted_out?`.
- CONFIRMED: three callers of `track_new_user` and no others (`git grep track_new_user -- app lib`):
  `api/users_controller.rb:354`, `session_controller.rb:1012` (Google signup),
  `parental_consents_controller.rb:40` (right after a parent approves an under-13 signup).
- CONFIRMED: `supporter_registration?` has three other readers (`user_mailer.rb:70`,
  `stats.rb:1406`, a commented line in `subscription.rb:908`), so it must not change meaning.

### (b) What shapes can the account type hold?

- CONFIRMED: `registration_type` (`user.rb:142-146`) returns `'unspecified'` for a missing or
  empty value and otherwise whatever is stored at `settings['preferences']['registration_type']`,
  which the client sends (`'registration_type'` is in the permitted preference list,
  `user.rb:2585`). A non-string stored value is returned as is, and `res.length` runs on it.
- CONFIRMED: `supporter_registration?` (`user.rb:148-150`) is a blocklist of two values, so
  `student`, `manually-added-org-user`, any unknown string and any non-string all count as
  supporters and are sent.
- Age: CONFIRMED no birth month or year is stored at signup unless the
  `compliance_workflow_kernel` flag is on (`user.rb:2867-2873`). What is stored is
  `settings['registration']` with `under_16`, `eu_under_16`, `registered_at` (`user.rb:2855-2859`),
  and a `settings['coppa']` record for an under-13 signup (`user.rb:2820-2824`). Nothing records
  "18 or over". The birth month and year are in the signup params at that point
  (`User.signup_birth_from_params`, `user.rb:497`), so a yes/no marker can be computed there
  without keeping the date.

### (c) Cross-file claims checked

- "No deletion path contacts HubSpot": CONFIRMED. `Flusher.flush_user_completely`
  (`lib/flusher.rb:485-503`) is the hard delete and has no tracker call.
- "A cancelled deletion never reaches the hard delete": CONFIRMED for the inactivity sweep
  (`flusher.rb:488`, `User.scheduled_deletion_proceeds?`); the removal call goes after that line.
- "Earlier addresses are kept": CONFIRMED `settings['old_emails']` is appended on an email
  change (`user.rb:2746-2747`).
- HubSpot's delete call: `POST /crm/v3/objects/contacts/gdpr-delete` with
  `{objectId: <email>, idProperty: "email"}`, answers 204. Read 2026-11-17 at
  https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/gdpr/gdpr-delete-contact .
  The page says an address that is not found "will be added to a blocklist and prevent it from
  being used in the future". So calling it for every deleted account blocks that address from
  ever becoming a HubSpot contact again, including for a person who signs up again later.
  Required scope not readable on the page; ASSUMED `crm.objects.contacts.write` (search summary).

## Proposal

- #1123: a new `User#marketing_trackable?` used at both read sites. True only when the type is a
  String in `therapist parent teacher other eval manually-added-supervisor`, the account has no
  `settings['coppa']` record, is not `under_16`, and `settings['registration']['adult_at_signup']`
  is `true`. The marker is written once at signup from the birth month and year (18 or over);
  the date is not kept. A missing marker means not sent.
  - Alternative: tighten `supporter_registration?` itself. Rejected: three other readers.
  - Risk: accounts created without birth data (API clients, Google signup if it sends none) are
    never sent. That is the intended fail-closed direction.
- #384: `ExternalTracker.remove_contact(emails)` scheduled from `flush_user_completely` after the
  cancellation check and before the row is destroyed, for the current and earlier addresses.
  No token means no call; 204 and 404 are success; any other answer raises so the worker retries;
  a failure never blocks the account deletion.
  - Alternative: plain archive (`DELETE /crm/v3/objects/contacts/{id}`), restorable for 90 days.
    Rejected: it needs a contact id we do not store, and it is not a permanent delete.
  - Open: the blocklist side effect above. Named in the PR for Scot.
- Mutations: restore `supporter_registration?` at either read site; drop the `coppa`, `under_16`
  or marker clause; remove the `flush_user_completely` call.

# Outcomes (2026-11-17)

## Consent design Scot approved

Research into Google Workspace for Education and Microsoft 365 Education found no per-user
consent click in either: the district administrator is the control, and student AI is off by
default. Scot approved the lightest design that matches:

1. A self-signup account agrees at registration (one sentence and a link on the terms step).
2. A district authorizes AI once (`Organization#authorize_ai!`), and that alone covers the
   accounts it manages. No per-student prompt.
3. An existing self-signup account agrees with one click on the existing one-time AI notice.
4. Under-13 and EU under-16 accounts get no new step: the existing parent approval emails
   now say that approving covers AI data sharing.
5. Withdrawal is "Allow AI features" off.
6. AI stays off for managed accounts until a manager turns the setting on. Scot, 2026-11-17:
   no grandfathering, there are no existing districts.

## First proposal review (#1136): blocked, then fixed

The adversary review blocked the first proposal. What changed because of it:

- Narration ignored the student's "Allow AI features" setting. `EvalNarrator.ai_consent_refuses?`
  now refuses when the master preference is present and not true.
- `managing_organization` counts a pending invite. `Organization.ai_consent_orgs_for` reads
  accepted, non-pending `type == 'user'` attachments only.
- A masquerading admin satisfied "acting on itself". The grant endpoint requires `!@true_user`,
  and so does the organization setting.
- The self-grant guard only ran when an id was passed. It now runs for every self source.
- The registration grant is recorded after the account is saved, and never for a start-code
  signup.
- The coverage spec's pattern had blind spots; it now scans per method.

Not fixed, named in the PR: a child a parent already approved has no route to this consent,
and `AI_CONSENT_HARD_GATE` is not in the deploy workflow, so a deploy clears it.

## Second proposal review (#384): blocked, then redesigned

- Critical: HubSpot's permanent-delete endpoint adds an address it has never seen to a
  blocklist. Calling it for every deleted account would have sent children's and students'
  addresses to HubSpot. Redesign: `ExternalTracker.record_sent_email` records an address only
  when it was actually sent, and `remove_contact` is called only for recorded addresses.
- High: the worker does not retry a failed job. `remove_contact` retries itself
  (`REMOVE_CONTACT_ATTEMPTS = 3`) and never raises.
- Medium: schedule after the row is destroyed, not before.
- The adult marker is written only when `age_under_threshold?(..., age: 18) == false`.

Contacts sent to HubSpot before this change are not recorded, so they are not removed on
deletion. That reconciliation needs someone with HubSpot access.

## Checks

- Every guard was removed in turn with a test going red (backend: consent check, grant
  routes, adults-only, removal; frontend: preference check, gate skip, component skip).
- Full RSpec suite against untouched `develop` (`d6b3cc859`): the same 68 examples fail on
  both in this environment; none are in files this branch touches.
- Targeted Ember run: 194 of 194. Not the full frontend suite. No browser click-through.

## Follow-ups

- The registration sentence shows for start-code and EU under-16 signups, where the server
  records nothing. The controller has the state to hide it on the main terms step
  (`start_code`, `euUnder16Registration`); the Google fallback step only has a proxy.
- The disclosure link is fixed to version 1 in `register.hbs` and `organization/settings.hbs`.
- Twelve locale files carry English text for the 15 new keys.
