# KAN-124 / GitHub #383: CSV/formula injection in org user-report

LEARNINGS consulted: `.eslint-todo` line anchoring (LEARNINGS.md); end-of-file imports
hold existing rows (2026-10-23 serve-assets, 2026-10-11 boards-set-home-mode). Archive
grep for csv/formula: no prior org-report CSV lesson.

Issue #383 required fix: quote every CSV cell and prefix `'` on cells starting with
`= + - @`. Storage sanitizing is labelled "Consider". The issue's related
`supporter_registration?` allowlist is out of scope. GitHub #1033 is a different
ticket (Cloud Logging tokens) and is also not in this PR. This branch also
neutralizes leading tab and CR, per the request here.

## Fact sheet

### (a) Where is the value READ?

CONFIRMED (`app/frontend/app/controllers/organization/reports.js:292-335`):
`actions.download_list` is the CSV sink. For `results.list` it pushes
`user.name`, `user.user_name`, `user.email`, `user.joined`,
`user.registration_type`, `user.referrer`, `user.ad_referrer` then
`columns.join(',')` (`:312`). For `results.stats` it pushes `stat.key` /
`stat.value` then `columns.join(',')` (`:321`). The joined rows become a
`data:text/csv` download named `users.csv` or `stats.csv`.

The template control is "Download list as a csv"
(`app/frontend/app/templates/organization/reports.hbs:147`).

Writers of the user fields:

- Stored at signup CONFIRMED (`app/models/user.rb:2859-2860`):
  `settings['referrer']` / `settings['ad_referrer']` assigned from params if
  not already set. `ad_referrer` originates from `?ref=` CONFIRMED
  (`app/frontend/app/app.js:108`).
- Surfaced on the admin-org user report CONFIRMED
  (`app/controllers/api/organizations_controller.rb:729-733`): `email` always;
  `referrer`, `ad_referrer`, `registration_type`, `joined` only when
  `org.admin?`. `name` / `user_name` come from `JsonApi::User.as_json`
  (`limited_identity: true`).
- HubSpot egress already bounds `ad_referrer` CONFIRMED
  (`lib/external_tracker.rb:136-141` `ad_key_clean`). That path is not this
  sink. Issue #383 notes PR #382 `referrer_origin` truncation does not protect
  the report because the report reads raw `settings['referrer']`.

### (b) Shapes

CONFIRMED reachable cell values at `download_list`:

- `undefined` / missing (non-admin org: joined/referrer/ad_referrer/registration_type
  are never added; name can be blank).
- Ordinary strings (email, iso8601 `joined`, handles).
- User-controlled strings that may contain commas, double quotes, CR/LF
  (`name`, `user_name`, `email`, `registration_type`, `referrer`, `ad_referrer`;
  stats `key` can be a board key or org-shaped label).
- Formula payloads whose first character is `=`, `+`, `-`, `@`, tab, or CR
  (issue examples: `=HYPERLINK(...)`, `=cmd|'/c calc'!A1`, `,extra,columns`,
  newline). `=1+1` is the same class.

`columns.join(',')` never quotes, never escapes `"`, never prefixes a guard.

### (c) Cross-file claims

| Claim | Verdict |
|---|---|
| Rails `admin_reports` is the CSV writer | FALSE. Rails returns JSON; Ember builds the CSV. |
| Issue "Consider sanitizing at storage" is a required Rails change | FALSE. The required Fix bullet is the CSV cell quoting/prefix. Storage is "Consider". |
| HubSpot `ad_key_clean` already protects this sink | FALSE. Different egress. |
| Adding a top-of-file import in `reports.js` is safe for `.eslint-todo` | FALSE. Anchors at lines 16, 26, 68, 229, 236, 239. A new line above 16 shifts all six. |
| `reports.js` already imports at end of file | TRUE (`:406` `apiErrorMessage`). |
| Stats CSV is out of issue #383 | Partial. Issue names the user-report. The same function also writes `stats.csv` with the same `join`. Board keys / labels can be user-shaped. Quote that path too. |
| Combine with GitHub #1033 (Cloud Logging tokens) or with #383's related registration allowlist | Out of scope per user. |

## Rails

No Rails change on this branch. The required sink is the Ember CSV builder.
Sanitizing `referrer`/`ad_referrer` at `User` storage would mutate attribution
data for every consumer, including ones that are not spreadsheets, and the
issue marks that as optional. HubSpot already filters `ad_referrer` on its own
egress. `registration_type` allowlisting is the related lower-priority item
inside #383, not this PR. GitHub #1033 is unrelated (Cloud Logging tokens).

## Proposal

### Candidate A (chosen)

New `app/frontend/app/utils/csv.js` with `csvCell` / `csvRow`:

1. stringify (`null`/`undefined` → `''`)
2. if first char is `=`, `+`, `-`, `@`, tab, or CR, prefix `'`
3. escape `"` as `""`
4. always wrap the cell in double quotes

`download_list` replaces both `columns.join(',')` with `csvRow(columns)` on
the same lines. Import `csvRow` at the **end** of `reports.js` (after the
existing trailing `apiErrorMessage` import) so `.eslint-todo` rows at 16, 26,
68, 229, 236, 239 do not move.

### Candidate B (rejected)

Inline the quoting in `download_list` only, no util. Two sites would duplicate
the encoder; the unit test could not hit a shared function.

### Candidate C (rejected)

Sanitize at `User` storage and quote in Ember. Storage sanitizing is not
clearly required (see Rails section). Would also change HubSpot/attribution
inputs.

### Risks

- Always-quoting changes the file vs today's unquoted cells. Spreadsheets
  accept RFC 4180 quoted cells; that is the point.
- Stats numeric values that stringify with a leading `-` get a `'` prefix
  (they become text in Excel). Safer than leaving a formula.
- Trailing `import` is already used in this file; Ember/babel hoist it.
- Unicode lookalike prefixes (`＝`) are not in the issue or the requested
  set; out of scope.

### Test and mutation

Red test: `app/frontend/tests/unit/controllers/organization-reports-csv-test.js`
calls `download_list` and asserts the **entire** decoded `data:text/csv` body.

users.csv fixture: name `a\nb,"c` (newline + comma + quote), user_name `+1`
(non-`=` trigger), email `null`, joined an iso date that must not be
prefixed, referrer `=1+1`, ad_referrer `=HYPERLINK("http://evil.example")`.

stats.csv fixture: `{key: '=1+1', value: 12}` (numeric, as production
`parseInt` values are) plus a comma-quote key.

Proposal review (adversary, 2026-11-02): APPROVE with those exact-body
requirements. Applied to the red test before any application-code edit.

Mutation that must go red: restore `columns.join(',')` on `:312` and `:321`.

Helper unit tests in `tests/unit/utils/csv-test.js` cover tab/CR/`+`/`-`/`@`
and newlines; those land with the util.

## Not in this PR

- GitHub #1033 (Cloud Logging bearer tokens)
- `supporter_registration?` allowlist (related note on #383, not done here)
- Sanitizing `referrer`/`ad_referrer` at storage
- Other `join(',')` call sites (not CSV downloads)
- Adding a header row to `users.csv`

## Review follow-up (senior-dev and adversary passes on 317a2bbf0)

Applied in this branch, red test first:

- **LF and full-width starters.** The OWASP CSV Injection page lists `= + - @`, tab, CR, LF, and the full-width `＝ ＋ － ＠`. LF and the full-width set were missing. `csv.js` now checks the first character against one `FORMULA_STARTERS` list. Red run: the LF assertion and the new full-width test failed; both pass after.
- **Non-string cells.** Signup keeps a list-shaped `referrer` (`users_controller.rb` `permit!`, stored as-is at `user.rb` `settings['referrer'] ||= params['referrer']`). `csvCell` already guards by `String(value)`; a new test pins that. Mutation: guarding only `typeof value === 'string'` turns it red.
- **Stub restore.** The controller test assigned the originals back to `HTMLAnchorElement.prototype.click` and `document.createElement`, which leaves own copies of inherited methods (`.claude/rules/testing-frontend.md`, "Restoring a stub"). It now uses `stub()` / `restoreStubs()`, and `afterEach` asserts neither own property remains. Mutation: assigning `click` directly turns both controller tests red on that assertion.
- **Test plan step 4.** "All organization communicators" loads from `/organizations/:id/users`, which fills `joined` for managed users, so that column is not always empty for a non-admin org.

Not changed: leading whitespace, NBSP or BOM before `=` (not on the OWASP list; a leading space makes the cell text in Excel and Sheets).
