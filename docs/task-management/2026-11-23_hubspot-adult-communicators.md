# HubSpot: send adult communicator accounts too (2026-11-23)

Decision (Scot, 2026-11-23): add `communicator` to `User::MARKETING_TRACKABLE_TYPES` so
self-registered adult AAC users get the HubSpot trial and onboarding emails. Every other
condition of `User#marketing_trackable?` and of the send path stays as it is.

## Fact sheet

**(a) Where is the allowlist read?**

- CONFIRMED `app/models/user.rb` "MARKETING_TRACKABLE_TYPES = %w[therapist parent teacher other eval manually-added-supervisor]":
  its only reader is `marketing_trackable?` in the same file ("MARKETING_TRACKABLE_TYPES.include?(type)").
  `grep -rn MARKETING_TRACKABLE_TYPES` over the repo returns only these two lines.
- CONFIRMED `marketing_trackable?` has exactly two production readers, both in
  `lib/external_tracker.rb`: `track_new_user` ("return unless user && user.external_email_allowed? && user.marketing_trackable?")
  and the worker's re-check in `persist_new_user` ("return false unless user && user.external_email_allowed? && user.marketing_trackable?").
  Both run before any HubSpot call and before the iplocate lookup.
- CONFIRMED `track_new_user` is called from two signup paths only, both after the
  COPPA-pending check: `app/controllers/api/users_controller.rb` (email signup, "unless coppa_pending")
  and `app/controllers/session_controller.rb` `google_signup_complete` ("unless user.coppa_parental_consent_pending?").
- CONFIRMED `supporter_registration?` (`app/models/user.rb`, "!['unspecified', 'communicator'].include?")
  is not a reader of the allowlist and is not changed.

**(b) What shapes can the inputs hold, and who writes them?**

- `registration_type`: any client-sent string (email signup), or the Google start step's
  allowlist `%w[communicator therapist parent teacher other]` defaulting to `communicator`
  (`session_controller.rb` "registration_type = 'communicator' unless allowed_registration_types.include?").
  Note the Google *complete* step passes `params['registration_type'].presence || link['registration_type']`
  without re-checking that allowlist; the marketing allowlist still rejects anything unknown. Not changed.
- `settings['registration']['adult_at_signup']`: one writer, `User#process_params` on create
  (`app/models/user.rb`, "adult_at_signup = User.age_under_threshold?(... age: 18) == false").
  CONFIRMED that block is inside `if !self.id` and does not read `registration_type`, so a
  communicator gets the marker by exactly the same rule as a supporter: true only when a usable
  birth month and year says 18 or over; false otherwise. (Verification task item (a).)
- `settings['coppa']`: written by the under-13 branch of `process_params`; present in any state
  means not sent (unchanged).
- `settings['registration']['under_16']`: same create block; true means not sent (unchanged).

**(c) Cross-file claims checked**

- Google signup defaults to communicator: CONFIRMED in three places: server start step
  (above), server `google_signup` GET ("registration_type: link['registration_type'] || 'communicator'"),
  and the frontend `app/frontend/app/controllers/register.js` (`googleSignupRegistrationType`,
  `res.registration_type || 'communicator'`; the start step sends
  `model.preferences.registration_type || 'communicator'`). (Verification task item (b).)
- Google signup records the adult marker only when the domain has COPPA parental consent on:
  CONFIRMED `session_controller.rb` stores `config['birth_month']`/`['birth_year']` only inside
  `if JsonApi::Json.coppa_parental_consent_enabled?` (and only on POST). `create_from_google_signup!`
  passes `link['birth_month']`/`link['birth_year']` to `User.process_new`, so with the flag off the
  birth date is nil, `adult_at_signup` is false and the account is not sent (fails closed). With the
  flag on, a birth date is required (`birthdate_required`) and the marker is recorded as for email signup.
  Whether the flag is on in each environment is a domain setting I did not read.
- The email signup form asks a communicator for a birth month and year
  (`app/frontend/app/templates/register.hbs`, the `showCommunicatorAgeStep` branch with `birth_month`).
- The HubSpot payload carries the account type: CONFIRMED `persist_new_user` sends
  `{property: 'account_type', value: acct}`. A `communicator` falls through to the default
  `acct = "Communicator Account"` (it is not `supporter_registration?`, not `other`, not
  `manually-added-org-user`). The pre-#1123 code (`git show 75a2b6f93^:lib/external_tracker.rb`)
  also gated on `supporter_registration?`, so this send path has not sent that value recently.
- HubSpot portal reachable through the HubSpot connector (schema read only, 2026-11-23): the
  contact properties `account_type` and `username` do NOT exist there
  (`get_properties` returned `propertiesNotFound: ["account_type","username"]`); `lingolinq_referrer`,
  `lingolinq_ad_referrer`, `lingolinq_start_code` and `hs_legal_basis` do. Whether the app's
  `HUBSPOT_ACCESS_TOKEN` is for the same portal, and how the legacy v1 contact endpoint treats an
  unknown property, are UNVERIFIED. Pre-existing and affects supporters equally; reported, not changed.
- Existing tests that mention communicators: `spec/lib/external_tracker_spec.rb`
  "should not schedule for communicator accounts" and the `u2` case in "should return false if not allowed"
  build a communicator with no `registration` hash, so they stay false after this change because the
  adult marker is missing, not because of the type. They keep passing; not edited.

## Proposal

Diagnosis: adult communicators are excluded only because `communicator` is not in
`MARKETING_TRACKABLE_TYPES`; every other condition is type-independent.

Candidates:
1. Add `communicator` to `MARKETING_TRACKABLE_TYPES` (chosen; this is Scot's decision, one line,
   and both entry points inherit it).
2. A separate branch in `marketing_trackable?` for communicators with its own conditions. Rejected:
   Scot's decision is the same checks as supporters, and a second branch is a second place to drift.
3. Change `supporter_registration?`. Rejected: mail and stats read it with its own meaning.

Risks: a communicator account that uses a parent's or SLP's email sends that person the emails
(accepted by Scot). EU adults on legitimate interest (Scot's position; #385 open, unchanged).
Google signups default to communicator, so more Google signups become eligible, but only those
with a recorded adult birth date. Unresolved: HubSpot portal property mismatch above.

Tests: adult communicator is trackable, scheduled and sent; communicator under 18, with no recorded
age, with any child-consent record, or under 16 is not; a real signup through `User.process_new`
with a communicator type records the marker. Mutation that must make them fail: remove
`communicator` from the allowlist.
