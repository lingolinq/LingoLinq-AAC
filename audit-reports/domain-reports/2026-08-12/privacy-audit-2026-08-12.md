# LingoLinq-AAC Privacy & Data Protection (GDPR / FERPA / COPPA / HIPAA) Audit

**Run date:** 2026-08-12  |  **Finder:** `privacy-auditor`  |  **Audited commit:** `d67ed76e0a16` (`scot/feat/code-hygiene-auditor`)

**Open findings in this domain:** 27  (0 CRITICAL · 7 HIGH · 15 MEDIUM · 5 LOW)

> DRAFT view of the findings register (`audit-reports/FINDINGS.json`), the single source of truth. Statuses are verified against live code at the audited commit. Only Scot closes a finding, downgrades severity, or accepts risk. Evidence is code/path only; no student or patient data appears here.

## HIGH (7)

### Word-prediction cache holds the raw pre-scrubber user utterance in a process-global structure outside the PiiScrubber boundary, and is not tenant-scoped

- **ID:** `LL-16ef84ad9a`  |  **ruleKey:** `word-predictor-cache-cross-tenant-unscrubbed-key`  |  **confidence:** high
- **Location:** `lib/ai_word_predictor.rb`:47
- **Frameworks:** FERPA, HIPAA, GDPR
- **First seen:** 2026-08-02  |  **Last seen:** 2026-08-03  |  **Disposition:** untriaged
- **Remediation:** PRIMARY ISSUE, unscrubbed retention outside the redaction boundary. The cache key is built from the raw sentence BEFORE PiiScrubber runs (lib/ai_word_predictor.rb:47), and entries live in a process-global CACHE constant. CACHE_TTL (1800s / 30 minutes) is checked only when deciding whether to reuse an entry on lookup (lib/ai_word_predictor.rb:48-51); expired entries are not deleted until capacity eviction (CACHE_MAX=500) or overwrite. On a low-traffic process with fewer than 500 distinct keys, a raw utterance can therefore remain in heap memory for the process lifetime, so describing this as 30-minute retention understates the heap-dump exposure. Verbatim, unredacted AAC utterance content, which is exactly what the compliance corpus says is redacted before it is handled, sits in process memory outside that control. It is reachable by a heap dump, a debug endpoint, or any exception reporter that captures locals or constants. Every compliance document that cites PiiScrubber as THE control on user-authored content is inaccurate for as long as this is true. SECONDARY ISSUE, tenant scoping. CACHE has no user, organization, or district discriminator, so two users in different districts who compose the byte-identical sentence share an entry. This is the weaker of the two arguments and should not be led with: the second user already possesses the input they typed, so what they gain is the model's output for their own sentence, not another learner's content. It still contradicts the mandatory district data-isolation requirement and should be fixed. FIX. Key on a hash of the SCRUBBED sentence rather than the raw one, so no verbatim utterance is retained; include a tenant discriminator (organization or user id) in the key; and either delete on TTL expiry or stop claiming a 30-minute retention bound. Then decide explicitly whether a cache shared across tenants is wanted at all for user-composed content.

### Masquerade produces no AuditEvent; the site-admin branch impersonates any user with no disclosure record

- **ID:** `LL-522c1a6d13`  |  **ruleKey:** `masquerade-no-audit-event`  |  **confidence:** high
- **Location:** `app/controllers/application_controller.rb`:181
- **Frameworks:** FERPA, HIPAA
- **First seen:** 2026-08-04  |  **Last seen:** 2026-08-04  |  **Disposition:** untriaged
- **Remediation:** Write an AuditEvent at masquerade authorization in both branches of application_controller.rb (site-admin at :181, org-manager at :188-205), recording the acting operator, the target user, and the branch that authorized it. Prior art already exists in this codebase and should be generalized rather than reinvented: app/controllers/concerns/api/schema_explorer.rb:102-104 defines audit_user_key as (@true_user || @api_user)&.global_id precisely so a disclosure is booked to the admin who performed the read rather than the account being viewed as. That treatment covers one endpoint and nothing else. Note masquerade has no session concept to hook: it is a per-request as_user_id param or X-As-User-Id header (:177), so the event must be emitted on the authorization path, and de-duplicated per operator/target rather than per request. The org-manager branch already caches its authorization decision in Redis for 30 minutes (:195), which is a natural de-dup window; the site-admin branch has no cache and no gate at all.

### Terms-agree modal can be silently replaced by intro before the user agrees

- **ID:** `LL-53cb93fab1`  |  **ruleKey:** `terms-agree-modal-replaced-before-consent`  |  **confidence:** high
- **Location:** `app/frontend/app/routes/index.js`:132
- **Frameworks:** GDPR, FERPA
- **First seen:** 2026-07-20  |  **Last seen:** 2026-07-23  |  **Disposition:** untriaged
- **Remediation:** In routes/index.js#setupController (and the parallel routes/bento.js path), the terms_agree-missing branch has no return, so execution falls through to modal.open('intro') when show_intro is set. On the synchronous fresh-model path that replaces terms-agree before it mounts (final currentTemplate is intro; utils/modal.js:138 and services/modal.js:92 resolve the first open with {replaced: true}). Fix by making the terms_agree gate authoritative: return after opening terms-agree, or defer intro until the terms-agree promise resolves with a genuine (non-replaced) result. Add a regression test covering really_fresh + show_intro true.

### Hard delete leaves UserVideo records and off-board voice recordings (ButtonSound) undeleted (GDPR right-to-erasure)

- **ID:** `LL-854b1d3853`  |  **ruleKey:** `hard-delete-omits-uservideo-and-offboard-buttonsound`  |  **confidence:** high
- **Location:** `lib/flusher.rb`:363
- **Frameworks:** GDPR, FERPA, COPPA
- **First seen:** 2026-07-09  |  **Last seen:** 2026-07-09  |  **Disposition:** accepted
- **Remediation:** Flusher.flush_user_content / flush_user_completely (lib/flusher.rb:363-417) delete the user's Device, Utterance, NfcTag, UserIntegration, UserGoal, UserBadge, Webhook, UserBoardConnection, UserLink, LogSession and boards, but never sweep UserVideo (it appears only in transfer_user_content at line 354, a merge reassignment) or standalone ButtonSound by user_id. Message-bank voice recordings are ButtonSound rows keyed by user_id (button_sound.rb:128) and are removed only when attached to one of the user's own boards under full_flush (flusher.rb:264-276); off-board recordings and all UserVideo rows survive hard delete as orphaned S3-backed rows. The User model declares no has_many/dependent: :destroy for either (user.rb:16-23), so flush_record(user) cannot cascade. Fix: add UserVideo.where(user_id:) and ButtonSound.where(user_id:) sweeps to flush_user_content (deleting the backing S3 objects too), so a user-requested erasure removes the user's own recorded voice and video. Directly contradicts the docs/legal/COMPLIANCE_PROGRAM_OVERVIEW.md claim that deletion on request removes voice recordings.

### Client-supplied context.topic reaches Bedrock unscrubbed and is absent from the AiApiLog egress record

- **ID:** `LL-8908c7ac6f`  |  **ruleKey:** `ai-word-predictor-context-topic-bypasses-pii-scrubber`  |  **confidence:** high
- **Location:** `lib/ai_word_predictor.rb`:340
- **Frameworks:** COPPA, FERPA, HIPAA, GDPR
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Traced full path: only sentence hits PiiScrubber.redact_for_ai (lib/ai_word_predictor.rb:92); ctx flows raw through normalize_context into system_prompt's topic interpolation at line 340 with no scrub. word_suggestions_controller.rb:61 permits :topic. AiApiLog request_summary only records the scrubbed sentence, so pii_detected understates actual egress.
- **Remediation:** Run PiiScrubber.redact_for_ai over ctx[:topic] in AiWordPredictor.predict (alongside the sentence scrub at lib/ai_word_predictor.rb:92) and pass only the scrubbed value into normalize_context/system_prompt. Merge the topic's scrub_result[:findings] into the pii_findings and pii_detected passed to log_ai_call (lib/ai_word_predictor.rb:155-168), and include the scrubbed topic in request_summary so the AiApiLog row reflects the full egress payload. Alternatively constrain topic to a server-side enum/board-id reference rather than free text.

### PredictionEntry rows survive account deletion, retaining per-user AAC vocabulary sequences indefinitely

- **ID:** `LL-e8614c103f`  |  **ruleKey:** `hard-delete-omits-prediction-entry-vocabulary`  |  **confidence:** high
- **Location:** `app/models/prediction_entry.rb`:4
- **Frameworks:** GDPR, FERPA, COPPA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Repo-wide grep for PredictionEntry/prediction_entr finds no lib/flusher.rb hit; flush_user_content enumerates many models but not this one. Schema has no FK/cascade and User has no has_many :prediction_entries.
- **Remediation:** Add PredictionEntry.where(user_id: user.id).each { |e| Flusher.flush_record(e) } to Flusher.flush_user_content (lib/flusher.rb:363-416), following the LogSnapshot precedent added for LL-1e2ab28aab. Optionally also declare has_many :prediction_entries, dependent: :destroy on User, but note db/schema.rb defines no add_foreign_key entries at all, so Flusher is the only reliable erasure path.

### District seat reclaim converts an under-13's account to a consumer trial with no parental re-consent or notice (COPPA)

- **ID:** `LL-f150e0e828`  |  **ruleKey:** `offboarding-no-parental-reconsent-coppa`  |  **confidence:** high
- **Location:** `app/models/license.rb`:76
- **Frameworks:** COPPA, GDPR
- **First seen:** 2026-07-09  |  **Last seen:** 2026-07-09  |  **Disposition:** accepted
- **Remediation:** When Organization#remove_user calls License#release_user! (app/models/license.rb:53), a managed minor's account is set to managing_organization_id: nil + expires_at: 2.months.from_now and the org UserLink is removed, but no verifiable parental consent is captured and no parent/guardian notice is sent. District-created minors never had direct parental consent: the COPPA gate at user.rb:1321 is skipped for a validated org (org_authorized) under the FERPA/COPPA school-official exception, with a settings['school_authorization'] stamp standing in. So once the seat is reclaimed and the school authorization ends, continued direct-to-consumer processing of the child's data has no COPPA-valid basis (16 CFR 312.5); and, because the lawful basis then shifts to consent, no Art. 8-compliant under-16 parental-authorization mechanism for EU/Poland. Fix: at release_user!, if the account holder is a minor, set settings['coppa'] pending_parent_consent and email the guardian (school-created accounts often have no guardian email on file, so this likely needs a claim-based re-consent in which the family claims the account first, per outputs/plans/2026-07-09-offboarding-coppa-reconsent-fix-scope.md), reusing the existing grant_parental_consent! token flow in user.rb; gate continued processing on that consent, with export-then-delete if the guardian declines or the token expires. Distinct from the creation-time bypass tightening tracked in outputs/plans/2026-06-19-org-coppa-bypass-fix-scope.md.

## MEDIUM (15)

### SubscriptionMailer#new_subscription sends a user's IP address to iplocate.io with no user-type or consent gate, to a third party absent from the subprocessor register (GDPR Art. 28/44, COPPA)

- **ID:** `LL-07f1869d92`  |  **ruleKey:** `iplocate-ip-egress-ungated-undisclosed-subprocessor`  |  **confidence:** high
- **Location:** `app/mailers/subscription_mailer.rb`:30
- **Frameworks:** GDPR, COPPA, FERPA
- **First seen:** 2026-08-08  |  **Last seen:** 2026-08-08  |  **Disposition:** untriaged
- **Remediation:** Found by the 2026-08-08 quarterly subprocessor review (the cycle that fell due 2026-07-20 and was not performed). SubscriptionMailer#new_subscription reads the user's stored device IP (@user.devices[0].settings['ip_address']) and GETs https://iplocate.io/api/lookup/<ip> whenever ENV['IPLOCATE_API_KEY'] is set, on any new subscription. TWO distinct defects. (1) UNGATED: unlike the sibling call in lib/external_tracker.rb:23, which is gated on external_email_allowed? && supporter_registration? && !cookies_opted_out?, this call site has NO user-type check and NO consent gate, so it can fire for any account type including a child or student account. An IP address is personal data under GDPR and is COPPA-relevant for an under-13 user. (2) UNDISCLOSED: iplocate.io is named nowhere in docs/legal/SUBPROCESSORS.md, so this is an Article 28 register omission of the same class as the three flows recorded on 2026-07-21 and the Speech-to-Text flow recorded on 2026-07-22 (LL-1eb9a2435b). Options: (a) gate this call site to match external_tracker.rb, or drop geolocation from the notification email entirely, since the recipient is an internal admin address (NEW_REGISTRATION_EMAIL) rather than the user; (b) add an iplocate.io subprocessor row with DPA status and a data-flow description; (c) confirm whether a DPA exists with iplocate.io at all. NOT YET ESTABLISHED and needed before triage: whether this path can fire for a child/student account in practice, and whether it has ever fired in production. Stripe is a SEPARATE omission found by the same review and is not part of this finding.

### DataPolicyEnforcer retention job skips child orgs that inherit (rather than set) a retention_months policy

- **ID:** `LL-14edf1a801`  |  **ruleKey:** `data-policy-enforcer-child-org-inheritance-skipped`  |  **confidence:** high
- **Location:** `lib/data_policy_enforcer.rb`:22
- **Frameworks:** GDPR, FERPA
- **First seen:** 2026-07-05  |  **Last seen:** 2026-07-05  |  **Disposition:** untriaged
- **Remediation:** Organization#effective_data_policy (app/models/organization.rb:81-101) is explicitly designed to inherit retention_months from a parent org, but enforce_retention!'s candidate-org WHERE clause only matches orgs whose OWN data_policy_version is > 0, and then only sweeps that org's own sponsored_users. A child org that never set its own policy (data_policy_version stays 0) is skipped by the WHERE clause entirely, even though its users are governed by an inherited window via a parent's policy -- so their communication logs never expire. Widen the candidate set to include any org whose effective (not just own) retention_months resolves to a positive value -- e.g. iterate every org with a policy-bearing ancestor, or drive the sweep off each org's own effective_data_policy rather than gating the WHERE clause on data_policy_version. Add a parent(policy)+child(data_policy_version 0) spec asserting the child's stale logs are purged.

### DataPolicyEnforcer retention only purges session log sessions

- **ID:** `LL-1890f6a922`  |  **ruleKey:** `data-policy-enforcer-sessions-only`  |  **confidence:** high
- **Location:** `lib/data_policy_enforcer.rb`:14
- **Frameworks:** GDPR, FERPA
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-12  |  **Disposition:** accepted
- **Remediation:** Extend retention enforcement to other data types referenced in org data policies (boards, images, notes).

### Hard delete leaves LogSnapshot records undeleted (GDPR right-to-erasure)

- **ID:** `LL-1e2ab28aab`  |  **ruleKey:** `hard-delete-omits-logsnapshot`  |  **confidence:** high
- **Location:** `app/models/log_snapshot.rb`:11
- **Frameworks:** GDPR, FERPA
- **First seen:** 2026-08-10  |  **Last seen:** 2026-08-10  |  **Disposition:** accepted
- **Remediation:** LogSnapshot rows are keyed by user_id (app/models/log_snapshot.rb:11) and are created through api/snapshots_controller.rb#create. Neither Flusher.flush_user_content nor flush_user_completely references LogSnapshot, user.rb declares no dependent: :destroy for it, log_session.rb declares no has_many, and db/schema.rb declares no foreign keys at all, so nothing cascades at any level. A hard delete therefore leaves log_snapshots rows carrying a supervisor-supplied name, a date range, a device_id and a location_id, keyed to a deleted user. Fix: add a LogSnapshot.where(user_id:) sweep to flush_user_content alongside the ButtonSound / UserVideo sweeps added in PR #721, with regression coverage. Note the retained location_id already dangles, because ClusterLocation is swept at lib/flusher.rb:19. Scoped to LogSnapshot only: UserExtra and ContactMessage are named in the same unverified set in the retention draft but were not traced, and no claim is made about them.

### protected_image accepts user_token via URL parameter

- **ID:** `LL-310b464be4`  |  **ruleKey:** `protected-image-token-in-url`  |  **confidence:** high
- **Location:** `app/controllers/api/users_controller.rb`:945
- **Frameworks:** FERPA
- **First seen:** 2026-04-09  |  **Last seen:** 2026-07-06  |  **Disposition:** accepted
- **Remediation:** Sunset the legacy permanent-token fallback in User.find_by_protected_image_token once the new [protected_image_legacy_token] log line (app/models/user.rb) shows it's no longer hit. The broader User#user_token exposure (login serialization + logged legacy fallbacks) is tracked separately as LL-ebd844a7d0.

### Retention purge deletes the LogSession's PaperTrail destroy-version and writes no disposal AuditEvent

- **ID:** `LL-3bb2e2eaad`  |  **ruleKey:** `data-policy-enforcer-purge-no-audit-event-deletes-papertrail`  |  **confidence:** high
- **Location:** `lib/flusher.rb`:45
- **Frameworks:** GDPR, HIPAA
- **First seen:** 2026-07-05  |  **Last seen:** 2026-07-05  |  **Disposition:** untriaged
- **Remediation:** Flusher.flush_record (lib/flusher.rb) destroys the record (creating a has_paper_trail :on => [:destroy] version, log_session.rb:24) and then immediately delete_alls that same version via flush_versions, and DataPolicyEnforcer.enforce_retention! writes no AuditEvent for its purges at all -- unlike Flusher.flush_leftovers, which records a per-category AuditEvent for its deletions (lib/flusher.rb ~line 224). This contradicts docs/legal/DATA_RETENTION.md row 30 (Authentication and audit trails / PaperTrail versions on User, Board, LogSession retained 6 years, HIPAA 45 CFR Sec 164.316(b)(2)(i)) and leaves no record proving what data was destroyed, when, or by which policy. Either stop deleting the destroy-version for LogSession specifically in this retention path (retain per row 30), or have enforce_retention! emit a per-run AuditEvent (actor 'system', org id, purged log ids/counts) the way flush_leftovers already does, so a HIPAA access-log review can reconstruct the disposal.

### Article 50 disclosure server-side backstop is present on only 2 of 5 AI ingresses

- **ID:** `LL-6723438462`  |  **ruleKey:** `article50-server-backstop-missing-on-three-ai-ingresses`  |  **confidence:** high
- **Location:** `app/controllers/api/word_suggestions_controller.rb`:19
- **Frameworks:** GDPR
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- EuJurisdiction/article_50 guard exists only in boards_controller.rb:590-593 and integrations_controller.rb:107-110. Read word_suggestions_controller, words_controller#predict, and eval_sessions_controller#narrate in full; none carries the backstop.
- **Remediation:** Extract the disclosure guard used at app/controllers/api/boards_controller.rb:590-594 and app/controllers/api/integrations_controller.rb:107-111 into a shared ApplicationController helper (e.g. require_article_50_disclosure!) and apply it to word_suggestions#create, words#predict, and eval_sessions#narrate, so enabling the article_50_disclosure flag covers all five ingresses atomically. Add a spec asserting every controller that calls AiWordPredictor/AiBoardGenerator/EvalNarrator invokes the guard, so a sixth ingress cannot ship without it.

### focus_generated_words_usage writes caller-supplied words into any AiFocusWordSet with no ownership or tenant check

- **ID:** `LL-6cea3b4787`  |  **ruleKey:** `ai-focus-word-set-usage-write-unscoped-cross-tenant`  |  **confidence:** high
- **Location:** `app/controllers/api/integrations_controller.rb`:178
- **Frameworks:** FERPA, GDPR
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- focus_generated_words_usage checks only the ai_board_generation flag, then find_by_global_id + record_usage! with no org/seed_user comparison. spec/controllers/api/integrations_controller_spec.rb:596-614 itself demonstrates an arbitrary token_user writing into a set it never created.
- **Remediation:** Scope the lookup to the caller's tenant before mutating: compare focus_set.seed_organization_global_id against @api_user.managing_organization&.global_id (or seed_user_global_id against @api_user.global_id) and return 404 on mismatch. Alternatively stop accumulating applied_words on the shared row and record usage in a per-user/per-org join record, keeping the shared row limited to the AI-generated output it already caches.

### Render Key Value instance is plaintext and shared by prod-fallback, staging, dev, and PR previews

- **ID:** `LL-7314b5a8ea`  |  **ruleKey:** `redis-shared-plaintext-render-fallback`  |  **confidence:** high
- **Location:** `render.yaml`:107
- **Frameworks:** HIPAA
- **First seen:** 2026-07-22  |  **Last seen:** 2026-07-22  |  **Disposition:** untriaged
- **Remediation:** Retires by decommissioning Render once the cutover rollback window closes (Render teardown is deliberately deferred and needs its own go). If Render is kept beyond that window, split it into per-environment Key Value instances and move to rediss:// -- the app already supports this with no code change (RedisInit.redis_options enables TLS purely from the URI scheme).

### AiFocusWordSet retains seed_user_global_id and prompt text after the seeding user's account is erased

- **ID:** `LL-8990c53bad`  |  **ruleKey:** `ai-focus-word-set-omitted-from-erasure`  |  **confidence:** high
- **Location:** `app/models/ai_focus_word_set.rb`:75
- **Frameworks:** GDPR, COPPA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- seed_user_global_id set at line 75, stored plain; no lib/flusher.rb reference to the table. Bonus: the low_value prune scope (lines 24-26) also has zero callers anywhere, so there's no automated aging-out path either.
- **Remediation:** In Flusher.flush_user_content (lib/flusher.rb:363-416), null out seed_user_global_id (and seed_organization_global_id where the org link is the deleted user's only tie) on AiFocusWordSet rows matching the erased user's global_id, mirroring the License nulling already done at lib/flusher.rb:412-415. The generated word list itself may be retained as a de-identified cache entry once the identifiers are severed.

### anonymous_logs export job writes each publishing user's username to stdout, bypassing the PII-scrubbing log formatter

- **ID:** `LL-92ae18cc4e`  |  **ruleKey:** `anonymous-logs-export-writes-usernames-to-stdout`  |  **confidence:** high
- **Location:** `app/models/log_session.rb`:2111
- **Frameworks:** FERPA, COPPA, HIPAA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Line 2111 is a literal puts with user.user_name; PiiScrubbingFormatter only governs Rails.logger. logs_controller.rb:2 excepts :anonymous_logs from require_api_token. Bonus: the puts fires BEFORE the consent check on the next line, so even non-consenting users' usernames are emitted.
- **Remediation:** Drop user.user_name from the progress line and log the global_id only, or replace the puts with Rails.logger.info so the line at minimum passes through PiiScrubbingFormatter. Apply the same treatment to the surrounding progress puts at app/models/log_session.rb:2077, 2086, 2123, 2133 if this method is to keep emitting progress from a worker context.

### UserExtra/UserLink profile-history caches are not invalidated when the source profile LogSession is deleted

- **ID:** `LL-caf2528468`  |  **ruleKey:** `user-extra-profile-cache-not-invalidated-on-log-purge`  |  **confidence:** high
- **Location:** `app/models/user_extra.rb`:58
- **Frameworks:** GDPR, FERPA
- **First seen:** 2026-07-05  |  **Last seen:** 2026-07-05  |  **Disposition:** untriaged
- **Remediation:** Before extending any retention/purge job to LogSession log_type 'profile', add cache invalidation: when a 'profile' LogSession is destroyed, either recompute UserExtra#process_profile for the affected user_id/profile_id (dropping the deleted session from the recents list) or scrub matching entries by log_id from UserExtra.settings['recent_profiles'] and UserLink.data['state']['profile_history'] directly. Add a spec asserting the cache no longer contains the deleted log's summary/log_id after purge.

### User creation (incl. org start codes) generates no AuditEvent

- **ID:** `LL-d35cbdb313`  |  **ruleKey:** `no-auditevent-user-creation`  |  **confidence:** medium
- **Location:** `app/controllers/api/users_controller.rb`:244
- **Frameworks:** FERPA
- **First seen:** 2026-04-09  |  **Last seen:** 2026-06-12  |  **Disposition:** accepted
- **Remediation:** Add AuditEvent in the create action for school-context provisioning.

### Permanent, non-expiring User#user_token still login-serialized and accepted by logged legacy token fallbacks

- **ID:** `LL-ebd844a7d0`  |  **ruleKey:** `permanent-user-token-login-serialization`  |  **confidence:** high
- **Location:** `lib/json_api/user.rb`:41
- **Frameworks:** FERPA
- **First seen:** 2026-08-03  |  **Last seen:** 2026-08-03  |  **Disposition:** untriaged
- **Remediation:** (1) Measure hit rates of [lesson_share_legacy_token] and [protected_image_legacy_token] log lines. (2) Sunset those legacy permanent-token fallbacks when quiet -- protected_image sunset already owned by LL-310b464be4; lesson_share sunset is this finding's share of the residual. (3) Separate scoping pass before any primary User#user_token expiry/rotation (higher blast radius; do not schedule until (1)-(2) evidence exists). Explicitly out of scope: embed-frame / UserIntegration#user_token (different credential via lib/json_api/integration.rb + app/models/user_integration.rb).

### PredictionEntry stores AAC vocabulary content in plaintext columns without secure_serialize

- **ID:** `LL-f171af92ff`  |  **ruleKey:** `prediction-entry-vocabulary-unencrypted-at-rest`  |  **confidence:** medium
- **Location:** `app/models/prediction_entry.rb`:3
- **Frameworks:** FERPA, HIPAA, COPPA
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- No secure_serialize or encrypts in the 63-line model; schema shows plain indexed string columns. Noted tension: prefix/next_word carry lookup indexes used by for_prefix, so column encryption is not a drop-in fix.
- **Remediation:** Move prefix/next_word/score/source into a single serialized column protected by secure_serialize (per app/models/concerns/secure_serialize.rb), matching Utterance, LogSession, and UserExtra. If the per-column btree indexes (idx_prediction_entries_unique, idx_prediction_entries_prefix) make that impractical for lookup performance, record an explicit accepted-risk rationale in the register rather than leaving the divergence undocumented.

## LOW (5)

### Eval narration has no licensed-clinician gate (classified NOT a HIPAA Healthcare Activity)

- **ID:** `LL-3a1c317a88`  |  **ruleKey:** `eval-narration-healthcare-activity-classification`  |  **confidence:** high
- **Location:** `app/controllers/api/eval_sessions_controller.rb`:60
- **Frameworks:** HIPAA, FERPA
- **First seen:** 2026-07-19  |  **Last seen:** 2026-07-19  |  **Disposition:** dismissed-false-positive
- **Remediation:** No code gate required. Eval narration is adjudicated NOT a Healthcare Activity, so Anthropic Healthcare-Activity condition (iii) (licensed-clinician restriction) does not apply. If eval narration is ever repositioned as diagnosis, treatment, or auto-finalized clinical documentation, reopen this classification with Scot before PHI flows under that use.

### Flusher.flush_leftovers has no usage-based orphan check for orphaned ButtonImage/ButtonSound media records (item 1)

- **ID:** `LL-57e9beb87f`  |  **ruleKey:** `button-image-sound-orphaned-media-usage-check-unimplemented`  |  **confidence:** medium
- **Location:** `lib/flusher.rb`:57
- **Frameworks:** GDPR, FERPA
- **First seen:** 2026-07-04  |  **Last seen:** 2026-07-04  |  **Disposition:** untriaged
- **Remediation:** Item 1's deferred target is orphaned ButtonImage/ButtonSound media records themselves (images/sounds no board actually uses), NOT the BoardButtonImage/BoardButtonSound join rows -- those are already cleaned on a referential basis by item 2 (implemented). A join-table-only usage signal can't be trusted for ButtonImage/ButtonSound either: Board#map_images stopped syncing board_button_images (image usage now lives only in grid_buttons/known_button_images), and board_button_sounds can lag behind grid_buttons during an async resync window (BoyBand's deferred :map_images job), so checking "zero join rows" as a proxy for "unused" risks deleting media a board is still actively using. Needs a grid_buttons-based reverse-usage check (the same signal known_button_images/known_button_sounds already use per-board) built and proven safe before ButtonImage/ButtonSound records are deleted on a usage basis.

### PaperTrail versions with unconstantizable item_type are detected but retention disposition is undecided

- **ID:** `LL-5d7197fa7d`  |  **ruleKey:** `papertrail-stale-item-type-retention-undecided`  |  **confidence:** medium
- **Location:** `lib/flusher.rb`:135
- **Frameworks:** HIPAA, FERPA
- **First seen:** 2026-07-02  |  **Last seen:** 2026-07-02  |  **Disposition:** untriaged
- **Remediation:** Flusher.flush_leftovers now detects and counts PaperTrail::Version rows whose item_type no longer constantizes to a live model class, but deliberately does not delete them: DATA_RETENTION.md:30 requires 6-year retention with cold-storage archival for authentication/audit-trail paper_trail versions (User/Board/LogSession), and an unconstantizable item_type only proves the class was renamed/removed (this app is itself a rename of CoughDrop/SweetSuite), not that the audit evidence is disposable. Needs a real decision: (a) confirm which stale item_types are true dead weight vs. pre-rename aliases of a live model that should be treated as that model, (b) build actual cold-storage archival before any of these rows are ever deleted, per the existing retention schedule.

### Automated retention only runs for org-sponsored users; standalone accounts keep communication logs indefinitely

- **ID:** `LL-d8072299bf`  |  **ruleKey:** `retention-enforcement-skips-non-org-users`  |  **confidence:** medium
- **Location:** `lib/data_policy_enforcer.rb`:22
- **Frameworks:** GDPR, COPPA
- **First seen:** 2026-07-08  |  **Last seen:** 2026-07-08  |  **Disposition:** untriaged
- **Adversary:** confirmed -- DataPolicyEnforcer.enforce_retention! (data_policy_enforcer.rb:22-31, wired via scheduler.rake:136-140) is the only age-based log purge and is org+sponsored_users scoped; flusher paths (flush_deleted_users/flush_leftovers/flush_old_versions) do not cover standalone/no-policy users.
- **Remediation:** Define a default retention window for communication logs of users not sponsored by any org (individual/consumer and EU self-serve accounts), or document the storage-limitation basis for indefinite retention. Consider a per-user retention preference driving Flusher.flush_record for unsponsored users.

### Org retention policy purges a sponsored user's entire log history, including logs outside that org's context

- **ID:** `LL-de9c94bf36`  |  **ruleKey:** `data-policy-enforcer-user-wide-scope-cross-org-logs`  |  **confidence:** medium
- **Location:** `lib/data_policy_enforcer.rb`:31
- **Frameworks:** GDPR
- **First seen:** 2026-07-05  |  **Last seen:** 2026-07-05  |  **Disposition:** untriaged
- **Remediation:** Confirm with Scot whether an org's retention_months is meant to reach a sponsored user's entire log history (including logs predating enrollment, or generated under a personal/other-org context), or only logs created within that org's context. Today the query is user_id-scoped only, with no org/context filter, so any sponsoring org that sets retention_months deletes all of that user's aged logs regardless of origin -- for a user sponsored by more than one org, the most-aggressive policy effectively wins for their whole history. If the current behavior is intentional, document it explicitly in DATA_RETENTION.md's LogSession row rather than leaving it implicit; if not, scope the purge query by log ownership/context (e.g. author's org at the time, or a recorded originating-org field).


## Remediated (awaiting verification) (2)

Forward-fix applied and independently re-inspected, but not yet independently verified/closed -- still requires Scot's sign-off to close. If a residual is recorded in `closureEvidence.verifierNote`, this finding is NOT fully resolved.

### User#user_token is a permanent, non-expiring credential serialized on login and embedded in navigable lesson/board share URLs

- **ID:** `LL-90045bb29c`  |  **ruleKey:** `permanent-user-token-broad-exposure`  |  **severity:** high
- **Location:** `lib/json_api/user.rb`:41
- **Residual:** Verified 2026-08-03 at staging tip 8cb8b3aa460efc64d0c9eb463ad86a5b8a07a6d0: (a) User.find_by_token uses ActiveSupport::SecurityUtils.secure_compare (PR #563, merge c0eb0c8b7); (b) newly minted lesson/board share links use User#lesson_share_token / User.find_by_lesson_share_token with EXPIRING_LESSON_SHARE_TOKENS kill-switch default ON and logged [lesson_share_legacy_token] fallback (PR #568, merge d067f9cc1); (b-follow-up) graceful expired-link UX via window.lesson_share_token_valid (PR #580, merge e80dc26d4). Newly minted share URLs no longer embed permanent User#user_token. CORRECTION: earlier option-(c)/notes text that treated embed-frame data-user_token as User#user_token was wrong -- board.js feeds tool.get('user_token') from UserIntegration#user_token (lib/json_api/integration.rb), a distinct integration-scoped credential. SUPERSEDED-BY: residual permanent User#user_token login serialization + logged legacy fallbacks tracked as LL-ebd844a7d0. Awaiting Scot's verified-closed attestation.

### Text-to-speech posts raw user text to subprocessors absent from the register (Abair has no DPA; Google TTS flow unrowed) (GDPR Art. 28/44)

- **ID:** `LL-a167848115`  |  **ruleKey:** `tts-raw-text-to-undisclosed-subprocessors`  |  **severity:** medium
- **Location:** `lib/tts.rb`:30
- **Residual:** Remediated across PR #648 (subprocessor disclosure), PR #667 (Google TTS Pre-GA v1beta1 -> GA v1 repoint + consumer translate_tts fallback removal), and PR #674 (Abair Irish TTS disabled in lib/tts.rb and api/search_controller.rb#audio; regression guards spec/lib/tts_spec.rb + spec/controllers/api/search_controller_spec.rb audio specs). This register PR records the triage/disposition. Unverified pending post-merge citation-check and Scot attestation.


---
_Generated from the register at `d67ed76e0a161b594fbffa519ab428d0f9b7780b`. Regenerate with `ruby scripts/render-domain-reports.rb`. Do not edit by hand._
