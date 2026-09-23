# System Settings: text inputs call an undefined handler (issue #1051)

Base: `develop` at `df346161b`. Branch: `fix/scot-email-edit-duplicate-init`.

## Fact sheet

**(a) Where is the value read?**

- `ctrlActionEventValueBound` is read by the templates, inside `{{on "input" (this.ctrlActionEventValueBound ...)}}`:
  - `app/frontend/app/templates/system-settings/email-edit.hbs:38,40,42`, inside `{{#each this.i18nBlocks}}` under `{{#if (is-equal this.activeFormat "message")}}` (`:29`). CONFIRMED.
  - `app/frontend/app/templates/system-settings/app-defaults.hbs:10,14,18,22,26`, unconditionally for every field. CONFIRMED.
- `activeFormat` becomes `'message'` in `loadTemplate` when `t.has_i18n_blocks` (`controllers/system-settings/email-edit.js:131-133`). CONFIRMED.

**(b) Every shape it can hold, and who writes it**

- On the email-edit controller, `ctrlActionEventValueBound` has exactly one writer: the FIRST `init()` (`email-edit.js:26`). That `init()` is dead, because a second `init` key (`:139`) in the same `Controller.extend({...})` literal replaces it; in an object literal the last duplicate key wins. So at runtime the value is always `undefined`. CONFIRMED: the code, plus `.eslint-todo` row `app/controllers/system-settings/email-edit.js|no-dupe-keys|139|...`.
- On the app-defaults controller it has no writer at all. The single `init()` (`app-defaults.js:28-51`) defines only `ctrlAction` and `ctrlActionNoBubble`, so the value is always `undefined`. CONFIRMED.
- Other writers in the app: the parent `controllers/system-settings.js:46` and `components/eval-comprehensive-runner.js:292`, both different instances, not visible to these templates' `this`. CONFIRMED by grep (corrected: the first draft named only the parent).
- `has_i18n_blocks` is true for the six parental-consent templates (`lib/system_email_registry.rb:146-206`; set by `app/controllers/api/system_email_templates_controller.rb:129-133`). CONFIRMED.

**(c) Cross-file claims**

- The two `ctrlAction` bodies in email-edit (`:14-25` and `:142-153`) are identical. CONFIRMED with `diff`.
- The target actions exist: `updateI18nBlock` (`email-edit.js:170`) and `updateField` (`app-defaults.js:55`). CONFIRMED.
- The email-edit template does not use `ctrlActionNoBubble`. CONFIRMED by grep.
- Rendering `{{on "input" (this.missing ...)}}` with `missing` undefined fails the render in Ember 5.12. CONFIRMED only for development and test builds, by a throwaway rendering test (deleted afterwards): "global failure: TypeError: Cannot read properties of undefined (reading 'bind')". The `.bind` runs only under `isDevelopingApp()` (`ember-source/dist/packages/@glimmer/runtime/index.js`, `on` modifier). The production build (`Dockerfile:21`, `ember build --environment production`) does `let callback = userProvidedCallback;` (`ember-source/dist/ember.prod.js:18967`), and `addEventListener` ignores `undefined`. **In production:** app-defaults works (its `set-field` modifier updates the value); email-edit renders, but typing in the consent message fields is discarded, and Save still reports "Email template saved." (`email-edit.js:202`) before reloading the unchanged text.
- No `.eslint-todo` rows in `app-defaults.js`. Email-edit has only the `no-dupe-keys` row, which goes stale when the duplicate is removed (stale rows are harmless per the gate header; not regenerated here). CONFIRMED.

## Red test

Run before the fix (Node v22.23.2, `npx ember test --filter "system-settings input handlers"`): 2 tests, 0 pass, 2 fail, both at the first assertion, "ctrlActionEventValueBound is defined", actual `undefined`, expected `function`.

`app/frontend/tests/unit/controllers/system-settings-input-handlers-test.js`. For each controller it asserts that `ctrlActionEventValueBound` is a function, then invokes the handler with a fake input event and asserts the bound block or field changed and the others did not. The email-edit test also asserts `ctrlAction` and `ctrlActionNoBubble` survive the merge.

Weakest passing state: a handler defined but wired to the wrong action or the wrong target property. The value assertions catch that. Mutation that must fail: revert either controller change.

## Proposal

**Candidate A (chosen).**
- email-edit: delete the second `init()` (`:139-162`) and move `ctrlActionNoBubble` into the first.
- app-defaults: add a `ctrlActionEventValueBound` factory to its `init()`, identical to `email-edit.js:26-31` and `system-settings.js:46`.
- Smallest change that restores the handlers the templates already call.

**Candidate B.** Keep the second `init()` in email-edit and add `ctrlActionEventValueBound` to it. Equivalent; A keeps the handler where it was first written.

**Candidate C, rejected for now.** Extract the `ctrlAction*` factories into one shared utility. They are copied across at least five system-settings controllers, and Rule #0.6 favours extraction. But that touches every copy and widens the blast radius of a bug fix. Proposed as a follow-up.

**Candidate D, rejected.** Remove the broken modifier from the templates instead.
- The app-defaults inputs also carry `{{on "input" (set-field this "settings.app_name")}}`, so the value would still update.
- Correction from review: D is the NO-change option for production, where the dead modifier is already ignored and only `set-field` runs. Candidate A would add an `updateField` path production has never run.
- The email-edit i18n inputs have no second binding, so they need the handler.

## Risks

- app-defaults inputs will run both `updateField` and `set-field` on each keystroke. Both write the same value; the end state is the same.
- The committed test is a controller unit test; the render failure was confirmed separately, not by a committed rendering test of the route templates.

## Unresolved

- Answered by review: the consent fields worked until `8c9363c70` (2026-07-22), which replaced `<Textarea @value={{block.value}}>` with the handler call.
- Found by review: re-enabling consent-copy editing also re-enables a server-side risk. `normalize_i18n_overrides` does not validate `%{...}` placeholders, so an admin typo could make the consent email raise at send time; overrides also apply to every locale. Needs a decision before the email-edit fix ships.

## Outcome (applied after proposal review)

The review changed the approach; Candidate A was not applied as written.

- **email-edit:** one `init()` defining `ctrlAction` and `ctrlActionNoBubble`. The three consent fields use `{{on "input" (set-field block "value")}}`, writing in place as the pre-`8c9363c70` `<Textarea @value>` did. `updateI18nBlock` and email-edit's `ctrlActionEventValueBound` became unreachable and were removed (the eslint gate flagged the action as `lingolinq/no-orphaned-action`).
- **app-defaults:** Candidate D. The dead `ctrlActionEventValueBound` modifier was removed from five inputs; `set-field` already wrote the value, so production behaviour is unchanged. `updateField` became unreachable and was removed.
- **Server (Scot chose "fix editing + safety check"):** `SystemEmailTemplates.validate_i18n_placeholders!` rejects any `%{...}` or `%<...>` token that the block does not list in `SystemEmailRegistry`. The lists match every consent mailer view's interpolation keys (checked call by call). `update` returns 400; `preview` now rescues `ArgumentError` as 400 instead of a 500.

## Verification

- Ember (`--filter "system-settings"`): 3 of 3 pass. With the four app files reverted to `origin/develop`, both rendering tests fail. The controller test passes either way (it guards the Save and Preview factories, not this bug).
- Replacing the block object DOES drop focus: the PR review reproduced it in Ember 5.12 (unkeyed `{{#each}}`, `Object.assign` on input; the row element is replaced after one keystroke). My own mutation test could not show it, because in the rendering test the handler writes to the controller, not the rendered context. So the in-place write is load-bearing; `email-edit.hbs` now carries a comment saying so. (Corrected: an earlier draft said this claim was not confirmed.)
- RSpec: all 5 system-email spec files, 27 examples, 0 failures. The 4 new specs fail with `lib/` and the controller reverted to `origin/develop`.
- Broad run (every spec touching overrides or consent mailers, 1413 examples): 14 to 18 failures per run, varying run to run, in AuditEvent, premium-voice and log-summary specs. The 4 that appeared only with the fix pass in isolation both with and without it, so they are order-dependent flakes (orphaned test-DB rows), not regressions.
- `npm run lint:js:ci`: `findings=1596 baseline=1597 new=0` (the `no-dupe-keys` row is now stale). Template lint (`--no-clean-todo`) clean on both templates.

## Not covered

- Overrides apply to every locale, so an edited block goes out in the editor's language to all parents. Pre-existing; not changed here.
- The unreachable setup-wizard components and `stats/geo-disabled.hbs` also call an undefined `this.ctrlAction` (review finding; not reachable today).
- The `no-dupe-keys` error was grandfathered into `.eslint-todo` in `eec90591a` (#927); a gate that refuses to baseline always-a-bug rules is a follow-up.

## Second round (dual review of #1054)

- **The placeholder check had two holes (Codex, High x2; confirmed with `I18n.interpolate`):** `%{app_name|lowercase}` (the check split on `|`; I18n looks up the whole name) and `%<app_name>d` (`sprintf` on a string raises). The check now accepts only the exact `%{name}` form of a listed placeholder, rejects any `%<...>`, rejects `%%` in blocks the mailer does not interpolate (sent literally), and rejects keys that are not editable blocks. Errors name the field. Preview rescues only `SystemEmailTemplates::InvalidOverride` and `I18n::ArgumentError`. All 7 new or tightened specs fail against the first version.
- **Admins never saw the error (adversary, Medium):** the controllers read `err.error`, but the `$.ajax` wrapper rejects with `{fakeXHR, message, result}`. The new `utils/api_error_message.js` is used in email-edit (3 sites) and app-defaults (1). `features.js` (2 sites) is deferred: its import line shifted a grandfathered `.eslint-todo` row.
- **Test harness limit:** the app's `$.ajax` wrapper did not settle inside a unit test (a probe with a stubbed `$.realAjax` timed out at 4s), so the save-error test stubs `persistence.ajax` with a hand-written rejection matching `utils/extras.js`'s error branch. It fails against the old error read.
