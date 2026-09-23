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
- The only other writer in the app is the parent `controllers/system-settings.js:46`, on a different controller instance. It is not visible to the child templates' `this`. CONFIRMED by grep.
- `has_i18n_blocks` is true for the six parental-consent templates (`lib/system_email_registry.rb:146-206`; set by `app/controllers/api/system_email_templates_controller.rb:129-133`). CONFIRMED.

**(c) Cross-file claims**

- The two `ctrlAction` bodies in email-edit (`:14-25` and `:142-153`) are identical. CONFIRMED with `diff`.
- The target actions exist: `updateI18nBlock` (`email-edit.js:170`) and `updateField` (`app-defaults.js:55`). CONFIRMED.
- The email-edit template does not use `ctrlActionNoBubble`. CONFIRMED by grep.
- Rendering `{{on "input" (this.missing ...)}}` with `missing` undefined fails the render in Ember 5.12. CONFIRMED by a throwaway rendering test (deleted afterwards): "global failure: TypeError: Cannot read properties of undefined (reading 'bind')" at `OnModifierState.updateListener`. So app-defaults fails whenever its fields render, and email-edit fails whenever the i18n block list renders (parental-consent templates).
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
- But `updateField` replaces `settings` with a copy while `set-field` mutates in place, which is a behaviour difference.
- The email-edit i18n inputs have no second binding, so they need the handler.

## Risks

- app-defaults inputs will run both `updateField` and `set-field` on each keystroke. Both write the same value; the end state is the same.
- The committed test is a controller unit test; the render failure was confirmed separately, not by a committed rendering test of the route templates.

## Unresolved

- Whether these pages were ever usable since `9aa0007c0` (2026-07-17). No test covered them.
