# HubSpot: send adult communicator accounts too (2026-11-23)

Decision (Scot, 2026-11-23): add `communicator` to `User::MARKETING_TRACKABLE_TYPES` so
self-registered adult AAC users get the HubSpot trial and onboarding emails. Every other
condition of `User#marketing_trackable?` and of the send path stays as it is.

## Fact sheet

**(a) Where is the allowlist read?**

- CONFIRMED (before the change, at `003c22753`) `app/models/user.rb` "MARKETING_TRACKABLE_TYPES = %w[therapist parent teacher other eval manually-added-supervisor]":
  its only reader is `marketing_trackable?` in the same file ("MARKETING_TRACKABLE_TYPES.include?(type)").
  `grep -rn MARKETING_TRACKABLE_TYPES -- app lib` returns only these two lines.
- CONFIRMED `marketing_trackable?` has exactly two production readers, both in
  `lib/external_tracker.rb`: `track_new_user` ("return unless user && user.external_email_allowed? && user.marketing_trackable?")
  and the worker's re-check in `persist_new_user` ("return false unless user && user.external_email_allowed? && user.marketing_trackable?").
  Both run before any HubSpot call and before the iplocate lookup.
- CONFIRMED `track_new_user` has three callers: `app/controllers/api/users_controller.rb` (email signup,
  "unless coppa_pending"), `app/controllers/session_controller.rb` `google_signup_complete`
  ("unless user.coppa_parental_consent_pending?"), and `app/controllers/parental_consents_controller.rb`
  after a parent approves an under-13 signup ("unless offboarding"). The third is still refused: the
  approved account keeps its `settings['coppa']` record (grant deletes only the pending keys), and it
  has no adult marker. (The first draft of this log said two callers; corrected after the adversary pass.)
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
  (above), server `google_signup_candidates` GET ("registration_type: link['registration_type'] || 'communicator'"),
  and the frontend `app/frontend/app/controllers/register.js` (`googleSignupRegistrationType`,
  `res.registration_type || 'communicator'`; the start step sends
  `model.preferences.registration_type || 'communicator'`). (Verification task item (b).)
- Google signup records the adult marker only when the domain has COPPA parental consent on:
  CONFIRMED `session_controller.rb` stores `config['birth_month']`/`['birth_year']` only inside
  `if JsonApi::Json.coppa_parental_consent_enabled?` (and only on POST). `create_from_google_signup!`
  passes `link['birth_month']`/`link['birth_year']` to `User.process_new`, so with the flag off the
  birth date is nil, `adult_at_signup` is false and the account is not sent (fails closed). With the
  flag on, a birth date is required (`birthdate_required`) and the marker is recorded as for email signup.
  A Google signup also needs the product-improvement opt-in to be sent: `create_from_google_signup!`
  stores `'cookies' => product_improvement_opt_in`, and `cookies_opted_out?` refuses `false`.
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
with a recorded adult birth date and the product-improvement opt-in. Unresolved: HubSpot portal
property mismatch above.

Found in review (2026-11-23), for Scot to decide:
- The public privacy notice (`app/frontend/app/templates/privacy.hbs` and
  `app/views/shared/_privacy.html.erb`, keys `privacy_guarantee_separation` and
  `privacy_sharing_support`) says marketing applies only to the Account Administrator, not the
  Communicator, and that support and communications email is "(Admin only)". This change makes that
  untrue for adult communicators. AGENTS.md lists a promise in the public privacy notice as a
  safeguard, so it blocks merge until the wording is reconciled.
- Compliance docs (`docs/legal/SUBPROCESSORS.md`, the dated subprocessor registers) say student and
  patient accounts never reach HubSpot.
- `account_type` "Communicator Account" tells HubSpot the named person is an AAC user (a possible
  GDPR Art. 9 inference). Today it may not land, given the missing property above.
- An account sent at signup and later taken over by an organization stays in HubSpot
  (`external_email_allowed?` is read only at signup).
- A shared address (communicator and parent or SLP) is recorded only on the account whose send got a
  2xx, so deleting that account removes the other person's HubSpot contact.

Tests: adult communicator is trackable, scheduled and sent; communicator under 18, with no recorded
age, with any child-consent record, or under 16 is not; a real signup through `User.process_new`
with a communicator type records the marker. Mutation that must make them fail: remove
`communicator` from the allowlist.

## Decisions after review round 1 (Scot, 2026-11-23)

- **Privacy notice:** Scot asked for the recommended wording. `privacy_guarantee_separation` keeps
  every existing sentence and adds: an adult (18 or over) who creates their own account is their own
  Account Administrator, so we may send them a few welcome emails with resources for getting started,
  and they can unsubscribe from these at any time. `privacy_sharing_support` changes "(Admin only)" to
  "(Account Administrators only, including adults who manage their own account)". English in
  `privacy.hbs` and `en.json`; every other locale gets the `*** ` untranslated marker with the English
  text, as in `8fe425284`. "Last Updated" moves to November 23, 2026 and `User::PRIVACY_POLICY_VERSION`
  to `2026-11-23` (kept in sync by `spec/templates/signup_consent_contract_spec.rb`). The constant is
  only written into new consent records; nothing compares it, so no one is asked to re-accept.
  `app/views/shared/_privacy.html.erb` is a dead partial (its own header comment) and is not edited.
- **HubSpot label:** communicators are sent as `account_type` "Personal Account", not "Communicator
  Account", so the contact record does not say the person uses AAC. Any distinct value still lets
  HubSpot enroll and branch workflows on it.

## Research for Scot's EU email question (sources read 2026-11-23)

- ICO: routine customer service messages are not direct marketing; a message that mixes in promotion
  is treated as marketing. https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/
  and https://ico.org.uk/for-organisations/advice-for-small-organisations/direct-marketing-and-data-protection/marketing-and-data-protection-in-detail/
- Soft opt-in for marketing: details collected in a sale or negotiation, own similar products, and a
  simple opt-out offered at collection and in every message (summary of ICO guidance:
  https://www.pritchettslaw.com/our-insights/UK-Direct-Marketing-Law-2026-DUAA-PECR-ICO).
- CJEU C-184/20: data that indirectly reveals a special category (health included) is Article 9 data.
  https://www.insideprivacy.com/eu-data-protection/special-category-data-by-inference-cjeu-significantly-expands-the-scope-of-article-9-gdpr/
- HubSpot workflows branch on contact property values: https://knowledge.hubspot.com/workflows/use-if-then-branches-in-workflows
  Sensitive Data properties are Enterprise-only: https://developers.hubspot.com/docs/api-reference/latest/crm/properties/sensitive-data
- Found while checking: the signup box that gates the HubSpot send ("Help improve LingoLinq by sharing
  usage, performance, and anonymized troubleshooting data.", key `product_improvement_opt_in`) does not
  mention email. Pre-existing for supporters; a separate email choice is a follow-up for Scot and counsel (#385).
