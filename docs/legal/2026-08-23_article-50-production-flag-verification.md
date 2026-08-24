# Article 50(1) Disclosure — Production Feature-Flag Verification

**Date:** 2026-08-23
**Owner:** Scot Wahlquist, CEO
**Status:** DRAFT - awaiting attestation. Evidence record; asserts no posture of its own beyond
the observations below.
**Trigger:** Three compliance successors merged in PR #846 state that `article_50_disclosure` is
AVAILABLE-only at `64cdccba1` with runtime enablement UNVERIFIED, and instruct that production be
read before attestation. This record is that read.
**Related:** `docs/legal/2026-08-22_compliance-posture-report.md`,
`docs/legal/2026-08-22_compliance-program.md`,
`docs/legal/2026-08-22_compliance-status-snapshot.md`,
`docs/legal/2026-08-17_ai-data-flow-classification.md` (ATTESTED 2026-08-19; its 63-row
observation is corroborated here), `lib/system_feature_settings.rb`, `lib/feature_flags.rb`.

---

## 1. What was run, and how

A read-only `rails runner` script executed against production through the audited
`lingolinq-migrate` Cloud Run job, using execution-scoped `--args` / `--update-env-vars`
overrides only. The job definition was not modified. **No business or user data was created,
modified, or deleted.** The runner is not, however, side-effect free: it writes one `AuditEvent`
row per session, which is application data. See "This verification wrote to production" below.

| Field | Value |
|---|---|
| Probe timestamps (UTC) | `2026-08-23T21:04:12Z` (layers 1-4); `2026-08-23T21:08:00Z` (layer 5) |
| Environment | `RAILS_ENV=production`, GCP project `lingolinq-prod` |
| Image (tag) | `web:73a8f63396af78328a76045a7c2e08be6a3cc47c` |
| Image (digest — the actual byte pin) | `sha256:1abfdc731108a0e13116c3e5bd55558dc9fa83b4b90781a5d77358ee20e8c73d` |
| Serving revision compared against | `lingolinq-web-00024-yij`, 100% of traffic and also `latestReadyRevision`; its container image resolves to the SAME digest above (`gcloud run revisions describe`, not `services describe`, so this is the traffic-serving revision and not merely the latest template) |
| Bridge to the pinned commit | `lib/feature_flags.rb` and `lib/system_feature_settings.rb` are **byte-identical** at `64cdccba1` (the commit this record's sibling documents pin) and at `73a8f633` (the probed image's commit): sha256 `8854f05a5b3e4453` and `c73e0cb987ca51c2` respectively. The constants read during the probe therefore correspond to the pinned derivation. |
| Executions | `lingolinq-migrate-jqpxb`, `lingolinq-migrate-4ss8l` |
| Audit attribution | attribution label `scot-art50-flag-verification-2026-08-23`, supplied via the `USER_KEY` environment variable |

**This verification wrote to production.** The audited runner records one `AuditEvent` per
session; six exist across the probe series, all stamped with the attribution label above. That is
the access control operating as designed, and it is disclosed here rather than omitted.

### 1.1 Population scope — READ THIS BEFORE ANY FIGURE BELOW

**All 34 accounts in production are test/QA accounts. There are no real users.** (Confirmed by
Scot Wahlquist, 2026-08-24; consistent with the pre-tenant posture recorded at cutover.) Every
per-account figure in this record — "34 of 34", "29 of 34", "5 of 34" — describes that synthetic
population. Two consequences, in opposite directions:

- **It strengthens the exposure conclusion.** No real person has encountered an undisclosed AI
  interaction, because no real person has used the product. That is a stronger statement than the
  `AiApiLog` evidence alone could support (§2.5, and the under-recording caveat there).
- **It limits what the gating figures demonstrate.** "29 of 34 gated" shows the mechanism
  *resolves correctly*; it is not evidence about real-world behaviour, load, or jurisdiction
  distribution. In particular the `:unknown`-for-everyone result in §2.6 is expected of seeded
  accounts and says nothing about how real users will classify.

Read every figure below as **configuration verified against a synthetic population**, not as
observed user impact.

## 2. Observations

### 2.1 Global default — ENABLED

`Setting.get('default_enabled_features')` returns a 52-element array **containing**
`article_50_disclosure`.

| Read | Result |
|---|---|
| `SystemFeatureSettings.default_enabled_features` contains the flag | **true** |
| `FeatureFlags::ENABLED_FRONTEND_FEATURES` contains the flag | false |
| `FeatureFlags::AVAILABLE_FRONTEND_FEATURES` contains the flag | true |

The DB Setting diverges from the code constant, and the DB wins.

### 2.2 Organization overrides — none exist, and no org is EU-stamped

| Read | Result |
|---|---|
| Organizations in production | **2** |
| Jurisdiction histogram (`Organization#jurisdiction`) | `{"": 2}` |
| Organizations resolving `eu_jurisdiction?` true | **0** |
| Organizations carrying any `settings['enabled_features']` | **0** |

No org-level override of this flag exists in either direction. The EU-facing organization set
specified by the successors' verification instruction is **empty**, so an org-scoped EU read could
not be performed as written.

### 2.3 Beta / canary cohorts — none configured

| Read | Result |
|---|---|
| `Setting` row `canary_enabled_features` exists | **false** |
| `Setting` row `beta_opt_in_features` exists | **false** |
| `SystemFeatureSettings.canary_enabled_features` | 73 elements, equal to `AVAILABLE_FRONTEND_FEATURES` |
| `SystemFeatureSettings.beta_opt_in_features` | identical to the canary list |

Both accessors fall back to a code constant when their `Setting` is unset. The flag appears in
those returned lists **because it is AVAILABLE, not because any cohort enables it**. Reading cohort
membership from those lists would be a false positive.

Precisely: beta falls back to the full AVAILABLE list, and canary falls back to
`AVAILABLE_FRONTEND_FEATURES - DISABLED_CANARY_FEATURES` (`lib/system_feature_settings.rb:29`). The
73 = 73 equality and the beta/canary identity above hold **only because
`DISABLED_CANARY_FEATURES` is currently empty** (`lib/feature_flags.rb:93`); both go silently false
the first time anything is added to that denylist.

### 2.4 Per-user resolution — true (confirmation only)

Resolved through the real path, `FeatureFlags.feature_enabled_for?('article_50_disclosure', user)`,
the same call the server backstop makes at `app/controllers/application_controller.rb:419-422`.

| User (global_id) | Managing org | `feature_enabled_for?` | Effective list contains flag |
|---|---|---|---|
| `1_1` | `1_1` | **true** | true |
| `1_2` | (none) | **true** | true |
| `1_3` | (none) | **true** | true |

**All users were then evaluated, not a sample** (probe `lingolinq-migrate-wxt9x`,
`2026-08-23T23:14:30Z`):

| Read | Result |
|---|---|
| Users in production | **34** |
| `FeatureFlags.feature_enabled_for?` resolving **true** | **34 of 34** |
| resolving false | **0** |
| probe errors | **0** |

Because every user in production was evaluated, this layer is a **determination for the current
population**, not a sample. It remains a point-in-time read: it says nothing about users created
after `2026-08-23T23:14:30Z`.

**EU scope, measured at the user level.** Organization jurisdiction is not the only EU signal:
`LingoLinq::Jurisdiction.country_code` also reads a user's own `settings` country, region, and
locale (`app/models/lingo_linq/jurisdiction.rb`). Evaluating that primitive against every user:

| `LingoLinq::Jurisdiction.country_code(user)` | Users |
|---|---|
| unresolved (`nil` — no country, region, or region-bearing locale) | **29** |
| `US` | **5** |
| any EU-27 code | **0** |

`LingoLinq::Jurisdiction.eu?` is true for **0 of 34 users**. Combined with 2.2 (0 EU-stamped
orgs), **production currently contains no EU-jurisdiction subject by either signal.** Note the
primitive's documented ambiguity policy: a bare language subtag resolves to `nil`, not to a
country, so the 29 unresolved users are *unknown*, not affirmatively non-EU.

### 2.6 What "enabled" means operationally — the gate is UNIVERSAL, not an EU subset

**This is the operationally important layer, and it is not what the organization histogram in 2.2
suggests.** With the flag on, `article_50_disclosure_missing?`
(`app/controllers/application_controller.rb:419-422`) is armed at all five AI ingresses:
`app/controllers/api/boards_controller.rb:584`, `api/eval_sessions_controller.rb:84`,
`api/integrations_controller.rb:104`, `api/word_suggestions_controller.rb:28`,
`api/words_controller.rb:63`.

Its jurisdiction leg is **`EuJurisdiction.disclosure_required?`**, defined as
`status(user) != :non_eu` (`lib/eu_jurisdiction.rb:57-59`) — deliberately **fail-safe OPEN**: only
an authoritative `:non_eu` suppresses the disclosure, so `:eu` **and `:unknown` both require it**.

That resolver is **not** `Organization#eu_jurisdiction?` and **not** `LingoLinq::Jurisdiction.eu?`.
Measured against the resolver the gate actually consults (probe `lingolinq-migrate-stnwz`,
`2026-08-23T23:23:41Z`):

| Read | Result |
|---|---|
| `EuJurisdiction.status` = `:unknown` | **34 of 34 users** |
| `EuJurisdiction.status` = `:eu` or `:non_eu` | **0** |
| `EuJurisdiction.disclosure_required?` true | **34 of 34** |
| `User#article_50_disclosure_shown?` true | **5 of 34** |
| **Currently gated (flag ON, disclosure required, not yet acknowledged)** | **29 of 34** |

**The Article 50 disclosure surface is maximal in production, not inert** (across the test-account population defined in §1.1; there are no real users). Because no user carries
an authoritative `:non_eu` status, the disclosure is required for every user, and 29 who have not
acknowledged it meet the gate on their next AI interaction. This is the control behaving as
designed — the fail-safe is doing its job — but any reading of this record that concludes "the flag
is on but the EU surface matches nothing" is **wrong**, and Section 2.2's organization histogram
must not be read that way.

### 2.5 Enablement date — NOT RECOVERABLE

| Read | Result |
|---|---|
| `Setting` row | id **2**, key `default_enabled_features` |
| `created_at` | **2026-08-04T07:19:11Z** |
| `updated_at` | **2026-08-13T00:03:56Z** |
| `Setting.paper_trail_options` responds | **false** |
| `PaperTrail::Version.where(item_type: 'Setting').count` | **0** |
| Version rows for row id 2 | **0** |

`Setting.set` performs `find_or_initialize_by(:key)` then `save`, overwriting the value in place.
**No version history exists for this table.** The row was created 2026-08-04 and rewritten
2026-08-13; nothing in production records which features the list held at either write.

Therefore the claim "enabled since 2026-08-04" is **not supportable**. The row's creation date is
consistent with it and is not evidence of it: the flag could equally have entered the list in the
2026-08-13 write. The defensible bound is stated in Section 3.

## 3. Determination

**`article_50_disclosure` is ENABLED in production as of `2026-08-23T21:04:12Z`**, by virtue of the
`default_enabled_features` DB Setting, which supersedes the code default. It resolves **true**
through the application path for **all 34 of 34 accounts in production**, not a sample — all of
them test/QA accounts, per §1.1. No org,
beta, or canary layer modifies this. No EU-jurisdiction subject exists in production by either the
organization or the user-level signal (0 of 2 orgs, 0 of 34 users), so the flag's EU-facing
behaviour is verified as *configuration*, not as observed EU-user traffic.

**Enabled since: unverifiable.** Bounded only as: present in the list at `2026-08-23T21:04:12Z`;
containing row created `2026-08-04T07:19:11Z`, last written `2026-08-13T00:03:56Z`.

This **corroborates** the attested observation at
`docs/legal/2026-08-17_ai-data-flow-classification.md:132` — `article_50_disclosure_shown` true on
all 63 post-deploy `AiApiLog` rows — and **resolves the contradiction against the repo reading**.
The "AVAILABLE-only" statements were a code default mistaken for runtime state. Carry that record's
own scope caveat forward: those 63 rows come from **2 distinct accounts**, not 63 users
(`docs/legal/2026-08-17_ai-data-flow-classification.md:129`), consistent with internal pre-tenant
testing.

## 4. Open items this verification surfaced

1. **No organization carries a jurisdiction stamp** (2.2), and no user resolves to an
   authoritative jurisdiction either (2.6: `:unknown` for 34 of 34). **This does NOT make the
   Article 50 surface inert** — see 2.6, where the fail-safe resolver makes the disclosure required
   for all 34. What it does affect is the OPPOSITE-direction mechanism: the `AiApiLog.jurisdiction`
   retention stamp writes `'EU'` only for a CONFIRMED `:eu` user, so with zero confirmed EU users it
   stamps nothing and `purge_old_eu_logs!` matches nothing. `Organization#eu_jurisdiction?` itself
   has one consumer, the GDPR Art. 8 under-16 gate at `app/models/user.rb:560`, which carries a
   documented fallback to `registration_country` / `LingoLinq::Jurisdiction.eu?` — the branch
   running today. The real residual is school-created EU users with no registration country falling
   through. Pre-existing; not caused by this flag.
2. **`Setting` has no change history** (2.5). Any future question of the form "when did this
   control change" is unanswerable for every `Setting`-backed control, not only this one.
3. **Code and DB disagree on the default feature set.** A reader of `lib/feature_flags.rb` alone
   reaches the wrong conclusion about production. That is what produced the defect corrected here.
4. **Runtime-code comments shipping in the live image are falsified by this record.**
   `app/controllers/application_controller.rb:396-397` states that `article_50_disclosure` "is
   AVAILABLE-only ... so `feature_enabled_for?` returns false and this guard is inert until the flag
   is enabled", and `app/controllers/api/boards_controller.rb:580` repeats it ("the guard is inert
   until the flag is enabled") three lines after naming LL-6723438462 by id. The guard is not inert;
   per 2.6 it is live for 29 of 34 users. Same code-default-mistaken-for-runtime-state class as item
   3. Neither is corrected here (runtime code is out of scope for a compliance record); both are
   listed so the carriers are declared rather than merely unfixed.
6. **An ATTESTED compliance document carries the same falsified claim, and cannot be edited.**
   `docs/legal/AI_GOVERNANCE_MEMO.md` (DOC-39f37f8200, attested by Scot Wahlquist 2026-08-04, with a
   pinned `attestedContentHash`) states at `:261` that the modal is "**built and staged, gated OFF**,
   not yet enabled for any user" and at `:426-427` that it is "gated OFF ... (not enabled for any
   user); the modal is therefore shown to no" one. Both are now false. Because the document is
   attested it is frozen: correcting it requires a Path A successor and Scot's re-attestation, not an
   in-place edit. **This is the highest-value open item in this list** -- it is a customer-facing
   governance memo asserting that no user sees the disclosure, while production shows it required for
   34 of 34 and gated for 29.
5. **Two human-owned fields in the findings SSOT carry the same falsified claim, and they
   propagate.** `audit-reports/FINDINGS.json` finding LL-6723438462 states in `verifierNote` that
   the flag "remains AVAILABLE-only ... so this is still latent-until-enabled", and in `notes` that
   this makes "all instances of the guard inert today". The second is load-bearing and is disproved
   by 2.6. These are Scot-owned register fields — **deliberately NOT edited here** — but they are
   inputs to `scripts/render-domain-reports.rb:143` and
   `scripts/compliance-findings-notion-sync.rb:76`, so the next render republishes them. Amendment
   and the timing of those renders are Scot's call.

## Attestation

| Field | Value |
|---|---|
| Prepared by | Claude Code, 2026-08-23, from two audited production reads |
| Reviewed by | NOT YET REVIEWED |
| Attested by | NOT YET ATTESTED - awaiting Scot Wahlquist, CEO |
| Attestation date | pending |

**Observation vs derivation.** Every figure in the Section 2 tables is a direct read. Four
statements elsewhere in this record are DERIVED and are labelled as such: the image/commit
comparison above; "equal to `AVAILABLE_FRONTEND_FEATURES`" (2.3, a set comparison, and see the
`DISABLED_CANARY_FEATURES` caveat there); "No org, beta, or canary layer modifies this" (Section 3,
an inference from 2.2 and 2.3); and the count of `AuditEvent` rows this probe created, which was
QUERIED, not assumed — `AuditEvent.count` read 245 before the probe series and 251 after, i.e. the
six runner sessions recorded in this record.

_The raw probe output is reproduced in the Appendix. It is NOT reproducible by re-running the
reads: `Setting.get('default_enabled_features')` is a live DB read whose value can change at any
moment, so a future re-run attests the future, not 2026-08-23. The Cloud Run execution logs are the
only other primary artifact and age out of the GCP `_Default` log bucket long before this record's
7-year `audit-evidence` retention, which is why the values are inlined below rather than cited._

---

## Appendix — raw probe output

Verbatim stdout of each probe, inlined because the Cloud Run execution logs age out well
inside this record's 7-year retention. No PII: user identifiers are `global_id` values only.

### `lingolinq-migrate-jqpxb` — layers 1-4

```json
{
  "probe_ts_utc": "2026-08-23T21:04:12Z",
  "rails_env": "production",
  "feature": "article_50_disclosure",
  "L1_default_raw": [
    "subscriptions",
    "assessments",
    "custom_sidebar",
    "snapshots",
    "video_recording",
    "goals",
    "modeling",
    "geo_sidebar",
    "edit_before_copying",
    "core_reports",
    "lessonpix",
    "translation",
    "fast_render",
    "audio_recordings",
    "app_connections",
    "enable_all_buttons",
    "badge_progress",
    "premium_symbols",
    "board_levels",
    "native_keyboard",
    "app_store_purchases",
    "find_multiple_buttons",
    "new_speak_menu",
    "swipe_pages",
    "inflections_overlay",
    "ios_head_tracking",
    "emergency_boards",
    "evaluations",
    "vertical_ios_head_tracking",
    "remote_modeling",
    "auto_inflections",
    "focus_word_highlighting",
    "skin_tones",
    "lessons",
    "profiles",
    "other_menu",
    "ai_board_generation",
    "google_sso",
    "quick_screen_eval",
    "multi_user_board_import",
    "customize_menu",
    "home_tour",
    "portrait_orientation_overlay",
    "background_board_prefetch",
    "signup_default_library_boards",
    "english_first_board_generation",
    "dashboard_drag_layout",
    "edit_sidebar",
    "sentence_bar_editing",
    "text_symbol_fallback",
    "article_50_disclosure",
    "ai_word_prediction"
  ],
  "L1_default_effective": [
    "subscriptions",
    "assessments",
    "custom_sidebar",
    "snapshots",
    "video_recording",
    "goals",
    "modeling",
    "geo_sidebar",
    "edit_before_copying",
    "core_reports",
    "lessonpix",
    "translation",
    "fast_render",
    "audio_recordings",
    "app_connections",
    "enable_all_buttons",
    "badge_progress",
    "premium_symbols",
    "board_levels",
    "native_keyboard",
    "app_store_purchases",
    "find_multiple_buttons",
    "new_speak_menu",
    "swipe_pages",
    "inflections_overlay",
    "ios_head_tracking",
    "emergency_boards",
    "evaluations",
    "vertical_ios_head_tracking",
    "remote_modeling",
    "auto_inflections",
    "focus_word_highlighting",
    "skin_tones",
    "lessons",
    "profiles",
    "other_menu",
    "ai_board_generation",
    "google_sso",
    "quick_screen_eval",
    "multi_user_board_import",
    "customize_menu",
    "home_tour",
    "portrait_orientation_overlay",
    "background_board_prefetch",
    "signup_default_library_boards",
    "english_first_board_generation",
    "dashboard_drag_layout",
    "edit_sidebar",
    "sentence_bar_editing",
    "text_symbol_fallback",
    "article_50_disclosure",
    "ai_word_prediction"
  ],
  "L1_present": true,
  "L1_in_code_ENABLED": false,
  "L1_in_code_AVAILABLE": true,
  "L5_rows": {
    "default_enabled_features": {
      "exists": true,
      "created_at": "2026-08-04T07:19:11Z",
      "updated_at": "2026-08-13T00:03:56Z"
    },
    "canary_enabled_features": {
      "exists": false
    },
    "beta_opt_in_features": {
      "exists": false
    }
  },
  "L5_paper_trail_on_setting": true,
  "L3_canary_raw": null,
  "L3_canary_effective": [
    "subscriptions",
    "assessments",
    "custom_sidebar",
    "canvas_render",
    "snapshots",
    "enable_all_buttons",
    "video_recording",
    "goals",
    "app_connections",
    "translation",
    "geo_sidebar",
    "modeling",
    "edit_before_copying",
    "core_reports",
    "lessonpix",
    "audio_recordings",
    "fast_render",
    "badge_progress",
    "board_levels",
    "premium_symbols",
    "find_multiple_buttons",
    "new_speak_menu",
    "native_keyboard",
    "inflections_overlay",
    "app_store_purchases",
    "emergency_boards",
    "evaluations",
    "swipe_pages",
    "app_store_monthly_purchases",
    "ios_head_tracking",
    "vertical_ios_head_tracking",
    "auto_inflections",
    "remote_modeling",
    "focus_word_highlighting",
    "profiles",
    "skin_tones",
    "lessons",
    "other_menu",
    "shallow_clones",
    "ai_board_generation",
    "ai_word_prediction",
    "ai_board_suggestions",
    "ai_symbol_search",
    "ai_compliance_logging",
    "supervisor_consent_flow",
    "product_telemetry",
    "telemetry_admin_panel",
    "tarheel_reader",
    "auth_spa_transition",
    "google_sso",
    "quick_screen_eval",
    "comprehensive_eval_ai",
    "multi_user_board_import",
    "customize_menu",
    "home_tour",
    "paste_html_import",
    "catalog_board_prefetch",
    "background_board_prefetch",
    "portrait_orientation_overlay",
    "signup_default_library_boards",
    "english_first_board_generation",
    "signup_spanish_library_boards",
    "eval_single_library",
    "dashboard_drag_layout",
    "boards_page_owner_dedup",
    "edit_sidebar",
    "sentence_bar_editing",
    "text_symbol_fallback",
    "session_resume",
    "supervising_context_banner",
    "eu_consent_age",
    "article_50_disclosure",
    "compliance_workflow_kernel"
  ],
  "L3_canary_has_F": true,
  "L3_beta_raw": null,
  "L3_beta_effective": [
    "subscriptions",
    "assessments",
    "custom_sidebar",
    "canvas_render",
    "snapshots",
    "enable_all_buttons",
    "video_recording",
    "goals",
    "app_connections",
    "translation",
    "geo_sidebar",
    "modeling",
    "edit_before_copying",
    "core_reports",
    "lessonpix",
    "audio_recordings",
    "fast_render",
    "badge_progress",
    "board_levels",
    "premium_symbols",
    "find_multiple_buttons",
    "new_speak_menu",
    "native_keyboard",
    "inflections_overlay",
    "app_store_purchases",
    "emergency_boards",
    "evaluations",
    "swipe_pages",
    "app_store_monthly_purchases",
    "ios_head_tracking",
    "vertical_ios_head_tracking",
    "auto_inflections",
    "remote_modeling",
    "focus_word_highlighting",
    "profiles",
    "skin_tones",
    "lessons",
    "other_menu",
    "shallow_clones",
    "ai_board_generation",
    "ai_word_prediction",
    "ai_board_suggestions",
    "ai_symbol_search",
    "ai_compliance_logging",
    "supervisor_consent_flow",
    "product_telemetry",
    "telemetry_admin_panel",
    "tarheel_reader",
    "auth_spa_transition",
    "google_sso",
    "quick_screen_eval",
    "comprehensive_eval_ai",
    "multi_user_board_import",
    "customize_menu",
    "home_tour",
    "paste_html_import",
    "catalog_board_prefetch",
    "background_board_prefetch",
    "portrait_orientation_overlay",
    "signup_default_library_boards",
    "english_first_board_generation",
    "signup_spanish_library_boards",
    "eval_single_library",
    "dashboard_drag_layout",
    "boards_page_owner_dedup",
    "edit_sidebar",
    "sentence_bar_editing",
    "text_symbol_fallback",
    "session_resume",
    "supervising_context_banner",
    "eu_consent_age",
    "article_50_disclosure",
    "compliance_workflow_kernel"
  ],
  "L3_beta_has_F": true,
  "L2_org_total": 2,
  "L2_jurisdiction_histogram": {
    "": 2
  },
  "L2_eu_orgs": [],
  "L2_orgs_with_any_override": [],
  "L4_user_total": 34,
  "L4_probes": [
    {
      "user_global_id": "1_1",
      "source": "(no-eu-org-sample)",
      "managing_org": "1_1",
      "feature_enabled_for?": true,
      "effective_list_has_F": true
    },
    {
      "user_global_id": "1_2",
      "source": "(no-eu-org-sample)",
      "managing_org": null,
      "feature_enabled_for?": true,
      "effective_list_has_F": true
    },
    {
      "user_global_id": "1_3",
      "source": "(no-eu-org-sample)",
      "managing_org": null,
      "feature_enabled_for?": true,
      "effective_list_has_F": true
    }
  ]
}
```

### `lingolinq-migrate-4ss8l` — layer 5 + cohort provenance

```json
{
  "ts": "2026-08-23T21:08:00Z",
  "setting_id": 2,
  "setting_class_paper_trail_enabled": false,
  "version_rows_for_Setting_total": 0,
  "version_rows_for_this_row": 0,
  "canary_setting_row_exists": false,
  "beta_setting_row_exists": false,
  "canary_equals_code_const": true,
  "beta_equals_canary": true,
  "available_count": 73,
  "canary_count": 73,
  "audit_events_total": 245,
  "audit_recent": [
    {
      "created_at": "2026-08-23T21:08:00Z",
      "type": null,
      "summary": "scot-art50-flag-verification-2026-08-23: rails/runner session opened"
    },
    {
      "created_at": "2026-08-23T21:04:12Z",
      "type": null,
      "summary": "scot-art50-flag-verification-2026-08-23: rails/runner session opened"
    },
    {
      "created_at": "2026-08-23T20:57:08Z",
      "type": null,
      "summary": "1_31: masquerade authorize"
    },
    {
      "created_at": "2026-08-23T20:27:06Z",
      "type": null,
      "summary": "1_31: masquerade authorize"
    },
    {
      "created_at": "2026-08-23T00:20:42Z",
      "type": null,
      "summary": "scot@lingolinq.com+claude-code: rails/runner session opened"
    }
  ]
}
```

### `lingolinq-migrate-wxt9x` — user-level jurisdiction sweep

```json
{
  "ts": "2026-08-23T23:14:30Z",
  "user_total": 34,
  "user_country_code_histogram": {
    "": 29,
    "US": 5
  },
  "eu_users_count": 0,
  "eu_users": [],
  "feature_enabled_for_all_users": {
    "true": 34
  },
  "probe_errors": []
}
```

### `lingolinq-migrate-stnwz` — EuJurisdiction gate resolver

```json
(unavailable)
```

