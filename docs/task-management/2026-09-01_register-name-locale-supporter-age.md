# Register form: name, language, supporter age gates

Working log. Dated `YYYY-MM-DD_` (underscore) so git will track it;
`YYYY-MM-DD-*.md` is gitignored.

## Goal

Optional full name and preferred language on communicator and supporter
signup. Supporter birth month/year with the same COPPA-13 / EU-16 gates
as communicators. Month/year pickers typable and grid-shaped for
eye-gaze / switch users.

## Fact sheet (rule 13)

### BoundSelect grid

- **(a) Where is the value READ?** `option_keydown` (`bound-select.js:189`)
  reads the focused `.bound-select__option` from the DOM and moves
  focus. The template reads a layout flag for the CSS class.
  CONFIRMED `bound-select.js:189-213`, `bound-select.hbs:1`.
- **(b) Shapes:** default vertical list (200+ callers). New opt-in grid
  used only by register month/year. Writer: the caller argument.
- **(c) Ember `layout` is reserved.** Classic `Component` uses `layout`
  for the compiled template. `@layout="grid"` would replace the
  template. Use `@grid={{true}}` instead. CONFIRMED Ember classic API.
  Search typing must stay on `onSearchKeydown`, not `ctrlAction`
  (LEARNINGS 2026-08-26). CONFIRMED `bound-select.js:223-246`.

### Register age / name / locale

- **(a) Where is age READ?** Ember: `continue_communicator_age` /
  `continue_supporter_type` read `_classifyCommunicatorAge` then write
  `coppa_age_group` and `registrationStep`. Server: `User.process_params`
  classifies from `birth_month` / `birth_year` via
  `User.age_under_threshold?` (COPPA-13). Unauthenticated
  `users#create` requires a classifiable birth when COPPA is on.
  Google start rejects missing birth or under-13. `select_supporter_type`
  only writes type; it does not advance.
- **(b) Shapes:** `coppa_age_group` null | `under_13` | `over_13`.
  Birth ids are month 1–12 and year >= 1900. Client `coppa_under_13` is
  a fallback only when birth is missing (authored/internal creates).
- **(c)** Google profile `link['name']` is not the form name. Form name
  is `signup_name` on the complete POST (sessionStorage), not the
  start GET query.

## Decisions

- BoundSelect: `@grid={{true}}` + `@gridColumns` (default 3). Not `@layout`.
- Form name on Google path: `config['signup_name']`; create prefers it
  over the Google profile name.
- Locale allowlist: `/\A[a-z]{2,8}\z/`; else `en`.
- Task log filename uses underscore (gitignore).

## Attempts

- BoundSelect grid via `@grid={{true}}` (not `@layout`). Tests: 8/8 pass, including
  `_gridNextIndex` and search typing in grid mode.
- Supporter DOB required in `select_supporter_type`. Falsified: reverting the
  age check made "does not leave the supporter type step" fail
  (`account` vs `supporter_type`). Restored; 20/20 RegisterController pass.
- Google path stores `signup_name` + `locale` on start; create prefers
  `signup_name` over the Google profile name. RSpec 6/6 targeted examples pass.

## Follow-up: supporter radios + Next + searchable country

- `select_supporter_type` only writes `registration_role` +
  `registration_type`. Advance lives in `continue_supporter_type`
  (same checks as communicator Next: country, DOB, then type).
- Template: native radios + continue button. Country BoundSelects are
  `@searchable` with prompt `Select country…`. Empty-id country
  placeholder removed so the list is real countries only
  (`bound-select` trigger uses `@prompt`).

## Follow-up: server COPPA + review findings

- Public unauthenticated signup requires classifiable birth when COPPA
  is on (`users_controller#create`). `process_params` classifies from
  birth; client `coppa_under_13` wins only when birth is missing.
- Google register start accepts birth only on POST. GET register start
  ignores query birth (COPPA PII must not sit on the start URL).
  Complete refuses under-13. Form name is `signup_name` on the complete
  POST, not `&name=` on the start GET.
- RSpec: 16/16 COPPA create examples; Google auth examples including
  birthdate_required, coppa_age start, and coppa_age complete. Ember:
  RegisterController 23/23; BoundSelect 9/9 including the rendered
  search-keydown integration test. Residual: authenticated
  `users#create` without an org can still omit birth (flag-only).
  Org-authored school exception unchanged.

## Follow-up: Full Name moved to the account step (2026-09-03)

The optional "Full Name" field was moved off the birthdate step and onto the account step,
above Username (`register.hbs`, both the communicator and supporter paths). Rationale kept in
a template comment: it is the friendliest thing to ask for first, and the account being
created is what that step is for.

Shipped in commit `067feab48`, whose message flagged it as **"NOT COVERED BY A TEST and not
verified in a browser"** — it was carried along with other work rather than authored with its
own test.

**CORRECTION (2026-09-03): Traci confirmed the move in the running app.** The "not verified"
half of that caveat is closed; recorded here because the commit message is already pushed and
cannot be amended honestly. Still true and still open: **there is no automated test for it**,
so a future refactor of the registration steps has nothing guarding this field's placement.

Confirmed in the same pass: the registration YEAR picker shows the correct years — see
`2026-09-03-bound-select-scroll-buttons.md` for the paging fix and its browser measurements.
