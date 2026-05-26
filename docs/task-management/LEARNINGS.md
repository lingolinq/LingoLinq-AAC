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
- [Pattern: `organizations.admin` is a singleton boolean, not a normal flag](#pattern-organizationsadmin-is-a-singleton-boolean-not-a-normal-flag)

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

## Pattern: `organizations.admin` is a singleton boolean, not a normal flag

**Surface:** scripts or seeds that create demo/admin `Organization` rows by hard-coding `admin: true` or `admin: false`.

**Symptom:** Postgres raises `PG::UniqueViolation` on `index_organizations_on_admin`, often with `Key (admin)=(f) already exists` or `Key (admin)=(t) already exists`.

**Root cause:** `db/schema.rb` defines a unique index on `organizations.admin`, so this column behaves like a two-slot singleton marker, not a reusable boolean category. In practice the repo treats `admin: true` as the site admin org and `admin: false` as the demo district org; additional organizations should generally leave `admin` as `NULL`.

**Fix recipe:**

1. Reuse the singleton row with `Organization.find_by(admin: true/false) || Organization.new` instead of blindly inserting a new record.
2. If the script also grants premium supervisors, make sure the org settings include `total_supervisor_licenses`; otherwise `Organization#add_supervisor(..., premium=true)` will raise even after the unique-index issue is fixed.
3. For rerunnable setup scripts, guard relationship grants such as `add_supervisor` with `supervisor?(user)` or the appropriate membership check.

**Evidence:** `db/schema.rb` unique index on `organizations.admin`, `db/seeds.rb` reuse pattern for `admin: false`, and `scripts/create_users.rb` fix on 2026-05-26.

**First seen in:** [2026-05-26-create-users-demo-org-reuse.md](./2026-05-26-create-users-demo-org-reuse.md)

---

## Pattern: duplicate selectors in `app.scss` can leave stale layout constraints active

**Surface:** large page-specific layout bugs where a component appears to ignore the "current" style block in `app/frontend/app/styles/app.scss`.

**Symptom:** the rendered page keeps an old width, margin, or sizing behavior even though a later selector with the same name looks correct.

**Root cause:** `app.scss` is large enough that the same selector can be defined twice in distant sections. If the earlier block sets a layout property like `width`, a later duplicate block that restyles typography but does not reset that property will still inherit the earlier constraint.

**Fix recipe:** search for all occurrences of the selector before patching, then remove or update the original authoritative rule instead of stacking on a more specific override. For the beta feedback inbox, the first `.la-beta-feedback-admin__body` block set `width: 160px`, while the later block only changed text styles.

**Evidence:** `app/frontend/app/styles/app.scss` duplicate `.la-beta-feedback-admin__body` blocks found on 2026-05-26.

**First seen in:** [2026-05-26-beta-feedback-admin-table-width.md](./2026-05-26-beta-feedback-admin-table-width.md)
