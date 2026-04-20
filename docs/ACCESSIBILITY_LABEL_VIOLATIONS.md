# Label and CORB Audit Findings

This document maps the accessibility/CORB audit violations to specific locations in the codebase.

## 1. Label `for` Attribute Mismatches

**Status:** Core violations fixed (see git history). Remaining items in "Other files to audit" may need review.

A label's `for` attribute must reference the `id` of a form control (input, select, textarea). When they don't match, autofill and screen readers fail.

### register.hbs
| Line | Label `for` | Issue |
|------|-------------|-------|
| 13 | `sponsor` | No element with id="sponsor" — this is a display-only block (image + text), not a form field. **Fix:** Remove `for` or use a different approach. |
| 81 | `start_code` | Input has no `id` attribute. **Fix:** Add `id="start_code"` to the Input. |

### user/edit.hbs
| Line | Label `for` | Issue |
|------|-------------|-------|
| 25 | `email` | Wrong — Cell Phone input has `id="cell_phone"`. **Fix:** Change to `for="cell_phone"`. |
| 114 | `voice_pitch` | Home Board is static content (LinkTo), no form control. **Fix:** Remove `for` or wrap in a different structure. |
| 56 | `contacts` | No form control with id="contacts" — the Inputs for contact name/email have no ids. **Fix:** Add ids to the contact Inputs or remove `for`. |
| 364 | `location` | Avatar section has no input — it's an image + link. The Location field (line 360) uses id="location", so this creates a duplicate/wrong association. **Fix:** Use `for="avatar"` and add id to the "Choose a different profile pic" link if it's the primary control, or remove `for`. |
| 372 | `2fa` | The 2FA Input (line 382) has no `id="2fa"`. **Fix:** Add `id="2fa"` to the code Input. |
| 417 | `location` | Installed Tools has no form control — it's a list of tool icons. **Fix:** Remove `for` attribute. |

### organization/reports.hbs
| Line | Label `for` | Issue |
|------|-------------|-------|
| 32 | `report_sort` | No element with id="report_sort" — there are two selects: `report_sort_by` and `report_sort_order`. **Fix:** Use `for="report_sort_by"` (primary control) or remove `for` since there are two controls. |

### support.hbs
| Line | Label `for` | Issue |
|------|-------------|-------|
| 44 | `author_id` | bound-select uses `select_id="supervisor_type"`. **Fix:** Change to `for="supervisor_type"`. |

### organization/settings.hbs
Many labels reference ids that may not exist on the corresponding form controls. Verify each `bound-select` has matching `select_id` and that other inputs (Input, textarea) have matching `id` attributes. The template has many form groups — audit each one.

### Other files to audit
- **record-note.hbs** — labels for `goal_options`, `note`, `prior_note`, `log`, `video`
- **modals.legacy/** — various modals with labels
- **user/preferences.hbs** — labels for `role`, `device_role`, `auto_open_speak_mode`, etc.
- **user/goal.hbs** — labels for goal-related fields

### Quick verification pattern
For each `<label for="X">`:
1. Find a form control (Input, select, textarea) with `id="X"` or `select_id="X"` (for bound-select).
2. If none exists, it's a violation.

---

## 2. CORB (Cross-Origin Read Blocking)

**Affected resources:** ifttt.png, lessonpix.png (10 requests total)

**Locations in code:**
- `app/frontend/app/templates/user/edit.hbs` (lines 442, 446) — `s3.amazonaws.com/lingolinq/icons/`
- `app/frontend/app/templates/button-settings.hbs` (line 304) — `lingolinq.s3.amazonaws.com/icons/lessonpix.png`
- `app/frontend/app/templates/button-settings-picture.hbs` (line 167)
- `app/frontend/app/templates/components/button-settings.hbs` (line 312)
- `app/frontend/app/templates/setup/symbols.hbs` (line 71)
- `app/frontend/app/templates/components/setup/symbols.hbs` (line 71)

**Cause:** CORB blocks when the server returns a response type that doesn't match what the request expected (e.g., HTML/JSON for an image request). Common causes:
- S3 objects missing or returning 404/error page (HTML)
- S3 objects served with wrong `Content-Type` header
- CORS or bucket policy blocking the request

**Fixes:**
1. Ensure the PNG files exist at those S3 URLs and return `Content-Type: image/png`.
2. If using CloudFront or a CDN, verify it forwards correct headers.
3. Consider hosting these icons in the app's `public/` folder to avoid cross-origin requests.
