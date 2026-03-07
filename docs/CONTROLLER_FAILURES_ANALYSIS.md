# Controller Spec Failures Analysis (100 failures)

Analysis of controller spec failures with root causes and recommended fixes.

---

## 1. OrganizationUnit / "record must be saved" (~25 failures)

**Error:** `RuntimeError: record must be saved` in `Webhook.get_record_code` → `UserLink.generate` → `OrganizationUnit#add_supervisor` / `add_communicator`

**Affected specs:**
- `lessons_controller_spec`: assign, create, index, unassign (8 failures)
- `units_controller_spec`: note, stats, log_stats, logs, create (15+ failures)

**Root cause:** `OrganizationUnit#add_supervisor` and `add_communicator` call `UserLink.generate` which uses `Webhook.get_record_code(record)`. The `record` (User or OrganizationUnit) must have an `id`. Specs may be creating units/users that aren't persisted, or passing unsaved records.

**Fix:**
- Ensure `OrganizationUnit.create` and `User.create` are called (not `.new`) before `add_supervisor` / `add_communicator`
- Check if `OrganizationUnit` has `belongs_to :organization` (required) - org must exist and be saved
- Trace: `units_controller_spec` creates `ou = OrganizationUnit.create(...)` - verify org, unit, and communicators are all persisted before use

---

## 2. ActionController::UrlGenerationError: id/unit_id nil (~20 failures)

**Error:** `No route matches {..., id: nil}` or `unit_id: nil`

**Affected specs:**
- `snapshots_controller_spec` (3): s.global_id is nil
- `badges_controller_spec` (6): b.global_id is nil
- `units_controller_spec` (10+): ou.global_id or u.global_id is nil
- `utterances_controller_spec` (4): u.global_id is nil
- `logs_controller_spec` (2): log.global_id is nil
- `profiles_controller_spec` (2): template.global_id is nil

**Root cause:** Record create failed (validation) or returned unsaved object. `belongs_to` required associations missing (user, organization, etc.).

**Fix:** Add required associations to all `.create` calls:
- `LogSnapshot`: needs `user` (belongs_to)
- `UserBadge`: needs `user` (belongs_to)
- `OrganizationUnit`: needs `organization` (and possibly user for created_by)
- `Utterance`: needs `user` (belongs_to)
- `LogSession`: ensure it's saved and has id
- `ProfileTemplate`: see #3

---

## 3. ProfileTemplate validation (3–4 failures)

**Error:** `Validation failed: User must exist, Organization must exist`

**Affected:** `profiles_controller_spec` index (3), show (2 - template nil from create failure)

**Root cause:** `ProfileTemplate` has `belongs_to :user` and `belongs_to :organization`. Spec creates with `organization_id: nil` or omits user.

**Fix:**
- Create org and user before ProfileTemplate: `o = Organization.create` (with admin), `u = User.create`, `pt = ProfileTemplate.create!(organization: o, user: u, ...)`
- Or add `optional: true` to ProfileTemplate associations if templates can exist without them (check model)

---

## 4. Badges – data nil, empty results (~6 failures)

**Error:** `undefined method '[]=' for nil` on `b3.data`; `expect length 1/10, got 0`

**Root cause:** `UserBadge` uses `secure_serialize :data`. Data is nil. Also badges not found - UserBadge may need `user_id` or `goal_id`, and goals need proper setup.

**Fix:**
- Ensure `UserBadge.create` has `:user => u`, `:goal => g` (goal must exist)
- `b.data ||= {}` before assigning if model doesn't initialize it
- Verify `UserGoal` (template_header) exists for goals_controller index

---

## 5. BoardsController – multiple issues (~15 failures)

| Issue | Count | Fix |
|-------|-------|-----|
| `DoubleRenderError` in create | 2 | Board create calls `api_error` after render; add `return` after `api_error` in controller |
| `Record not found` for deleted boards | 5 | DeletedBoard lookup vs Board - check `find_by_path` for deleted boards |
| history/rollback version count | 5 | Expect 1 or 2 versions, got 2 or 3 - PaperTrail may create extra versions; relax expectation or fix setup |
| stats uses = 0 | 1 | Board stats computation - verify LogSession/button use setup |
| show deleted status | 2 | Deleted board JSON format - check controller response for deleted records |

---

## 6. Unsafe redirect (1 failure)

**Error:** `UnsafeRedirectError` to `https://opensymbols.s3.amazonaws.com/...`

**Fix:** In `boards_controller.rb` icon action, add `allow_other_host: true` to `redirect_to`.

---

## 7. created_at / iso8601 nil (3 failures)

**Error:** `undefined method 'iso8601' for nil`

**Affected:**
- `boards_controller_spec` utterance (2): Utterance has nil created_at - add `:user => user` to Utterance.create
- `callbacks_controller_spec`: UserVideo in transcoding - add `:user => u` to UserVideo.create

---

## 8. MessagesController (3 failures)

**Error:** `response.successful?` false on create

**Fix:** Inspect response body for error. Likely validation or missing param. Run spec with `--format documentation` and print `response.body`.

---

## 9. SessionController (2 failures)

- **oauth_token:** Expect `permission_scopes eq ['none']`, got `['read_profile', 'basic_supervision']` - device scope setup for 2fa flow
- **token_check:** Expect body `"success"`, got JSON with `authenticated: false` - 2fa required but flow returns different response

**Fix:** Update expectations to match current 2fa behavior or fix device/user 2fa setup in specs.

---

## 10. WordsController (3 failures)

**Error:** JSON includes `"_locale" => "xx"` or `"xx-xx"` - specs expect exact match without that key.

**Fix:** Update expectations to include `"_locale"` in the hash or use `expect(json).to include(...)` and exclude `_locale` from strict eq.

---

## 11. LogsController trends_slice (11 failures)

**Error:** All expect various errors (invalid ids, too many users, etc.) but get `"Invalid credentials"`.

**Root cause:** `trends_slice` uses integration key auth (DeveloperKey), not API token. Specs pass `integration_id`/`integration_secret` - may be wrong or missing.

**Fix:** Check how trends_slice authenticates. Ensure specs set up DeveloperKey, Device with user_integration, and pass correct params. May need to stub auth or use `env_wrap` for integration credentials.

---

## 12. LogsController (3 others)

- **lam:** log_id nil - LogSession create needs user/device
- **create:** IP format `0000:0000:0000:0000:0000:ffff:0807:0605` vs `0000:0000:0000:0000:0000:ffff:0000:0000` - IP canonicalization changed in Rails or code
- **index:** filter returns 0 - query param or setup issue

---

## 13. UnitsController (2 specific)

- **create:** response not successful - check required params (name, organization_id?)
- **index:** expect 2 units, got 0 - units not created or org scope wrong

---

## 14. UtterancesController (1)

**share_with:** `device required` - Utterance.share_with needs device in non_user_params. Pass `:device => d` when calling share_with.

---

## 15. UsersController protected_image (1)

Expect redirect, got non-redirect. Likely cached copy not found - stub or set up ButtonImage cache.

---

## 16. OrganizationsController extra_action (1)

Sentence suggestions returns success false - inspect endpoint and required setup.

---

## 17. WebhooksController update (1)

Response not successful - check update params and webhook setup.

---

## 18. GoalsController (1)

Expect 1 template_header goal, got 0. UserGoal with template_header not created. Create `UserGoal.create(template_header: true, ...)` or equivalent.

---

## Suggested Fix Order

1. **Quick wins:** Unsafe redirect (#6), created_at nil (#7), WordsController _locale (#10)
2. **Association fixes:** ProfileTemplate (#3), Snapshot/Badge/Unit/Utterance/Log id nil (#2)
3. **OrganizationUnit chain:** Fix add_supervisor/add_communicator record persistence (#1)
4. **Auth/setup:** Logs trends_slice (#11), SessionController 2fa (#9), Messages (#8)
5. **Complex:** Boards (#5), Badges (#4), Goals (#18)
