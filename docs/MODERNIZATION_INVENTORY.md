# Modernization Inventory

A snapshot of which pages and modals in the LingoLinq-AAC Ember frontend have been migrated to the modern design system, and which still use the legacy Bootstrap-era styling.

**Generated:** 2026-04-10
**Branch:** `traci/styling/styling-updates`

## How styles are classified

- **modern** — primary structure uses the new design system: `md-*` BEM classes (`md-shell`, `md-board-detail-*`, `md-card`, `md-workspace`, `md-hero`, etc.) and/or `ll-bento-*` for the dashboard layout system
- **legacy** — primary structure still uses Bootstrap classes: `btn btn-default`, `glyphicon-*`, `well`, `panel`, `form-group`, `modal-content`, `modal-dialog`, etc.
- **landing** — marketing/landing pages using the `la-*` prefix system (separate migration track from app UI)
- **partial / mixed** — substantial modernization layered on top of legacy structure
- **outlet** — parent route template that only renders `{{outlet}}`; no UI markup of its own

## Summary

| Category | Count | % |
|---|---:|---:|
| **Pages — modern** | 33 | 14.5% |
| **Pages — legacy** | 152 | 66.7% |
| **Pages — landing** | 9 | 3.9% |
| **Pages — outlet/empty** | 6 | 2.6% |
| **Pages — other (mixed/empty templates)** | 28 | 12.3% |
| **Pages — total** | 228 | 100% |
| **Modals — modern** | 1 | 2.6% |
| **Modals — legacy** | 36 | 94.7% |
| **Modals — infrastructure (Bootstrap wrappers)** | 2 | — |
| **Modals — landing** | 1 | — |
| **Modals — total** | 38 | — |

---

## Pages

| Route / Template | Path | Style | Notes |
|---|---|---|---|
| **Modern (33)** | | | |
| application | templates/application.hbs | modern | uses `md-pillnav` |
| beta-feedback-admin/entry | templates/beta-feedback-admin/entry.hbs | modern | `md-workspace` |
| beta-feedback-admin/index | templates/beta-feedback-admin/index.hbs | modern | `md-workspace` |
| beta-feedback | templates/beta-feedback.hbs | modern | `md-workspace` |
| board-details | templates/board-details.hbs | modern | `md-board-details-edit-btn-wrap` |
| board-layout | templates/board-layout.hbs | modern | `md-shell` |
| caseload | templates/caseload.hbs | modern | `md-shell` |
| download | templates/download.hbs | modern | `md-shell` |
| home-boards | templates/home-boards.hbs | modern | `md-shell` |
| offline_boards | templates/offline_boards.hbs | modern | `md-shell` |
| organization | templates/organization.hbs | modern | `md-shell` layout |
| organization/index | templates/organization/index.hbs | modern | `md-org-parent-badge`, `md-org-supervisees-link` |
| organization/people | templates/organization/people.hbs | modern | `md-org-parent-badge`, `md-people` |
| organization/reports | templates/organization/reports.hbs | modern | `md-org-report-controls` |
| organization/rooms | templates/organization/rooms.hbs | modern | `md-card` |
| organization/settings | templates/organization/settings.hbs | modern | `md-org-section-title` |
| search | templates/search.hbs | modern | `md-btn` |
| setup | templates/setup.hbs | modern | `md-shell md-shell--setup`, full modern hero |
| setup/intro | templates/setup/intro.hbs | modern | `md-card__head md-card__head--setup` |
| share-board | templates/share-board.hbs | modern | `md-modal-title` |
| support | templates/support.hbs | modern | `md-workspace` |
| troubleshooting | templates/troubleshooting.hbs | modern | `md-workspace` |
| user | templates/user.hbs | modern | `md-user-layout` |
| user/board-detail | templates/user/board-detail.hbs | modern | `md-shell md-shell--board-detail`, full `md-board-detail-*` |
| user/boards | templates/user/boards.hbs | modern | `md-shell md-shell--reports-view`, `md-pillnav--dashboard` |
| user/edit | templates/user/edit.hbs | modern | `md-edit-profile` |
| user/goals | templates/user/goals.hbs | modern | `md-goals` |
| user/index | templates/user/index.hbs | modern | `md-hero md-hero--dashboard` |
| user/logs | templates/user/logs.hbs | modern | `md-logs` |
| user/preferences | templates/user/preferences.hbs | modern | `md-preferences` |
| user/recordings | templates/user/recordings.hbs | modern | `md-recordings` |
| user/stats | templates/user/stats.hbs | modern | `md-shell` |
| user/subscription | templates/user/subscription.hbs | modern | `md-billing` |
| **Landing (9)** | | | |
| about | templates/about.hbs | landing | `la-wrapper la-wrapper--about` |
| contact | templates/contact.hbs | landing | `la-wrapper la-wrapper--contact` |
| faq | templates/faq.hbs | landing | `la-wrapper la-wrapper--faq` |
| features | templates/features.hbs | landing | `la-wrapper la-wrapper--features`, `la-hero-title` |
| forgot_password | templates/forgot_password.hbs | landing | `la-wrapper la-wrapper--forgot` |
| pricing | templates/pricing.hbs | landing | `la-wrapper la-wrapper--pricing` |
| privacy | templates/privacy.hbs | landing | `la-wrapper la-wrapper--privacy` |
| privacy_practices | templates/privacy_practices.hbs | landing | `la-wrapper` |
| terms | templates/terms.hbs | landing | `la-wrapper` |
| **Legacy (152)** | | | |
| add-app | templates/add-app.hbs | legacy | `glyphicon`, legacy modal system |
| add-integration | templates/add-integration.hbs | legacy | `btn btn-primary` |
| add-supervisor | templates/add-supervisor.hbs | legacy | legacy form groups |
| add-to-sidebar | templates/add-to-sidebar.hbs | legacy | `btn btn-primary` |
| add-tool | templates/add-tool.hbs | legacy | `btn btn-primary` |
| add-webhook | templates/add-webhook.hbs | legacy | `btn btn-primary` |
| aggreement-terms | templates/aggreement-terms.hbs | legacy | text-based legacy structure |
| ambassadors | templates/ambassadors.hbs | legacy | `class="row"`, bootstrap grid |
| approve-board-share | templates/approve-board-share.hbs | legacy | `btn btn-primary` |
| bad-privacy-settings | templates/bad-privacy-settings.hbs | legacy | `glyphicon` icons |
| badge-awarded | templates/badge-awarded.hbs | legacy | `glyphicon` |
| badge-image | templates/badge-image.hbs | legacy | `btn btn-default` |
| badge-in-list | templates/badge-in-list.hbs | legacy | inline styles, legacy |
| batch-recording | templates/batch-recording.hbs | legacy | `btn btn-default` |
| board-copies | templates/board-copies.hbs | legacy | `btn btn-default` |
| board-icon | templates/board-icon.hbs | legacy | `class="well"` |
| board-icon-without-link | templates/board-icon-without-link.hbs | legacy | `glyphicon` |
| board-preview | templates/board-preview.hbs | legacy | legacy component |
| board-stats | templates/board-stats.hbs | legacy | legacy modal-dialog wrapper |
| board/history | templates/board/history.hbs | legacy | `btn btn-default` |
| board/index | templates/board/index.hbs | legacy | `glyphicon`, legacy integration embed |
| brief | templates/brief.hbs | legacy | `btn btn-default` |
| bulk_purchase | templates/bulk_purchase.hbs | legacy | legacy purchase flow |
| button | templates/button.hbs | legacy | legacy button template |
| button-set | templates/button-set.hbs | legacy | legacy grid |
| button-settings | templates/button-settings.hbs | legacy | `btn btn-default`, legacy form |
| button-settings-action | templates/button-settings-action.hbs | legacy | legacy form |
| button-settings-extras | templates/button-settings-extras.hbs | legacy | legacy settings UI |
| button-settings-general | templates/button-settings-general.hbs | legacy | `form-group` |
| button-settings-help | templates/button-settings-help.hbs | legacy | legacy button config |
| button-settings-language | templates/button-settings-language.hbs | legacy | legacy settings |
| button-settings-picture | templates/button-settings-picture.hbs | legacy | legacy picture settings |
| button-settings-sound | templates/button-settings-sound.hbs | legacy | legacy sound settings |
| button-stash | templates/button-stash.hbs | legacy | legacy stash UI |
| button-suggestions | templates/button-suggestions.hbs | legacy | legacy suggestions |
| button-unbound | templates/button-unbound.hbs | legacy | legacy modal structure |
| compare | templates/compare.hbs | legacy | legacy comparison view |
| confirm-delete-board | templates/confirm-delete-board.hbs | legacy | legacy confirm |
| confirm-delete-goal | templates/confirm-delete-goal.hbs | legacy | legacy confirm |
| confirm-delete-integration | templates/confirm-delete-integration.hbs | legacy | legacy confirm |
| confirm-delete-logs | templates/confirm-delete-logs.hbs | legacy | legacy confirm |
| confirm-delete-sound | templates/confirm-delete-sound.hbs | legacy | legacy confirm |
| confirm-delete-unit | templates/confirm-delete-unit.hbs | legacy | legacy confirm |
| confirm-delete-webhook | templates/confirm-delete-webhook.hbs | legacy | legacy confirm |
| confirm-edit-board | templates/confirm-edit-board.hbs | legacy | legacy confirm |
| confirm-external-app | templates/confirm-external-app.hbs | legacy | legacy confirm |
| confirm-external-link | templates/confirm-external-link.hbs | legacy | legacy confirm |
| confirm-needs-copying | templates/confirm-needs-copying.hbs | legacy | legacy confirm |
| confirm-notify-user | templates/confirm-notify-user.hbs | legacy | `btn btn-primary` |
| confirm-remove-board | templates/confirm-remove-board.hbs | legacy | legacy confirm |
| confirm-set-home | templates/confirm-set-home.hbs | legacy | legacy confirm component |
| confirm-update-app | templates/confirm-update-app.hbs | legacy | legacy confirm |
| consent-response | templates/consent-response.hbs | legacy | legacy consent flow |
| copy-board | templates/copy-board.hbs | legacy | `btn btn-primary` |
| copying-board | templates/copying-board.hbs | legacy | legacy copying status |
| create-board | templates/create-board.hbs | legacy | `class="create-board-page"` |
| device-settings | templates/device-settings.hbs | legacy | legacy device config |
| download-board | templates/download-board.hbs | legacy | legacy download flow |
| download-log | templates/download-log.hbs | legacy | `btn btn-default` |
| edit-board-details | templates/edit-board-details.hbs | legacy | legacy board editor |
| edit-sound | templates/edit-sound.hbs | legacy | legacy sound editor |
| edit-unit | templates/edit-unit.hbs | legacy | `btn btn-default` |
| emergency | templates/emergency.hbs | legacy | legacy emergency boards view |
| enable-logging | templates/enable-logging.hbs | legacy | legacy logging setup |
| error | templates/error.hbs | mixed | inline styles, modern-ish design |
| find-button | templates/find-button.hbs | legacy | legacy modal |
| flash-message | templates/flash-message.hbs | legacy | legacy flash |
| footer | templates/footer.hbs | legacy | legacy footer |
| force-logout | templates/force-logout.hbs | legacy | empty/outlet only |
| forgot-login | templates/forgot-login.hbs | legacy | legacy form |
| getting-started | templates/getting-started.hbs | legacy | legacy getting started |
| gift_purchase | templates/gift_purchase.hbs | legacy | legacy purchase |
| goal_in_list | templates/goal_in_list.hbs | legacy | legacy goal list item |
| goals | templates/goals.hbs | legacy | legacy goals page |
| goals/goal | templates/goals/goal.hbs | legacy | `glyphicon` |
| goals/index | templates/goals/index.hbs | legacy | `class="well"` |
| highlight | templates/highlight.hbs | legacy | legacy highlight page |
| highlight2 | templates/highlight2.hbs | legacy | legacy highlight page |
| importing-boards | templates/importing-boards.hbs | legacy | legacy import modal |
| importing-recordings | templates/importing-recordings.hbs | legacy | legacy import modal |
| index/authenticated | templates/index/authenticated.hbs | legacy | legacy authenticated view |
| inline-book | templates/inline-book.hbs | legacy | `btn btn-default` |
| inline-video | templates/inline-video.hbs | legacy | legacy video embed |
| integration-details | templates/integration-details.hbs | legacy | legacy integration view |
| intro | templates/intro.hbs | legacy | legacy intro flow |
| jobs | templates/jobs.hbs | legacy | legacy jobs page |
| lesson | templates/lesson.hbs | legacy | legacy lesson template |
| login | templates/login.hbs | legacy | `{{login-form}}` |
| login/device | templates/login/device.hbs | legacy | `{{login-form deviceStep=true}}` |
| login/index | templates/login/index.hbs | legacy | legacy login form |
| modeling-intro | templates/modeling-intro.hbs | legacy | `btn btn-default` |
| modify-core-words | templates/modify-core-words.hbs | legacy | legacy word modification |
| new-board | templates/new-board.hbs | legacy | legacy board creation |
| new-goal | templates/new-goal.hbs | legacy | legacy goal creation |
| new-sound | templates/new-sound.hbs | legacy | legacy sound creation |
| new-user | templates/new-user.hbs | legacy | legacy user creation |
| partners | templates/partners.hbs | legacy | legacy partners page |
| pick-avatar | templates/pick-avatar.hbs | legacy | legacy avatar picker |
| premium-required | templates/premium-required.hbs | legacy | `btn btn-primary` |
| premium-voices | templates/premium-voices.hbs | legacy | legacy premium voices |
| profile | templates/profile.hbs | legacy | legacy profile page |
| purchase-board | templates/purchase-board.hbs | legacy | legacy purchase |
| quick-assessment | templates/quick-assessment.hbs | legacy | legacy assessment |
| record-note | templates/record-note.hbs | legacy | legacy note recording |
| redeem | templates/redeem.hbs | legacy | legacy redeem page |
| redeem_with_code | templates/redeem_with_code.hbs | legacy | legacy redeem flow |
| register | templates/register.hbs | legacy | uses `la-` for wrapper, legacy form |
| rename-board | templates/rename-board.hbs | legacy | legacy rename modal |
| save-snapshot | templates/save-snapshot.hbs | legacy | legacy snapshot save |
| set-as-home | templates/set-as-home.hbs | legacy | legacy home board setting |
| setup-footer | templates/setup-footer.hbs | legacy | legacy setup footer |
| setup/access | templates/setup/access.hbs | legacy | legacy setup step |
| setup/board_category | templates/setup/board_category.hbs | legacy | legacy setup step |
| setup/board_select | templates/setup/board_select.hbs | legacy | legacy setup step |
| setup/core | templates/setup/core.hbs | legacy | `col-sm-10 col-sm-offset-1` |
| setup/done | templates/setup/done.hbs | legacy | legacy setup completion |
| setup/extra-dashboard | templates/setup/extra-dashboard.hbs | legacy | legacy setup extra |
| setup/extra-done | templates/setup/extra-done.hbs | legacy | legacy setup completion |
| setup/extra-exit-speak-mode | templates/setup/extra-exit-speak-mode.hbs | legacy | legacy setup extra |
| setup/extra-folders | templates/setup/extra-folders.hbs | legacy | legacy setup extra |
| setup/extra-home-boards | templates/setup/extra-home-boards.hbs | legacy | legacy setup extra |
| setup/extra-logs | templates/setup/extra-logs.hbs | legacy | legacy setup extra |
| setup/extra-modeling | templates/setup/extra-modeling.hbs | legacy | legacy setup extra |
| setup/extra-reports | templates/setup/extra-reports.hbs | legacy | legacy setup extra |
| setup/extra-speak-mode | templates/setup/extra-speak-mode.hbs | legacy | legacy setup extra |
| setup/extra-supervisors | templates/setup/extra-supervisors.hbs | legacy | legacy setup extra |
| setup/home_boards | templates/setup/home_boards.hbs | legacy | legacy setup step |
| setup/logging | templates/setup/logging.hbs | legacy | legacy setup logging |
| setup/notifications | templates/setup/notifications.hbs | legacy | legacy setup notifications |
| setup/supervisors | templates/setup/supervisors.hbs | legacy | legacy setup supervisors |
| setup/symbols | templates/setup/symbols.hbs | legacy | legacy setup symbols |
| setup/usage | templates/setup/usage.hbs | legacy | legacy setup usage |
| setup/voice | templates/setup/voice.hbs | legacy | legacy setup voice |
| share-email | templates/share-email.hbs | legacy | legacy email share |
| share-utterance | templates/share-utterance.hbs | legacy | `btn btn-primary` |
| speak-menu | templates/speak-menu.hbs | legacy | legacy speak menu |
| speak-mode-intro | templates/speak-mode-intro.hbs | legacy | legacy speak mode intro |
| speak-mode-pin | templates/speak-mode-pin.hbs | legacy | legacy PIN entry |
| speech | templates/speech.hbs | legacy | legacy speech page |
| start_codes | templates/start_codes.hbs | legacy | legacy start codes |
| subscribe | templates/subscribe.hbs | legacy | legacy subscription |
| supervision-settings | templates/supervision-settings.hbs | legacy | legacy supervision settings |
| swap-images | templates/swap-images.hbs | legacy | legacy image swap |
| swap-or-drop-button | templates/swap-or-drop-button.hbs | legacy | legacy button swap |
| switch-communicators | templates/switch-communicators.hbs | legacy | legacy communicator switch |
| switch-languages | templates/switch-languages.hbs | legacy | legacy language switch |
| sync-details | templates/sync-details.hbs | legacy | legacy sync details |
| terms-agree | templates/terms-agree.hbs | legacy | legacy terms agreement |
| test-webhook | templates/test-webhook.hbs | legacy | legacy webhook testing |
| translation-select | templates/translation-select.hbs | legacy | legacy translation picker |
| trends | templates/trends.hbs | legacy | legacy trends view |
| user-results | templates/user-results.hbs | legacy | legacy user results |
| user/badges | templates/user/badges.hbs | legacy | `class="well"` |
| user/board-alt/index | templates/user/board-alt/index.hbs | legacy | legacy board alt view |
| user/board-detail/edit | templates/user/board-detail/edit.hbs | legacy | empty outlet only |
| user/board-detail/index | templates/user/board-detail/index.hbs | legacy | empty outlet only |
| user/confirm_registration | templates/user/confirm_registration.hbs | legacy | legacy registration confirmation |
| user/extras | templates/user/extras.hbs | legacy | legacy extras dashboard |
| user/focus | templates/user/focus.hbs | legacy | legacy focus page |
| user/goal | templates/user/goal.hbs | legacy | legacy goal page |
| user/history | templates/user/history.hbs | legacy | legacy history page |
| user/lessons | templates/user/lessons.hbs | legacy | legacy lessons page |
| user/log | templates/user/log.hbs | legacy | legacy log page |
| user/password_reset | templates/user/password_reset.hbs | legacy | legacy password reset |
| utterance | templates/utterance.hbs | legacy | legacy utterance |
| which-home | templates/which-home.hbs | legacy | legacy home picker |
| word-cloud | templates/word-cloud.hbs | legacy | `btn btn-default` |
| word-data | templates/word-data.hbs | legacy | legacy word data |
| **Outlet / empty (6)** | | | |
| board | templates/board.hbs | outlet | mostly outlet rendering |
| modern-dashboard/boards-new | templates/modern-dashboard/boards-new.hbs | outlet | empty — state set by parent |
| modern-dashboard/boards | templates/modern-dashboard/boards.hbs | outlet | empty — state set by parent |
| modern-dashboard/extras | templates/modern-dashboard/extras.hbs | outlet | empty — state set by parent |
| modern-dashboard/index | templates/modern-dashboard/index.hbs | outlet | empty — home tab state |
| modern-dashboard/supervisors | templates/modern-dashboard/supervisors.hbs | outlet | empty — state set by parent |

---

## Modals

| Modal name | Modern path | Legacy path | Active version | Notes |
|---|---|---|---|---|
| assessment-settings | — | templates/modals.legacy/assessment-settings.hbs | legacy | |
| assign-lesson | — | templates/modals.legacy/assign-lesson.hbs | legacy | |
| big-button | — | templates/modals.legacy/big-button.hbs | legacy | |
| board-actions | — | templates/modals.legacy/board-actions.hbs | legacy | |
| board-intro | — | templates/modals.legacy/board-intro.hbs | legacy | |
| board-privacy | — | templates/modals.legacy/board-privacy.hbs | legacy | |
| choose-locale | — | templates/modals.legacy/choose-locale.hbs | legacy | |
| confirm-delete-user | — | templates/modals.legacy/confirm-delete-user.hbs | legacy | |
| confirm-org-action | — | templates/modals.legacy/confirm-org-action.hbs | legacy | |
| confirm-remove-goal | — | templates/modals.legacy/confirm-remove-goal.hbs | legacy | |
| dashboard-supervisors | templates/components/dashboard-supervisors-modal.hbs | — | **modern** | The only fully modernized modal — `md-dashboard-supervisors-modal-wrap`, `md-supervisors-page`, `md-person` |
| eval-jump | — | templates/modals.legacy/eval-jump.hbs | legacy | |
| eval-status | — | templates/modals.legacy/eval-status.hbs | legacy | |
| external-device | — | templates/modals.legacy/external-device.hbs | legacy | |
| extra-colors | templates/components/extra-colors-modal.hbs | templates/modals.legacy/extra-colors.hbs | legacy | Component is just a wrapper around the legacy template |
| focus-words | — | templates/modals.legacy/focus-words.hbs | legacy | |
| gif | — | templates/modals.legacy/gif.hbs | legacy | |
| importing-logs | — | templates/modals.legacy/importing-logs.hbs | legacy | |
| inbox | — | templates/modals.legacy/inbox.hbs | legacy | |
| manual-log | — | templates/modals.legacy/manual-log.hbs | legacy | |
| masquerade | — | templates/modals.legacy/masquerade.hbs | legacy | |
| message-unit | — | templates/modals.legacy/message-unit.hbs | legacy | |
| modal-container (infra) | templates/components/modal-container.hbs | — | infrastructure | Renders the legacy modal system |
| modal-dialog (infra) | templates/components/modal-dialog.hbs | — | infrastructure | Wraps Bootstrap `modal-content`/`modal-dialog` |
| modeling-ideas | — | templates/modals.legacy/modeling-ideas.hbs | legacy | |
| note-templates | — | templates/modals.legacy/note-templates.hbs | legacy | |
| paint-level | — | templates/modals.legacy/paint-level.hbs | legacy | |
| phrases | — | templates/modals.legacy/phrases.hbs | legacy | |
| profiles | — | templates/modals.legacy/profiles.hbs | legacy | |
| program-nfc | — | templates/modals.legacy/program-nfc.hbs | legacy | |
| push_to_cloud | — | templates/modals.legacy/push_to_cloud.hbs | legacy | |
| remote-model | — | templates/modals.legacy/remote-model.hbs | legacy | |
| repairs | — | templates/modals.legacy/repairs.hbs | legacy | |
| request-supervisee | — | templates/modals.legacy/request-supervisee.hbs | legacy | |
| slice-locales | — | templates/modals.legacy/slice-locales.hbs | legacy | |
| start-codes | — | templates/modals.legacy/start-codes.hbs | legacy | |
| tag-board | — | templates/modals.legacy/tag-board.hbs | legacy | |
| timer | — | templates/modals.legacy/timer.hbs | legacy | |
| user-status | — | templates/modals.legacy/user-status.hbs | legacy | |
| valet-mode | — | templates/modals.legacy/valet-mode.hbs | legacy | |

---

## Patterns observed

### What's been modernized
- **User account pages**: `user/board-detail`, `user/boards`, `user/goals`, `user/logs`, `user/stats`, `user/edit`, `user/preferences`, `user/recordings`, `user/subscription`, `user/index` — all on the `md-shell` system
- **Organization management**: `organization/index`, `people`, `reports`, `rooms`, `settings` use `md-org-*` classes
- **Setup wizard parent**: `setup.hbs` and `setup/intro.hbs` are modern; the rest of the setup steps are legacy
- **Beta-feedback admin**, **support**, **troubleshooting**, **caseload**, **download**, **board-layout**, **home-boards**, **offline_boards**

### Legacy strongholds
- **Modals**: only 1 of 38 modernized; the modal infrastructure (`modal-dialog.hbs`, `modal-container.hbs`) still wraps everything in Bootstrap classes
- **Setup steps**: every step page (`setup/access`, `setup/voice`, `setup/core`, `setup/usage`, `setup/symbols`, `setup/done`, all `setup/extra-*`) is legacy despite the modern parent shell
- **Button settings**: tightly coupled cluster of ~10 templates (`button-settings*`) — modernizing one likely requires modernizing all
- **Confirm dialogs**: ~15 near-identical `confirm-*` templates that could be replaced with one modern confirm pattern
- **Goal pages**: `goals.hbs`, `goals/goal.hbs`, `goals/index.hbs` still use `class="well"`
- **Login / registration / purchase / subscription flows**: all legacy
- **Classic board pages**: `board/index`, `board/history`, `board.hbs` still use legacy markup; `board-alt` likewise. Only `board-detail` is modern.

### Other notes
- Landing pages use a separate `la-*` prefix system, distinct from both legacy and modern app styling. They are on their own migration track.
- The `modern-dashboard/*` routes are intentionally empty templates — the parent dashboard route manages all UI state.
