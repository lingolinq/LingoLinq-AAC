# Efficient navigation guide

Shortest known paths for the four high-value tasks mapped in the
click-efficiency work. These match the **shortest** cases in
[`tests/click-efficiency.spec.ts`](../../tests/click-efficiency.spec.ts).

**How to use this guide**

- You must already be signed in. If not: open `/login`, fill **Username**
  and **Password**, then click **Sign In** (and **Trust this Device** if
  that screen appears).
- Replace `{username}` with your account name (seed user: `lingolinq`).
- Button and link names below are the English UI labels (or `aria-label`
  when the control is an icon).
- Deep-link URLs are the shortest route: they skip home-page cards. You
  can paste them into the address bar or bookmark them.

| Task | Shortest actions after landing | End state |
|------|--------------------------------|-----------|
| Speak a short message | 2 clicks | **Yes** in the sentence bar; board spoken |
| Create a blank board | 2 clicks + 1 name | New board open on board-detail |
| Add one symbol to a board | **blocked** — empty-cell save does not persist | — |
| Toggle a common preference | checkbox + Save Preferences | Pref saved; you leave Settings |

---

## Task: Speak a short message

Speak **Yes** on the seeded Yes/No board (`lingolinq/yesno`).

Most efficient path:
1. Open `/{username}/board-detail/yesno` (example: `/lingolinq/board-detail/yesno`) → 2. Tap the **Yes** symbol on the board grid → 3. Tap **Speak sentence** (microphone button in the sentence bar) → Spoken **Yes** on `/{username}/board-detail/yesno`

**What to look for**

- The board URL stays on `/{username}/board-detail/yesno` (speak/view, no `/edit`).
- After step 2, a **Yes** chip appears in the sentence bar
  (“Tap symbols to build your message” is replaced).
- **Speak sentence** is the mic icon at the right of that bar; its accessible
  name is **Speak sentence**.

**If you are already on home instead of using the URL:** click
**Continue Speaking** (or **Let's Communicate** / **Open my communication
board**), then **Yes**, then **Speak sentence**. That is the typical path,
not the shortest.

---

## Task: Create a blank board

Create an empty named board and land on it in speak/view.

Most efficient path:
1. Open `/create-board-new` → 2. Click **Create My Own Board** → 3. Type a name in **Name** (`#new_board_name`; placeholder “My Board”) → 4. Click **Create Board** → New board at `/{username}/board-detail/{board-slug}`

**What to look for**

- After step 1 you see “How would you like to create your board?”
- Leave rows/columns at the default (5×6) and leave cells empty for a
  blank board. **Description** is optional.
- **Create Board** appears at the top-right and in the footer; either
  works.
- Success: you land on `/{username}/board-detail/{slug}` (not `/edit`). Speak
  mode collapses the header, so the board name is not shown in the chrome.
  A blank board shows “This board hasn't been set up yet…” and **Edit this Board**.

**If you are already on home instead of using the URL:** click the
**Create a Board** card, then continue from step 2. That adds one extra
click.

---

## Task: Add one symbol to a board

**Blocked (2026-08).** Do not treat this path as working. Labeling an empty
cell, then **Done Editing** → **Save**, still lands on “hasn't been set up
yet.” Placeholder ids like `fake_0_0` are not handled by
`editManager.change_button` / `process_for_saving`. Playwright add-symbol
cases are `test.skip` in `click-efficiency.spec.ts`. See
[`docs/how-to/click-efficiency-findings.md`](../how-to/click-efficiency-findings.md).

Intended shortest path once fixed:
1. Open `/{username}/board-detail/{board-slug}/edit` → 2. Tap an empty (blank) cell on the symbol board → 3. If **Button Settings** opens on the **Help** tab, click **General** → 4. Type the word in **Label** (`#label`) → 5. Click **Close** → 6. Click **Done Editing** → 7. In the **SAVE AND EXIT** dialog, click **Save** → Labeled cell on `/{username}/board-detail/{board-slug}`

**What to look for (after the bug is fixed)**

- Step 1 must include `/edit` at the end. That skips **Options** →
  **Edit Board** (the typical path when the header is collapsed).
- Empty cells are the blank tiles on the grid (no label yet).
- The modal title is **Button Settings**. Accounts that have not skipped
  button help land on the **Help** tab; **Label** is on **General** and
  stays hidden until that tab is selected. Do not use “Skip this help
  in the future” unless you intend to change that account’s preference.
- Typing in **Label** applies immediately; you do not need a separate
  “apply” button.
- After **Save**, the URL drops `/edit` and the new label is visible on
  the speak/view board.

**If you are already viewing the board instead of using the `/edit` URL:**
click **Options**, then **Edit Board**, then continue from step 2.

---

## Task: Toggle a common preference

Turn **Start app in Speak Mode on launch** on or off (Basics section).

Most efficient path:
1. Open `/{username}/preferences` (example: `/lingolinq/preferences`) → 2. In the **Basics** section (already open), check or uncheck **Start app in Speak Mode on launch** (`#auto_open_speak_mode`, labeled **On Launch**) → 3. Click **Save Preferences** → Preference saved; you leave Settings

**What to look for**

- The page heading is **General Preferences**.
- **Basics** is expanded by default — do not hunt in **Styling** or other
  boxes for this control.
- After **Save Preferences**, the app navigates away from
  `/{username}/preferences`. Re-open that URL to confirm the checkbox
  stayed as you left it.

**If you are already on home instead of using the URL:** click **Settings**
in the navbar (gear; accessible name **Settings**), then continue from
step 2. That adds one extra click.

---

## Notes

- These paths assume the modern board-detail UI and a logged-in user who
  can edit the board (create / add-symbol) or edit their own preferences.
- Automated counterparts (typical vs shortest, with action counts) live in
  `tests/click-efficiency.spec.ts`.
- Deep links (`page.goto` / pasting a URL) are not counted as clicks in
  those tests; they model a bookmark or typed address.
