# develop CI red: expired lint-todo, false-positive rule match on an i18n key named "view"

Date: 2026-09-19. Branch: `chore/scot-template-lint-view-helper-false-positive-5d62a7f8`.
Blocks `build-and-test` (step "Lint Ember templates") on every PR into `develop` since
2026-09-19T00:00Z, including PRs #1016 (unaffected, ran before the cutover) and #1017.

## Symptom

`develop`'s own CI (run 35407688177, commit `6b09687fb`, a compliance-doc-only commit) failed
`Lint Ember templates` with no frontend code change in that commit. The previous `develop` commit
passed the same step.

## Root cause

CONFIRMED. `app/frontend/.lint-todo` line 165 held a todo entry for rule
`deprecated-inline-view-helper` at `app/templates/organization/index.hbs:309`, decoded as
`errorDate 1789689600000` = `2026-09-18T00:00:00Z`. Past that date, `ember-template-lint`
(6.1.0, matches `Gemfile.lock`... no, `package.json` `"ember-template-lint": "^6.0.0"`, installed
`6.1.0`) treats the item as a real error instead of a suppressed todo, with no code change needed
to trigger it.

The flagged line: `{{t "View" key="view"}}` (`app/templates/organization/index.hbs:309`). This is
a call to the app's own `t` i18n helper; `key="view"` is a hash-pair argument naming the
translation lookup key, a plain string literal. The rule `deprecated-inline-view-helper`
(`node_modules/ember-template-lint/lib/rules/deprecated-inline-view-helper.js`,
`manageMustacheViewInvocation`) flags any hash-pair whose value, split on `.`, starts with the
literal token `view`, because that is how the OLD `{{view someProp}}` / `{{some-component
prop=view.foo}}` invocations looked. It has no way to distinguish that from an unrelated string
that merely happens to be `"view"`. Reproduced offline with `ember-template-lint .`: renaming the
key alone removes the error, with zero other lines affected.

`grep -rn 'key="view"' app/frontend/app` returns exactly this one line, so the key was never
reused elsewhere.

## Fix

Renamed the i18n key from `view` to `view_log` at the one call site, and added a `view_log` entry
to all 13 `public/locales/*.json` files carrying the exact same value the `view` key already held
(verbatim, including the non-English `"... [[ View"` pending-translation marker), so no new
translation work is created and no locale regresses. The old `view` key is left in place in every
file, unused; the generator (`i18n_generator.rb`) does not prune unused keys from non-English
locales either, and pruning it here would be an unrelated cleanup.

`i18n_generator.rb` (scan-only, no `--generate`/`--merge`) confirms `TOTAL MISSING 0`,
`TOTAL DUPS 0`, `TOTAL KEYLESS 0` after the change.

Running the plain `ember-template-lint .` (not `--update-todo`) auto-appended a matching `remove`
line for the resolved todo entry to `.lint-todo`; this is the tool's normal behavior on any
lint run, not a manual edit, and reduces the file's active (unresolved) entries from 2 to 1.

## Verified

- `npm run lint:hbs` before the fix: `2 problems (1 error, 1 warning)`, matching CI's log exactly.
- After the fix: `1 problems (0 errors, 1 warning)`, exit code 0 (a warning does not fail the
  build). This is what CI's step checks.
- `grep` for any other reference to the old key (`key="view"` in any `.hbs`/`.js`, `i18n.t('view'`
  in any `.js`) outside the locale files themselves: none.
- All 13 edited locale JSON files still parse (`json.load`).
- No existing test (`app/frontend/tests`) covers this template section, so nothing to falsify by
  reverting; the before/after lint output is the evidence.

## Not fixed here, on purpose

The one remaining active `.lint-todo` entry is `no-nested-interactive` at
`app/templates/application.hbs` (a `<div role="button" tabindex="0">` nested inside an `<a
href="#">` opened at line 126). This is a genuine accessibility finding, not a rule false
positive: two interactive elements are actually nested. Its decoded `errorDate` is
`2026-09-19T00:00:00Z`, today, and it was STILL reported as a warning (not an error) in both this
morning's CI run and a local run at 2026-09-19T06:12Z, six hours past that timestamp. I did not
determine why the tool has not yet promoted it (a day-boundary/timezone quirk in
`@lint-todo/utils`, or the promotion only happens on `--update-todo`, not a plain run, contradicted
by the auto-`remove` behavior observed above, so unresolved). Whatever the mechanism, it is not
blocking CI right now.

Fixing it is a real UX/accessibility decision (what should the outer `<a href="#">` become, or
should the inner `role="button"` div stop being interactive) that does not belong in a one-line
i18n rename PR. Flagged here as likely to start blocking CI soon; owner should be whoever owns
`app/templates/application.hbs` (frontend/a11y surface).
