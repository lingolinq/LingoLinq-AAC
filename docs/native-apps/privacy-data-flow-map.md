# Privacy Data-Flow Map (Phase 1 artifact)

> **NOT the source of truth for store declarations.** As of the 2026-06-30
> privacy-map reconciliation, the authoritative, code-cited source is
> [`privacy-data-flow-evidence-map.md`](./privacy-data-flow-evidence-map.md).
> This file is retained as the **plain-English team-facing narrative** -- use it
> for orientation, not for filling out the Apple/Google forms. If the two files
> disagree, the evidence map (with `file:line` citations) wins.

**Status:** DRAFT evidence map for Scot + compliance review. **Tier 2 compliance content**
(posture/narrative, no records): reviewable by any approved reviewer under the two-tier policy;
data-bearing content, if any, is Tier 1 and stays off no-BAA routes.
**Owner:** compliance-auditor / compliance-officer agents (verification) + Scot (sign-off).
**Purpose:** this is the single source the three store privacy declarations draw from, so
they come out consistent:
1. Apple **Privacy Nutrition Label** (App Store Connect)
2. Apple **`PrivacyInfo.xcprivacy`** privacy manifest (per Capacitor core + every plugin)
3. Google Play **Data Safety form**

Building it once, from the actual code, prevents three inconsistent declarations (a common
rejection cause). It also maps each data flow to the existing FERPA / HIPAA / GDPR / COPPA
obligations LingoLinq already carries; the store layer just adds enforced, public versions
of those declarations.

> **Scope note:** native packaging does NOT change what data the app collects or where it
> goes. The PiiScrubber posture, the AI-API logging, and the storage model are unchanged by
> Capacitor/Electron. The new surface the stores care about is the **device-level
> permissions** the native shell requests (camera, microphone, local storage) and the
> **third-party SDKs** bundled into the native build (Capacitor plugins, error reporting).

---

## 1. Data the app collects (server-side / account)

| Data category | What | Collected where | Stored where | Purpose | Store-form bucket |
|---------------|------|-----------------|--------------|---------|-------------------|
| Account identifiers | username (`user_name`), email, name | signup / profile | `users` table; `settings` is **encrypted at rest** via `secure_serialize :settings` (`app/models/user.rb:47`); `user_name` + `settings` versioned via PaperTrail (`user.rb:44`) | authentication, account management, supervisor linking | Contact Info; Identifiers |
| User content (AAC) | boards, buttons, vocabulary, images, sounds, recordings | in-app authoring + uploads | Postgres + **AWS S3** for large datasets via `extra_data` concern (`app/models/concerns/extra_data.rb`) | core AAC function | User Content |
| Usage / interaction logs | `LogSession` (button hits, utterances, timing), goals | in-app use | Postgres + S3 (`extra_data`) | therapy reporting, progress, sync | Usage Data; (sensitive: health/therapy context) |
| Supervisor relationships | who supervises whom | account setup | Postgres | therapy-team permission model | Identifiers / User Content |
| Audit + change history | `AuditEvent`, PaperTrail versions | server | Postgres | compliance audit trail | Diagnostics (internal) |
| Payment / subscription | subscription state, purchase events | purchase flow | Postgres; payment processing via Stripe (web) | billing | Purchases; Financial Info (processor-held) |

**Sensitivity flag:** AAC usage logs are effectively communication content for a person with
a disability and can reveal health-adjacent information. Treat `LogSession` content as the
most sensitive category in all three forms and in the FERPA/HIPAA mapping.

---

## 2. Device-level / native-permission data (the store-relevant new surface)

These map directly to the iOS usage-description strings, the Android runtime permissions,
and the privacy-manifest required-reason APIs. Evidence from the native bridge inventory.

| Permission / data | Native evidence (file:line) | Why requested | Declared in |
|-------------------|------------------------------|---------------|-------------|
| **Camera** | `capabilities.js:519-591` (CanvasCamera head/eye-gaze); `content-grabbers.js:1603-1984` (getUserMedia) | accessibility (head-tracking / eye-gaze access method); capturing board images | `NSCameraUsageDescription`; Android `CAMERA`; both privacy forms |
| **Microphone** | `content-grabbers.js:1603-2022` (getUserMedia + MediaRecorder) | recording button/board audio | `NSMicrophoneUsageDescription`; Android `RECORD_AUDIO`; both forms |
| **Local file storage** | `capabilities.js:1262-1716` (cordova.file -> `@capacitor/filesystem`); `dbman.js:520` (SQLite/IndexedDB) | offline boards/assets caching | not a tracked-data category, but note as on-device storage; required-reason file-timestamp API in `PrivacyInfo.xcprivacy` |
| **Device identifier** | `capabilities.js:244-260` (`window.device` model/UUID); `subscription.js:842` | device-id tracking, orientation/PPI calibration, IAP | Identifiers (Device ID) in both forms; ATT review if used for tracking |
| **NFC** | `capabilities.js:801-958` | optional board programming via tags | declare only if shipped; Android `NFC` |
| **Battery / brightness / silent-mode** | `capabilities.js:1799`, `1887`, `1989` | accessibility scheduling / mute-aware TTS | Diagnostics (minimal); usually not a tracked category |

**ATT (App Tracking Transparency) note:** none of the above currently appears to use the
device identifier for cross-app/advertising tracking. If that holds, the app declares **no
tracking** and avoids the ATT prompt. The compliance-auditor must confirm no bundled SDK
(error reporting, analytics, any ad SDK) performs tracking before declaring this.

---

## 3. Third-party processors / external data egress

| Recipient | What data | Code evidence | Safeguard | Form treatment |
|-----------|-----------|---------------|-----------|----------------|
| **Third-party AI model APIs** | prompt/context for AI board generation, word prediction, eval narration, content review | `lib/ai_board_generator.rb`, `lib/ai_word_predictor.rb`, `lib/ai_prediction_generator.rb`, `lib/eval_narrator.rb`, `app/models/ai_content_review.rb`; every call logged in `AiApiLog` (`app/models/ai_api_log.rb`) | **PiiScrubber** (`lib/pii_scrubber.rb`, `lib/pii_scrubbing_formatter.rb`) strips identifiable data before egress; AI features are feature-flagged/gated | Data shared with third parties; declare AI processing. Confirm no identifiable student/patient data leaves (PiiScrubber is the control). |
| **Error reporting (Sentry)** | crash/error context | `config/initializers/sentry.rb`; client `app/frontend/app/services/session.js` | **CoppaSentryScrub** strips PII, including for under-13 users | Diagnostics / Crash data. Declare; confirm scrub covers the native crash path too. |
| **AWS S3** | user content + logs (large datasets) | `app/models/concerns/extra_data.rb` | LingoLinq-controlled bucket; sub-processor | storage processor, not a "third party" disclosure if under DPA |
| **AWS SES** | email address (transactional email) | `config/initializers/amazon_ses.rb` | sub-processor | Contact Info processing |
| **Google APIs (TTS / Translate, if enabled)** | text to synthesize / translate | TTS cloud path (`vendor/speech/speech.js`); translate (verify enablement) | confirm what text is sent; AAC utterances are sensitive | declare only if enabled in the native build |
| **Stripe (web only)** | payment + purchase identifiers | `subscription.js:810-1011`; `lib/purchasing.rb` | processor-held card data; app does not store PAN | Purchases / Financial Info (web app only) |

**v1 native decision (2026-06-30): NO in-app purchases -- intent, not yet code state.** v1
native builds are intended to declare **no "Purchases"** data type and ship **no StoreKit /
Google Play Billing / Stripe.js** surface; schools/hospitals pay by B2B invoice (outside store
payment rules) and there is no in-app subscribe button. Individual in-app subscriptions are
deferred to a **v1.1 fast-follow**; only then do the Purchases declaration and a store-billing
processor re-enter the forms. (This resolves the earlier "native IAP via StoreKit/Play Billing"
watch item, which assumed in-app subscriptions were in v1.)

**BLOCKING PRECONDITION (added 2026-07-01, adversary review of PR #509):** the legacy
`window.store` / StoreKit / Play Billing plumbing is **not currently gated off** -- it is
live and auto-fires. `subscription.js:989-997` runs `store.register(...)` for **any**
`bundle_id` other than the literal string `"com.mylingolinq.lingolinq"`. Because a "start
fresh" v1 build uses a new bundle ID by definition, the packaged app will register StoreKit
/ Play Billing products at launch under current code -- contradicting the "no Purchases"
declaration above. `lib/purchasing.rb:747` and `app/models/concerns/subscription.rb:353`
show receipt verification is also still live, keyed to the legacy bundle IDs. **Do not file
the "no Purchases" declaration on any store form until `subscription.js`'s `store.register`
call is verified gated off (or removed) for the actual v1 bundle ID in the packaged build.**
This is a code task, not yet done -- track it alongside the native-bridge-inventory.md
revenue-path row before store submission.

---

## 4. COPPA / child-data specifics (under-13)

- LingoLinq serves under-13 AAC users; COPPA applies. The store layer enforces this via
  Google's **target-audience declaration + Families policy** and a **consent gate before
  account creation** for declared under-13 users.
- **No advertising identifiers from child users**; no ad SDKs in child-directed flows.
- The **CoppaSentryScrub** already extends PII scrubbing to under-13 users on the error path.
- Category choice: target **Education**, not the Kids category, and handle COPPA at the
  account/data layer via the supervisor model (Kids category triggers a stricter rule set).
- Confirm the consent gate exists in the native account-creation flow (it is part of the
  active COPPA "AI Data-Sharing VPC" project in the primary checkout; coordinate so the
  native apps inherit it rather than duplicating it).

---

## 5. Account deletion (store requirement)

Both stores require in-app account deletion (Google also needs a web URL for uninstalled
users). The requirement is "delete the account and associated data," NOT absolute
hard-delete: retention for disclosed, legitimate reasons (security, legal/regulatory) is
permitted if stated in the privacy policy. Because FERPA/HIPAA impose retention obligations,
the flow **deletes by default and documents what is legally retained and for how long**, and
genuinely deletes (not merely deactivates) anything not covered by a disclosed retention
reason. Verify the in-app deletion entry point and the web deletion URL both exist for the
native builds.

---

## 6. The three store declarations: build checklist

- [ ] **Apple Privacy Nutrition Label:** declare Contact Info, Identifiers, User Content,
      Usage Data, Diagnostics; **NOT Purchases** (v1 has no in-app purchases -- 2026-06-30
      decision; add Purchases only in v1.1 when subscriptions ship). Map "Used to Track You" =
      none (pending ATT confirmation in section 2).
- [ ] **`PrivacyInfo.xcprivacy`:** required-reason API declarations for Capacitor core and
      EVERY plugin (file timestamp, user defaults, etc.); blocks upload if missing.
- [ ] **Google Data Safety form:** email, user content (boards), usage/session logs,
      diagnostics, camera, microphone, device ID, and any third-party AI-API data flow;
      declare data-handling, encryption-in-transit, and deletion request mechanism.
- [ ] All three must agree with each other and with the public privacy policy.

---

## 7. Open items for the compliance-auditor to verify against live code

1. Confirm **no bundled SDK performs cross-app/advertising tracking** (lets us declare no
   ATT tracking).
2. Confirm the **PiiScrubber covers every AI egress path** used by the native build, and
   that no AI feature is reachable on-device without the scrub.
3. Confirm **CoppaSentryScrub covers the native crash path** (Capacitor/Electron), not just
   the web client.
4. Enumerate exactly which **Google APIs (TTS/Translate)** are enabled in the native build
   and what text they receive (AAC utterances are sensitive).
5. Confirm the **COPPA consent gate** is present in the native account-creation flow.
6. Confirm **in-app + web-URL account deletion** exist and the retention disclosures match
   the privacy policy.
7. **v1: no IAP processor to declare** -- native builds ship no StoreKit / Play Billing /
   Stripe.js surface and declare no Purchases (2026-06-30 decision). Revisit this only for the
   v1.1 subscription fast-follow, when a store-billing processor declaration is added.

---

*Evidence cited inline (file:line). This map reflects the runtime data posture as of the
`scot/feat/native-apps` branch; the compliance-auditor must re-verify each declaration
against live code before any store form is submitted. Tier 2 posture content per LingoLinq
compliance rules (PII-free; data-bearing content, if any, is Tier 1 and stays off no-BAA routes).*
