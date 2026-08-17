# Modal Testing Guide

How to reach every modal **through the actual UI** — preferred for
end-to-end testing because each navigation path uses the real data
and real preconditions the modal was designed for.

A mock-data console fallback is at the bottom for cases where the
natural UI path is blocked (rare conditions, locked behind a feature
flag, etc.).

To close any modal: `modal.close()` in the dev console, or click the
modal's own close button.

---

## Modal checklist (124 total)

Tick each as you finish styling / testing. Generated from a sweep of
every `modal.open(...)` call site in the frontend codebase
(`app/frontend/app/`).

### Top-level modals (87)

- [x] `about-lingolinq`
- [x] `add-app`
- [ ] `add-integration`
- [ ] `add-supervisor`
- [ ] `add-to-sidebar`
- [ ] `add-tool`
- [ ] `add-webhook`
- [ ] `approve-board-share`
- [ ] `badge-awarded`
- [ ] `badge-image`
- [ ] `batch-recording`
- [ ] `board-copies`
- [ ] `board-details`
- [ ] `board-stats`
- [ ] `button-set`
- [ ] `button-settings`
- [ ] `button-stash`
- [ ] `button-suggestions`
- [ ] `cloud-extras`
- [ ] `confirm-delete-board`
- [ ] `confirm-delete-goal`
- [ ] `confirm-delete-integration`
- [ ] `confirm-delete-logs`
- [ ] `confirm-delete-sound`
- [ ] `confirm-delete-unit`
- [ ] `confirm-delete-webhook`
- [ ] `confirm-discard-changes`
- [ ] `confirm-edit-board`
- [ ] `confirm-external-app`
- [ ] `confirm-external-link`
- [ ] `confirm-needs-copying`
- [ ] `confirm-notify-user`
- [ ] `confirm-recolor-board`
- [ ] `confirm-remove-board`
- [ ] `confirm-update-app`
- [ ] `copy-board`
- [ ] `copying-board`
- [ ] `dashboard-supervisors-modal`
- [ ] `device-settings`
- [ ] `download-board`
- [ ] `download-log`
- [ ] `edit-board-details`
- [ ] `edit-sound`
- [ ] `edit-unit`
- [ ] `enable-logging`
- [ ] `find-button`
- [ ] `force-logout`
- [ ] `importing-boards`
- [ ] `importing-recordings`
- [ ] `inline-book`
- [ ] `inline-video`
- [ ] `integration-details`
- [ ] `intro`
- [ ] `modeling-intro`
- [ ] `modify-core-words`
- [ ] `new-board`
- [ ] `new-board-folder`
- [ ] `new-goal`
- [ ] `new-sound`
- [ ] `new-user`
- [ ] `pick-avatar`
- [ ] `premium-required`
- [ ] `premium-voices`
- [ ] `quick-assessment`
- [ ] `record-note`
- [ ] `rename-board`
- [ ] `save-snapshot`
- [ ] `set-as-home`
- [ ] `share-board`
- [ ] `share-email`
- [ ] `share-utterance`
- [ ] `sidebar-button-settings`
- [ ] `speak-menu`
- [ ] `speak-mode-intro`
- [ ] `speak-mode-pin`
- [ ] `subscribe`
- [ ] `supervision-settings`
- [ ] `support`
- [ ] `swap-images`
- [ ] `swap-or-drop-button`
- [ ] `switch-communicators`
- [ ] `switch-languages`
- [ ] `sync-details`
- [ ] `terms-agree`
- [ ] `test-webhook`
- [ ] `translation-select`
- [ ] `user-results`
- [ ] `voice-output`
- [ ] `which-home`
- [ ] `word-cloud`
- [ ] `word-data`

### `modals/` namespace (37)

- [ ] `modals/assessment-settings`
- [ ] `modals/assign-lesson`
- [ ] `modals/big-button`
- [ ] `modals/board-actions`
- [ ] `modals/board-intro`
- [ ] `modals/board-privacy`
- [ ] `modals/choose-locale`
- [ ] `modals/confirm-delete-user`
- [ ] `modals/confirm-org-action`
- [ ] `modals/confirm-remove-goal`
- [ ] `modals/eval-jump`
- [ ] `modals/eval-status`
- [ ] `modals/external-device`
- [ ] `modals/extra-colors`
- [ ] `modals/focus-words`
- [ ] `modals/gif`
- [ ] `modals/importing-logs`
- [ ] `modals/inbox`
- [ ] `modals/manual-log`
- [ ] `modals/masquerade`
- [ ] `modals/message-unit`
- [ ] `modals/modeling-ideas`
- [ ] `modals/note-templates`
- [ ] `modals/paint-level`
- [ ] `modals/phrases`
- [ ] `modals/profiles`
- [ ] `modals/program-nfc`
- [ ] `modals/push_to_cloud`
- [ ] `modals/remote-model`
- [ ] `modals/repairs`
- [ ] `modals/slice-locales`
- [ ] `modals/start-codes`
- [ ] `modals/tag-board`
- [ ] `modals/timer`
- [ ] `modals/user-status`
- [ ] `modals/valet-mode`

---

## How to find a modal you don't see listed

```bash
grep -rn "modal.open('NAME-HERE'" app/frontend/app/controllers app/frontend/app/components
```

That tells you the file and the action that triggers it. From the
file name you can usually identify the UI screen / button.

---

## Navigation paths

### Header / navbar / footer

| Modal | How to reach it |
|---|---|
| `about-lingolinq` | Footer → "About" link, or the LingoLinq logo on the demo page |
| `support` | Navbar (top right) → support icon (`?`) |
| `confirm-update-app` | Triggers automatically when an app update is detected |
| `force-logout` | Triggers automatically when the session token is invalidated |
| `terms-agree` | Triggers automatically on first login until terms are accepted |
| `subscribe` | Navbar / dashboard → "Upgrade" link, or anywhere `currently_premium` is enforced |

### Dashboard (`/`)

| Modal | How to reach it |
|---|---|
| `dashboard-supervisors-modal` | Dashboard → Supervisors card → "Manage" |
| `add-supervisor` | Supervisors modal → "Add Supervisor" button |
| `record-note` | Dashboard → caseload/supervisee menu → "New Note" |
| `quick-assessment` | Dashboard → caseload menu → "Quick Assessment" |
| `new-board` | Dashboard → Boards card → "New Board" |
| `new-goal` | Dashboard → Goals card → "New Goal" |
| `getting-started` | Dashboard → first-time visit shows it automatically; or click the eyebrow checklist if `setup_done` is false |
| `intro` | Auto-shown on first login if `show_intro` is true |
| `sync-details` | Dashboard → top-bar sync indicator (the spinning arrow) |
| `inline-video` | Dashboard / hero → "Watch demo" or any embedded video link |

### User profile (`/<user_name>`)

| Modal | How to reach it |
|---|---|
| `badge-awarded` | User page → click on a badge tile, OR triggers automatically when a badge is earned during use |
| `badge-image` | Goal/Badge editor → "Pick badge image" |
| `pick-avatar` | User page → Account → avatar → "Change Avatar" |
| `new-goal` | User page → Goals tab → "New Goal" |
| `confirm-delete-goal` | Goal page → "Delete" button |
| `enable-logging` | User page → Reports tab → "Enable Logging" prompt |
| `download-log` | Reports tab → log entry → "Download" |
| `modals/manual-log` | Reports tab → "Manual Log Entry" |
| `confirm-delete-logs` | Reports tab → "Delete logs" |
| `device-settings` | User page → Devices tab → device row |
| `add-app` | User page → Apps tab → "Add App" |
| `add-tool` | User page → Apps tab → "Browse Tools" |
| `premium-voices` | User page → Voices → "Premium Voices" |
| `voice-output` | User page → Voices → output device |
| `premium-required` | Triggered automatically wherever a premium-only feature is accessed by a non-premium user |

### User → Edit (`/<user_name>/edit`) — Integrations & Webhooks

| Modal | How to reach it |
|---|---|
| `add-integration` | User edit page → Integrations section → "Add Integration" |
| `integration-details` | User edit page → Integrations list → click a row (also opens automatically right after adding one) |
| `confirm-delete-integration` | Integration row → "Delete", or from the integration-details modal → "Delete" |
| `add-webhook` | User edit page → Webhooks section → "Add Webhook" |
| `test-webhook` | Webhooks list → row → "Test" button |
| `confirm-delete-webhook` | Webhooks list → row → "Delete" button |

### User → Recordings (`/<user_name>/recordings`)

| Modal | How to reach it |
|---|---|
| `edit-sound` | Recordings page → row → "Edit" |
| `confirm-delete-sound` | Recordings page → row → "Delete" |
| `new-sound` | Badge / sound settings → "Record new sound" |

### User → Preferences (sidebar editing)

| Modal | How to reach it |
|---|---|
| `sidebar-button-settings` | User preferences → Sidebar → click any sidebar entry to edit |

### Board page — view mode (`/<user>/board/<key>`)

| Modal | How to reach it |
|---|---|
| `board-details` | Board page → header info (`i`) icon → expanded info dropdown |
| `board-stats` | Board details → "Stats" tab |
| `board-copies` | Board details → "Copies" tab |
| `button-set` | Board details → "View Button Set" / button-set viewer (also opens during translate flow) |
| `share-board` | Board page → Details & Actions → Share |
| `download-board` | Board page → Details & Actions → Download |
| `copy-board` | Board page → Details & Actions → Copy |
| `set-as-home` | Board page → Details & Actions → Home |
| `add-to-sidebar` | Board page → Details & Actions → Sidebar |
| `find-button` | Board page → toolbar (search/filter icon) |
| `confirm-needs-copying` | Triggers when you try to edit a board you don't own |
| `confirm-set-home` | Triggers when changing home board to confirm |
| `confirm-delete-board` | Board details → "Delete" button |
| `confirm-remove-board` | Board details → "Remove" button (sub-board removal) |
| `approve-board-share` | Triggers automatically on a board that's been shared with you (if pending approval) |

### Board page — edit mode (top-right "Edit" toggles)

| Modal | How to reach it |
|---|---|
| `button-settings` | Edit mode → click any board button |
| `button-suggestions` | Edit toolbar → "Ideas" button |
| `button-stash` | Edit toolbar → "Stash" button |
| `confirm-discard-changes` | Edit mode → "Cancel" with unsaved changes |
| `edit-board-details` | Edit toolbar → board details → edit |
| `rename-board` | Board details → "Rename" |
| `confirm-recolor-board` | Edit toolbar → "Recolor" → confirm dialog |
| `modals/board-privacy` | Board details → privacy indicator pill (if you're the owner) |
| `modals/tag-board` | Board actions menu → "Tag" |
| `modals/slice-locales` | Board actions menu → "Slice Locales" (multi-locale boards) |
| `translation-select` | Board actions menu → "Translate" |
| `swap-images` | Board actions menu → "Swap Images" |
| `swap-or-drop-button` | Edit mode → drag a button onto another |
| `batch-recording` | Board actions menu → "Batch Recording" |
| `new-board-folder` | Edit toolbar → folder controls → "New Folder" |
| `modify-core-words` | Board actions → "Modify Core Words" |
| `confirm-edit-board` | Triggers on home boards before allowing edits |
| `save-snapshot` | Board actions → "Save Snapshot" |

### Speak mode

| Modal | How to reach it |
|---|---|
| `speak-mode-intro` | Triggers when entering Speak Mode for the first time |
| `speak-mode-pin` | Triggers when exiting Speak Mode (if a PIN is set) |
| `speak-menu` | Speak Mode → menu icon (gear / hamburger), or auto-triggers on inactivity timeout |
| `switch-communicators` | Speak Mode → header user-switcher |
| `switch-languages` | Speak Mode → header language-switcher |
| `share-utterance` | Speak Mode → utterance bar → share icon |
| `share-email` | Share-utterance → "Email" |
| `find-button` | Speak Mode → search icon |
| `modeling-intro` | First Speak-Mode-with-Modeling session |
| `modals/focus-words` | Speak Mode → focus-words tool |
| `modals/board-intro` | First time visiting a board in speak mode (intro splash) |
| `modals/board-actions` | Speak Mode → header → board actions sheet |
| `modals/eval-jump` | During a running evaluation → jump-to-section |
| `modals/eval-status` | During a running evaluation → status panel |
| `modals/assessment-settings` | Mid-assessment → "Settings" gear, or after the assessment ends → "Results" view (opened by `evaluation.modal.open` in `utils/eval.js`) |
| `modals/modeling-ideas` | Speak Mode → modeling tools menu |
| `modals/repairs` | Speak Mode → repairs panel |
| `modals/remote-model` | Speak Mode → remote-modeling button (org-managed sessions) |
| `modals/big-button` | Settings → accessibility → "Big Button mode" |
| `modals/timer` | Settings → accessibility → timer; or via assessment |
| `modals/paint-level` | Edit mode → paint controls (level mode) |
| `modals/program-nfc` | Settings → NFC programming |
| `modals/external-device` | Settings → external device pairing |

### Org / supervisor flows

| Modal | How to reach it |
|---|---|
| `supervision-settings` | User page → "Supervision Settings" |
| `request-supervision` | User page → "Request supervision" |
| `modals/request-supervisee` | Supervision settings → "Add supervisee" |
| `modals/confirm-delete-user` | Org admin → user list → delete |
| `modals/confirm-org-action` | Org page → various destructive actions (remove, transfer, etc.) |
| `confirm-notify-user` | Org → "Notify user" |
| `modals/inbox` | Org admin → inbox icon |
| `modals/message-unit` | Org admin → unit row → "Message" |
| `modals/masquerade` | Admin only → user row → "Masquerade as" |
| `modals/start-codes` | Org settings → "Start codes" |
| `modals/assign-lesson` | Caseload → student → "Assign lesson" |
| `modals/user-status` | Org → Room or Reports → user row → status indicator |
| `edit-unit` | Org → units list → edit |
| `confirm-delete-unit` | Org → Room → unit row → "Delete" |
| `new-user` | Org admin → People → "New User" / "Add User" button |
| `user-results` | Org admin → People → search → multiple results dialog |

### Settings / advanced

| Modal | How to reach it |
|---|---|
| `cloud-extras` | Settings → Cloud Extras section |
| `import-from-html` | Boards → "Import" → HTML option |
| `importing-boards` | Triggers automatically during a board import |
| `importing-recordings` | Triggers automatically during a batch-recording upload |
| `modals/importing-logs` | Triggers automatically during a log import |
| `generate-board` | Boards → "Generate (AI)" |
| `inline-book` | Click any inline book/article in dashboard tips |
| `modals/note-templates` | Record-note modal → "Templates" |
| `modals/phrases` | Speak mode → phrase library |
| `modals/profiles` | User page → Account → "Survey/Assessment profiles" |
| `modals/extra-colors` | Edit toolbar → paint → "Extra Colors" |
| `modals/gif` | Image search → "GIFs" tab |
| `modals/choose-locale` | First app load → locale picker (when undecided) |
| `modals/confirm-remove-goal` | Goal detail → "Remove" |
| `confirm-external-app` | Click any external-app launch link |
| `confirm-external-link` | Click any external link from a board button |
| `which-home` | Triggered when multiple home-board candidates exist |
| `limit-skin-tones` | Display Settings → Skin-Tones → mix variants → "Restrict tones" sub-option |
| `modals/eval-status` (eval) | Mid-evaluation → status panel |
| `modals/valet-mode` | Speak Mode → valet trigger (org-managed) |
| `modals/push_to_cloud` | Boards list → "Sync to cloud" |
| `word-data` | Word in board / phrase → "Word data" |
| `word-cloud` | Reports → "Word cloud" |

### Auto-triggered (no UI button)

These modals open in response to backend events or app state. To
test them, simulate the condition (e.g., have someone share a board
with your account for `approve-board-share`).

- `approve-board-share` — when a pending share is detected on a board you visit
- `force-logout` — when session is invalidated
- `confirm-update-app` — when a new app version is downloaded
- `terms-agree` — until terms are accepted
- `importing-*` — during the relevant import flow
- `copying-board` — during a board copy operation

---

## Mock-data console fallback

If the natural UI path is blocked or you need to repeatedly test a
single modal in isolation, paste this once and use the commands below.

```js
// === Mock fixtures — paste once ===
window.MOCK = {
  earnedBadge: { id: 1, name: 'First Steps', image_url: '/images/badge-fallback.png',
                 earned: new Date(), level: 1, completion_explanation: 'Pick 5 buttons in a row' },
  pendingBadge: { id: 2, name: 'Persistent Communicator', image_url: '/images/badge-fallback.png',
                  earned: null, progress: 0.4, progress_out_of_100: 40,
                  progress_style: 'width: 40%; background: linear-gradient(135deg, #2A9D8F, #4C86D8);',
                  time_left: '3 days left' },
  user:   { id: 'self', user_name: 'example', name: 'Example Communicator',
            avatar_url_with_fallback: '/avatars/avatar-0.png' },
  board:  { id: 'demo_board_1', key: 'example/keyboard', name: 'Keyboard',
            public: false, permissions: { edit: true, delete: true, share: true } },
  button: { id: 'btn_1', label: 'hello', image_url: null, sound_url: null }
};
```

```js
// Common visual-test invocations
modal.open('badge-awarded',         { badge: MOCK.earnedBadge });
modal.open('badge-awarded',         { badge: MOCK.pendingBadge });
modal.open('badge-awarded',         { user: MOCK.user, user_goals_and_badges: true });
modal.open('board-details',         { board: MOCK.board });
modal.open('share-board',           { board: MOCK.board });
modal.open('button-settings',       { button: MOCK.button, board: MOCK.board });
modal.open('approve-board-share',   { board: MOCK.board, shares: [{ user_name: 'someone_else' }] });
modal.open('quick-assessment',      { user: MOCK.user });
modal.open('record-note',           { user: MOCK.user });
modal.open('new-goal',              { user: MOCK.user });
modal.open('add-supervisor',        { user: MOCK.user });
modal.open('add-to-sidebar',        { board: MOCK.board });
modal.open('modals/board-privacy',  { board: MOCK.board, button_set: null });
```

---

## Seeded test users (from `db/seeds.rb`)

| Username | Role | Password source |
|---|---|---|
| `example` | Basic example communicator | `SEED_EXAMPLE_PASSWORD` |
| `lingolinq_admin` | Site administrator | `SEED_ADMIN_PASSWORD` |
| `sarah_chen_slp` / `marcus_williams_slp` / `elena_rodriguez_slp` | SLP supervisors | `SEED_DEMO_PASSWORD` |
| `aiden_parker`, `bella_martinez`, `charlie_kim`, `daisy_johnson`, … | Demo students | `SEED_DEMO_PASSWORD` |

Passwords are not listed here on purpose. Each comes from the environment
variable above; `seed_password` (`db/seeds.rb`) falls back to a fixed local
default in development and test only, and raises in production and staging
rather than seeding a known credential. For the local defaults, read
`db/seeds.rb`. For any deployed environment, read the value from that
environment's secret store.

`lingolinq_admin` is a break-glass site administrator, not a login for daily
use. Site admin is granted per-person by adding that person as a full manager
of the admin organization.

Log in as a supervisor to reach supervisee-related modals
(`dashboard-supervisors-modal`, `add-supervisor`, `record-note`,
`quick-assessment`, etc.) — they're hidden until the user has at
least one supervisee linked. Log in as a student / communicator
(`example`, `aiden_parker`, etc.) to test board / goal / badge
flows against a populated account.

---

## Notes

- `subscribe` and `terms-agree` are uncloseable — use `modal.close()` or refresh.
- `force-logout` has no close button (intentional — forces re-login).
- `big-button` and `timer` are full-screen interactive modals with no header (intentional).
