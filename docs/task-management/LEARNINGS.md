# Learnings

Durable patterns, root-cause families, and codebase gotchas distilled from
completed tasks. Skim this before starting any new task; append to it on
successful completion of one. Per-task working logs live alongside this
file (see [README.md](README.md)).

> Keep entries short and self-contained. One paragraph + a code/file
> reference is usually right. If something grows past a few paragraphs,
> move it to its own doc and link to it here.

## Index

- [Pattern: HTML5 drag-and-drop suppressed by nested `<button>` children](#pattern-html5-drag-and-drop-suppressed-by-nested-button-children)
- [Pattern: "It's broken" symptoms that vanish on re-test = stale Ember dev bundle](#pattern-its-broken-symptoms-that-vanish-on-re-test--stale-ember-dev-bundle)
- [Pattern: RESERVED_ROUTES blocks intended system usernames in seeds](#pattern-reserved_routes-blocks-intended-system-usernames-in-seeds)
- [Pattern: create-board-new preview URLs stripped by process_buttons whitelist](#pattern-create-board-new-preview-urls-stripped-by-process_buttons-whitelist)

---

## Pattern: HTML5 drag-and-drop suppressed by nested `<button>` children

**Surface:** any tile that wraps an interactive card in
`<div draggable="true">` — most prominently the board cards on
`/u/<user>/boards` and inside the My Boards picker.

**Symptom:** The user starts a drag from a board card and **nothing
happens** — no drag-ghost, no `dragstart` event, the cursor just stays
as the grab cursor. Drop targets are correctly wired, but the drag
itself never initiates.

**Root cause:** In Chrome/Webkit, a `mousedown` that lands on a real
`<button>` descendant of a `draggable="true"` parent is treated as a
form-control gesture-capture and **never escalates to the parent's
drag-initiation**. The parent's `dragstart` handler never fires.
Native `<img>` has the inverse problem (it tries to drag itself);
that's solved separately with `draggable="false"` on the img.

**Fix recipe:**

1. The card-body click target (the area the user grabs) should be a
   `<div role="button" tabindex="0">` with a keydown handler that maps
   Enter/Space to the same action — NOT a real `<button>`. See
   `templates/components/board-icon.hbs:31-36` and the explicit
   comment block above it.
2. Any `<img>` inside the draggable card must have `draggable="false"`
   (see board-icon.hbs:110, 112).
3. **Do NOT** use CSS `-webkit-user-drag: none` on inner children to
   try to "let the parent take the drag". That's a known Chrome quirk:
   user-drag:none on a child blocks the BROWSER's drag initiation on
   any ancestor too. The right tool is the HTML `draggable="false"`
   attribute, not CSS. See the comment at `app.scss:54208-54231`.
4. Remaining real `<button>` chrome elements absolutely-positioned on
   top of the card (e.g. `.info` PREVIEW pill, `.board-icon__info`
   chip, `.board_action` delete X) will still suppress drag if the
   user happens to grab directly on them. They're small targets so
   most drags initiate fine, but if you ever extend a button's surface
   area, give it `draggable="false"` as well.

**Evidence:** commits 0de5697ce (introduced the regression by making
`.board-icon__pick` a real `<button>` for WCAG) and 72a77dd1c
(reverted it to `<div role="button">` with an inline comment
documenting the Chrome quirk).

**First seen in:** [2026-05-24-my-boards-drag-drop-folder-create.md](./2026-05-24-my-boards-drag-drop-folder-create.md)

---

## Pattern: "It's broken" symptoms that vanish on re-test = stale Ember dev bundle

**Surface:** Any frontend bug reported on `localhost:8184` (Ember dev
server) that suddenly works when you re-test without changing code.

**Symptom:** A feature behaves wrong, user reports it, you investigate,
and by the time you ask them to verify a specific repro detail the
problem has self-resolved.

**Root cause:** The Ember CLI dev server (`ember serve`) rebuilds
incrementally on each save, but mid-refactor commits can leave the
served bundle temporarily inconsistent with the source tree. The
browser sees the stale bundle until the next compile pass settles AND
the page is reloaded (or hot-reload picks up the new bundle). Cached
app.css / app.js exacerbate this — a hard-reload (Ctrl+Shift+R) shakes
it loose. The Rails server on `:5000` has a related issue with stale
symlinks; see styling-recurring-problems.md #12.

**Fix recipe (in order):**

1. Before investigating, ask the user to hard-reload (Ctrl+Shift+R) and
   verify the symptom persists.
2. If it still repros, capture concrete evidence at the moment of
   failure: the rendered DOM attribute, the browser console, the exact
   click location. Per Rule #0.1, don't fix without evidence — and a
   self-resolving symptom is the loudest possible signal that the
   "fix" is unnecessary.
3. If it doesn't repro, document the working state, note the suspected
   stale-cache cause, and move on. Don't apply a precautionary fix on
   top of a working system.

**First seen in:** [2026-05-24-my-boards-drag-drop-folder-create.md](./2026-05-24-my-boards-drag-drop-folder-create.md)

---

## Pattern: RESERVED_ROUTES blocks intended system usernames in seeds

**Surface:** `db/seeds.rb` creating users with `User.process_new`, especially the official `lingolinq` vocabulary account.

**Symptom:** Seed creates `lingolinq_1` instead of `lingolinq`; re-running seeds creates duplicate users because `User.find_by(user_name: 'lingolinq')` never matches. Default sidebar board key `lingolinq/yesno` never resolves.

**Root cause:** `LingoLinq::RESERVED_ROUTES` (`config/routes.rb`) is checked in `Processable#generate_unique_key`; reserved names get suffixed. The `example` seed user works because `example` is not reserved.

**Fix:** Remove the username from `RESERVED_ROUTES` only when no dedicated app route needs that path (there is no `get 'lingolinq'` — `/lingolinq` is handled by the generic user profile route). Harden seeds with email fallback and `rename_to` for legacy `lingolinq_*` accounts.

**First seen in:** [2026-05-26-lingolinq-seed-username.md](./2026-05-26-lingolinq-seed-username.md)

---

## Pattern: create-board-new preview URLs stripped by process_buttons whitelist

**Surface:** AI board creation on `/create-board-new` — preview shows OpenSymbols images but saved board has none.

**Symptom:** Preview grid renders `<img src="https://opensymbols...">` from client `_label_images` cache; after Create, buttons have labels but no symbols.

**Root cause:** `saveBoard` bakes `image_url` onto `model.buttons[]`, but `Board#process_buttons` `.slice(...)` whitelist drops `image_url` before `before_save :process_client_supplied_images` runs. `process_suggested_symbols` only ran for `@buttons_changed == 'populated_from_labels'`, not client-baked buttons.

**Fix:** Stash `image_url` by button id in `process_buttons` before slice; consume in `process_client_supplied_images`. Fallback `process_suggested_symbols` for `@brand_new` boards still missing `image_id`.

**First seen in:** [2026-05-26-ai-board-preview-images-phase1.md](./2026-05-26-ai-board-preview-images-phase1.md)
