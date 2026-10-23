# `safe(..., 'stripped')` turned entity text back into markup

Found during the independent review of #1183 (crass 1.0.8).

**Read path.** `{{safe goal.high_level_description "stripped"}}` at `app/frontend/app/templates/goals/index.hbs:23`, `:64` and `app/frontend/app/components/new-goal.hbs:142`, through `app/frontend/app/helpers/safe.js:5` to `templateHelpers.safe` (`app/frontend/app/utils/template_helpers.js:112`). `high_level_description` is the goal's `sequence_description` or `description` (`app/frontend/app/models/goal.js:261-265`), stored after `Processable#process_html` (RELAXED). These are the only three `stripped` callers.

**Mechanism.** RELAXED keeps typed `&lt;b ...&gt;` as entity text. The stripped branch took `DOMParser` `body.textContent`, which decodes entities, and returned it `htmlSafe`, so Glimmer inserted the decoded text as live markup. Nothing sanitizes between the server and the render (`lib/json_api/goal.rb:33-35`, `:44-46`), and the CSP is report-only.

**Who can write and see it.** Writers: anyone with `edit` on the goal (the owner, the owner's editors, unit editors, admin-org managers; `app/models/user_goal.rb:19-28`). Setting `template_header` is admin-only (`user_goal.rb:389`). Viewers: the template list is served without a token (`app/controllers/api/goals_controller.rb:2-7`), so the goals template index is public; the new-goal picker is used by supervisors.

**Fix.** Return the stripped text as a plain string; Glimmer escapes it. The default (non-stripped) mode is unchanged. Visible change: text with a literal `<` (e.g. `x<y`) now shows in full instead of losing everything after the `<`, matching the detail view.

**Red/green and mutants** (`tests/integration/helpers/safe-test.js`, Node 22, filtered run):
- before the fix: "stripped mode does not turn entity text back into markup" fails (`#safe-stripped-xss` exists);
- with the fix: 3/3 pass, and the existing `i18n safe` unit tests pass 2/2;
- mutants `return htmlSafe(stripped)`, `return str`, `return htmlSafe(str)` each fail at least one of the three tests.
