# Voice transcription skips the parental-consent gates every other AI call site checks

Date: 2026-09-18. Related: #981 (MediaConvert go-live), finding LL-1eb9a2435b (accepted-risk,
"per-flow COPPA-consent gate ... deferred to before real tenant onboarding"), SUBPROCESSORS.md
row 18. Branch: `fix/scot-transcription-parental-consent-gate-5d62a7f8`.

## Why now

`ButtonSound#schedule_transcription` uploads a user's raw voice recording (the WAV
`secondary_output`) to Google Cloud Speech-to-Text. The flow has been dormant since Elastic
Transcoder ended (no transcode, so no WAV). The MediaConvert go-live brings it back as soon as
the completion handler works. This gate has to be in place before that reaches production.

## Fact sheet

- **(a) Where is the decision read?** CONFIRMED. One method, `ButtonSound#schedule_transcription`
  (`app/models/button_sound.rb`). Both the enqueue (`frd=false`, from `after_save
  :schedule_transcription`) and the run (`frd=true`, from the worker) enter the same method and
  pass the same guard block before the `if frd` branch, so a gate placed beside the existing org
  gate precedes the WAV download (`Typhoeus.get`), the Google POST, and the enqueue on every path.
  No other code calls `speech.googleapis.com` (`grep -rn "speech.googleapis" app lib` hits only
  this method).
- **(b) What shapes can the user hold?** CONFIRMED.
  - `user` nil: both `FeatureFlags` gates return false (`return false unless user`) and the org
    gate returns true, so all three gates FAIL OPEN when the owner cannot be resolved. This change
    does not alter that. It is a registered gap, not a neutral property: counsel-review gap #10
    ("COPPA and EU AI gates pass when the subject user is not resolvable ... should fail closed",
    `docs/legal/2026-08-30_minimum-necessary-privacy-retention-ai-use-counsel-review.md`), and
    `lib/flusher.rb` notes ButtonSound is not cascaded from User, so an orphaned row is reachable.
    Not fixed here: the existing `schedule_transcription` specs build sounds with no user and
    expect the Google call, so failing closed is its own behaviour change.
  - Under-13 with `settings['coppa']` pending, revoked or declined:
    `User#coppa_parental_consent_blocks_access?` is true, so `coppa_blocks_ai_for?` blocks.
  - Under-13 with `parent_consent_granted_at` present: not blocked.
  - `settings['registration']['eu_under_16']` true without an active
    `settings['eu_ai_parental_consent']`: `eu_under16_blocks_ai_for?` blocks.
  - Everyone else: not blocked.
  - **The gate's subject is the sound's OWNER, and the owner is whoever recorded it.**
    `Api::SoundsController#create` owns the sound by `sound[user_id]` or else `@api_user`. An adult
    (parent, therapist) logged in as themselves who records a child's voice owns that recording,
    so all three gates, including the org off-switch, evaluate the adult. Pre-existing, and
    owner-scoped consent cannot fix it. Conversely a supervisor acting as a blocked child is
    blocked. This PR narrows the gap for recordings made in the child's own account only.
  - **Rollback is `git revert` of the two lines, or the per-org `external_ai_processing` toggle.**
    Do NOT use `COPPA_AI_HARD_GATE=false` / `EU_AI_PARENTAL_HARD_GATE=false` for a transcription
    problem: those env switches are global and would turn the parental-consent hard gate off for
    word prediction, word suggestions, board generation and evaluation narration as well.
- **(c) Cross-file claims.** CONFIRMED: `FeatureFlags.coppa_blocks_ai_for?` and
  `FeatureFlags.eu_under16_blocks_ai_for?` exist in `lib/feature_flags.rb`; the same pair is
  checked, in this order, in `lib/ai_word_predictor.rb` (`predict`), and
  `ai_feature_enabled_for?` combines them. Before this change `schedule_transcription` checked
  only `Organization.external_ai_processing_allowed_for_user?`, whose own comment says
  "Unmanaged users are allowed (account-level COPPA gate covers minors)". That account-level gate
  was never consulted here: the red tests prove the WAV was downloaded for a pending-consent
  under-13 user.

## Red tests (written before the fix)

`spec/models/button_sound_spec.rb`, `describe "schedule_transcription"`: five examples. Three
blocking cases failed before the fix (`Typhoeus.get` received for a COPPA-pending user and for an
EU under-16 user; the job was enqueued for a COPPA-pending user). Two controls passed before and
after (consent granted means transcription is scheduled), so the gate cannot pass by blocking
everyone.

## Candidate fixes

1. **Add the two `FeatureFlags` hard gates beside the org gate** (chosen). Two lines, the exact
   pair and order used by the other AI call sites.
2. **Call `FeatureFlags.ai_feature_enabled_for?(feature, user)`.** Rejected: transcription is not in
   `AI_FEATURES`, so it would return false for everyone and disable the feature; adding a feature
   key also brings the per-user AI preference and rollout flag into play, a larger behaviour
   change than the gap warrants.
3. **Fold the age gates into `Organization.external_ai_processing_allowed_for_user?`.** Rejected: it
   would tangle an org opt-out with an age/consent rule, and that method's skip is audit-logged as
   an ORG decision, which would mislabel a parental-consent block.

## Risks and unresolved questions

- **A blocked sound is not transcribed later by itself.** The hook runs on save. When a parent
  later consents, existing sounds are not re-saved, so they stay untranscribed unless edited.
  Same property the org gate already has. Acceptable for now; a backfill on consent grant is a
  follow-up if wanted.
- **The WAV stays in S3 while blocked.** Normally the WAV is deleted right after a successful
  transcription. For a blocked user it remains as `settings['secondary_output']`. It IS reachable
  by deletion (`remove_derivative_remote_data` sweeps `secondary_output.filename`), so erasure
  works; it is a retention point, not an orphan. Same as the org-gate path today.
- **No audit row for a consent-gate skip.** The org gate logs `external_ai_processing_skipped`;
  this gate returns silently, like `AiWordPredictor`. UNRESOLVED whether a skip audit row is
  wanted; not added, to avoid mislabelling it as an org decision.
- **The consent this gate relies on does not yet mention Google or voice.** The EU under-16 gate
  passes on `settings['eu_ai_parental_consent']`, granted against disclosure v1, which names AWS
  and Anthropic for word prediction only. Until the disclosure is amended and `CURRENT_VERSION`
  bumped, this gate makes "transcription waits for parental consent" mechanically true and
  substantively incomplete. **No compliance document may describe voice transcription as
  "consented" on the strength of this PR.**
  `docs/legal/2026-09-14_compliance-program-overview.md` ("not gated by individual consent
  today") is left unchanged for that reason.
- **This PR does not close LL-1eb9a2435b.** That finding's own note names gating transcription
  behind the org `disable_ai_features` opt-out as the thing to revisit. Transcription still reads
  only `external_ai_processing`, so an org that sets `disable_ai_features` stops every Bedrock
  feature while voice transcription keeps running.
- **The user-facing "Allow AI features" opt-out still does not reach transcription.**
  `FeatureFlags.user_pref_allows_ai?` is enforced only through `ai_feature_enabled_for?`, which
  this method does not call. A family that unchecks it still has recordings transcribed. This is
  the control a family would actually rely on; it is a follow-up decision, not an aside.
- Counsel-review gap #9 lists four missing controls on this flow (COPPA, EU, Article 50
  disclosure, user preference) plus no `AiApiLog` record. This PR closes the first two only.
- **New side effects for a blocked account.** (1) `app/frontend/app/models/sound.js`
  `check_transcription` polls the sound until it has a transcription or is 2 hours old; a blocked
  sound never gets one, so the client polls the whole ladder (on the order of a hundred requests
  per recording) and shows "pending" throughout. A terminal client-visible signal is the fix, set
  on the write path (a `save` inside this `after_save` branch would recurse). (2)
  `ButtonSound.generate_zip_for` prefers `secondary_url` when a WAV exists, so a blocked user's
  message-bank export carries WAVs instead of MP3s.
- Out of scope, worth its own finding: `webkitSpeechRecognition` in the frontend (focus words, new
  board naming) streams microphone audio to the browser vendor's speech service with no gate and
  no register row.
- **Disclosure text is a separate change.** The parental consent disclosure (v1,
  `lib/lingo_linq/ai_consent_disclosures.rb` and its view) names AWS and Anthropic for word
  prediction only. It should also name Google Speech-to-Text and voice recordings. That is legal
  copy plus a `CURRENT_VERSION` bump that forces re-consent, so it needs Scot's wording approval
  and its own PR.
- Adults: no click-through is added. Covered by the Google Cloud CDPA/BAA (row 18), the privacy
  policy's existing statement that Google handles speech transcription, and the org off-switch.
  Whether an EU adult's voice needs explicit consent (GDPR Art. 9) is a counsel question, not
  addressed here.

## Mutations that must turn the tests red

Falsified 2026-09-18 from a saved copy: deleting the COPPA gate line fails the two COPPA specs;
deleting the EU gate line fails the EU spec; restored file byte-identical (`cmp`); whole file
green, 42 examples, 0 failures, 1 pending.

Process note: the two-line edit was applied before the proposal review rather than after it.
Nothing was committed until the review finished.
