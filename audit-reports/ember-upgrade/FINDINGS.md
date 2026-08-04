# LingoLinq-AAC Findings Register

> Generated from `audit-reports/FINDINGS.json` by `scripts/citation-check.rb --render`.
> Do not hand-edit; edit the JSON (the source of truth) and re-render.

**Audited:** `staging` @ `b5fd83fd22da7fe6ad1634ccfd62d7f44c55f00a` on 2026-07-29  
**Seed:**   
**Headline (open + remediated-unverified):** 0 Critical / 1 High

Statuses are verified against live code at the audited SHA, not copied from the dated report prose. Only Scot closes a finding, downgrades severity, accepts risk, or sets a disposition. Disposition (triage) is orthogonal to status: a finding can be `open` yet `dismissed-false-positive`/`wontfix`/`accepted`; blank reads as `untriaged`.

## Open (8)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-bd7745db40 |  | high |  | untriaged | audit-run | Button Settings lost the per-button "Show only text (as large as fits)" checkbox in the Ember 5.12 tab-template consolidation; model.text_only is still persisted server-side but no longer settable from any UI | `app/frontend/app/components/button-settings.hbs`:292 |
| LL-64cd8cc85a |  | medium |  | untriaged | audit-run | Button Settings lost all three TarHeel book option checkboxes (book.popup / book.speech / book.utterance) in the Ember 5.12 consolidation, leaving a live bookChanged observer syncing a model no UI can edit | `app/frontend/app/components/button-settings.js`:347 |
| LL-7a992d1782 |  | medium |  | untriaged | audit-run | Button Settings lost the per-button skin-tone control (model.no_skin) in the Ember 5.12 consolidation; the property is now only ever set automatically when copying a button, never by an author | `app/frontend/app/utils/edit_manager.js`:2197 |
| LL-02e3d2c875 |  | medium |  | untriaged | audit-run | Button Settings lost the 'Require menu action to return from linked board' checkbox (model.meta_home) in the Ember 5.12 consolidation; it can now only be inherited on copy, never set | `app/frontend/app/utils/edit_manager.js`:2257 |
| LL-ae11e67651 |  | low |  | untriaged | audit-run | Router-class on('didTransition') GA pageview handler never fires in Ember 5.12 | `app/frontend/app/router.js`:36 |
| LL-fadeb0e5fc |  | low |  | untriaged | audit-run | @babel/core peer and directly-referenced @babel transform plugins undeclared in package.json (satisfied only by hoisting) | `app/frontend/ember-cli-build.js`:8 |
| LL-44aae2db6b |  | low |  | untriaged | audit-run | No deprecation surfacing (ember-cli-deprecation-workflow / RAISE_ON_DEPRECATION) despite EXTEND_PROTOTYPES:false and 6.0 trajectory | `app/frontend/config/environment.js`:14 |
| LL-e5ecce96ee |  | low |  | untriaged | audit-run | No regression tests over the migration-doc Class 1-4 fixed paths; no @ember/test-waiters despite fetch-heavy sync | `app/frontend/tests/test-helper.js`:59 |

## Verified closed (12)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-da717dd8d6 |  | high |  | untriaged | audit-run | Masquerade confirm checkbox uses bare type="checkbox" on <Input>; @checked never binds so Continue is permanently inert | `app/frontend/app/components/masquerade.hbs`:19 |
| LL-f95415c037 |  | high |  | untriaged | audit-run | Textarea @value bound to get-only computed substitution_string crashes on keystroke | `app/frontend/app/templates/user/preferences.hbs`:1080 |
| LL-8375546f44 |  | high |  | untriaged | audit-run | session service not injected in user/subscription controller; Cancel-Subscription control replaced by a login form for authenticated users | `app/frontend/app/templates/user/subscription.hbs`:110 |
| LL-43c3d11094 |  | medium |  | untriaged | audit-run | Focus-words 'Save for Re-Use' checkbox uses bare type="checkbox" on <Input>; toggle is inert and reuse never saves | `app/frontend/app/components/focus-words.hbs`:276 |
| LL-ed9a5c4c56 |  | medium |  | untriaged | audit-run | Input checkbox uses HTML type= without @type; renders as text field and drops @checked binding | `app/frontend/app/templates/organization/extras.hbs`:192 |
| LL-1210143556 |  | low |  | untriaged | audit-run | {{action}} modifier still used in register.hbs (deprecated RFC 1006, removed in 6.0) | `app/frontend/app/templates/register.hbs`:32 |
| LL-dbf4c804c6 |  | low |  | untriaged | audit-run | Input type="date" passed as HTML attr (no @type); renders as plain text field | `app/frontend/app/templates/organization/subscription.hbs`:32 |
| LL-cd434e144a |  | low |  | untriaged | audit-run | Input type="date" passed as HTML attr (no @type) on gift-expiry field; renders as plain text field | `app/frontend/app/templates/organization/extras.hbs`:217 |
| LL-a354d658c9 |  | low |  | untriaged | audit-run | Input type="number" passed as HTML attr (no @type) on goal-duration field; renders as plain text field | `app/frontend/app/templates/goals/goal.hbs`:134 |
| LL-072eacb9e4 |  | low |  | untriaged | audit-run | Input type="date" passed as HTML attr (no @type) on board-history rollback field; renders as plain text field | `app/frontend/app/templates/board/history.hbs`:17 |
| LL-8c1c30bc35 |  | low |  | untriaged | audit-run | Input type="number" passed as HTML attr (no @type) on user-edit fields; renders as plain text field | `app/frontend/app/templates/user/edit.hbs`:82 |
| LL-63aa8f9e68 |  | low |  | untriaged | audit-run | session service not injected across user/* controllers; premium/access-denied gate shows the not-logged-in branch to authenticated users | `app/frontend/app/templates/user/logs.hbs`:170 |

---

_20 findings total. Re-run `ruby scripts/citation-check.rb` to validate every active citation._
