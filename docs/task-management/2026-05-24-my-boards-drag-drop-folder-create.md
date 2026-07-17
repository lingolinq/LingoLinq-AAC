# My Boards: drag a board card onto the Folders area to create a new folder

**Started:** 2026-05-24
**Branch:** traci/styling/styling-updates
**Status:** diagnosing (do not apply changes yet — Rule #0.4)

## Goal

On the My Boards page (`/u/<user>/boards`, rendered via
`components/available-boards-section`), the user should be able to drag
a board card out of the boards grid and drop it anywhere in the
folders strip to create a new folder containing that board.

Per Traci's clarification (2026-05-24): the intended end-behavior is to
**open the existing `modals/tag-board` modal pre-filled with the
dragged board** — the user then types a folder name and submits to
create the folder. Not a direct-create flow.

This has been attempted multiple times. Per Rule #0, diagnose first;
do not pile another guess on top.

## Symptom (confirmed with Traci 2026-05-24)

> Nothing — drag won't even start.

The board card never visibly lifts / shows the native drag-ghost
when the user starts dragging. Traci can't even test the drop
target because the drag itself never initiates.

## Code path (traced)

### Drop target — appears correct
[available-boards-section.hbs:52-54](app/frontend/app/templates/components/available-boards-section.hbs#L52-L54)
puts `{{on "dragover" emptyFolderDragOver}}` + `{{on "drop"
emptyFolderDrop}}` on the outer `.ub-boards-page__folders-section`
div. The empty-state `.ub-boards-page__folders-empty` repeats the
same handlers
([available-boards-section.hbs:149-152](app/frontend/app/templates/components/available-boards-section.hbs#L149-L152)).
The folder strip `.ub-boards-page__folder-strip` also wires them
([available-boards-section.hbs:418-420](app/frontend/app/templates/components/available-boards-section.hbs#L418-L420)),
with per-tag `folderDrop` handlers inside.

Handlers
([available-boards-section.js:157-285](app/frontend/app/components/available-boards-section.js#L157-L285))
call `preventDefault` on dragover, parse `text/plain` data on drop,
and either call `user.tag_board(...)` (existing folder) or
`modal.open('modals/tag-board', { board, user, boardChoices })`
(empty-section drop → create-new flow). All looks correct.

### Drag source — focus of investigation

[available-boards-section.hbs:584-588](app/frontend/app/templates/components/available-boards-section.hbs#L584-L588):
```hbs
<div
  class="ub-boards-page__board-item ... {{if (and this.boardsCtrl.mine_selected this.boardsCtrl.model.permissions.edit) "ub-boards-page__board-item--draggable"}} ..."
  draggable={{if (and this.boardsCtrl.mine_selected this.boardsCtrl.model.permissions.edit) "true" "false"}}
  {{on "dragstart" (action "boardDragStart" board.board)}}
>
```

`(and ...)` is the custom 2-arg helper at
[app/helpers/and.js:1-5](app/frontend/app/helpers/and.js#L1-L5) —
verified that it exists in this codebase and is used elsewhere
(subscribe.hbs, board-detail-grid.hbs). NOT broken like the
styling-recurring-problems doc #6 claims for the general case.

`boardDragStart`
([available-boards-section.js:235-245](app/frontend/app/components/available-boards-section.js#L235-L245))
sets `dataTransfer.setData('text/plain', boardId + '|' + sourceTag)` —
correct.

### What's nested INSIDE the draggable parent

`{{board-icon board=board onAction=...}}` renders
[templates/components/board-icon.hbs:31-134](app/frontend/app/templates/components/board-icon.hbs#L31-L134),
which produces this DOM inside the parent `.ub-boards-page__board-item`:

```
.ub-boards-page__board-item[draggable="true"]                ← parent (dragstart)
  ├─ <span class="board-item-home-badge">                    (when home board)
  ├─ <span class="board-item-heart">                         (when liked, pointer-events:none)
  ├─ <div class="btn simple_board_icon ...">                 ← board-icon root
  │    ├─ <span class="board-icon__lang-marker">             (pointer-events:none)
  │    ├─ <button class="info">PREVIEW</button>              ← REAL <button>
  │    ├─ <button class="board-icon__info">i + size</button> ← REAL <button>
  │    ├─ <div role="button" tabindex="0" class="board-icon__pick">  ← div, NOT button
  │    │    ├─ <img alt="" draggable="false">                ← img drag disabled
  │    │    ├─ <div class="name">
  │    │    └─ <div class="author">
  ├─ <button class="board_action">delete</button>            ← REAL <button>
```

## Hypotheses + status

### H1: `<button>` children suppress parent drag (Chrome quirk)
Real `<button>` elements inside the draggable parent will swallow
mousedown gestures — Chrome (and Webkit) treats form-control
mousedowns as "captured for the button" and the parent's
`draggable="true"` never gets a chance to start the drag.

The `.info` PREVIEW pill is a real `<button>`. So is the
`.board-icon__info` top-right chip. So is `.board_action` delete X.
These cover meaningful surface area of the card — particularly the
bottom-center PREVIEW pill. If Traci is grabbing anywhere near
those, drag is suppressed.

The author of board-icon already knew about this — see the comment
at board-icon.hbs:1-18 that explicitly cites this quirk and the
72a77dd1c commit that converted `.board-icon__pick` from a `<button>`
back to a `<div role="button">` for exactly this reason. But the
other two `<button>`s (`.info` PREVIEW, `.board-icon__info`) inside
the draggable area were NOT given the same treatment.

**Why this is the leading hypothesis:** the symptom "drag won't
even start" matches exactly. Drag starts when the user's mousedown
lands on a non-form-control descendant. The PREVIEW pill sits at the
visual center-bottom of every card; the info chip sits at the
top-right. If the user reflexively grabs the card body, they may be
landing on these.

**Verification needed:** confirm in-browser that mousedown on the
img/name area DOES initiate a drag, while mousedown on the PREVIEW
or info chip does NOT.

### H2: `draggable="true"` attribute not actually set
Possible if `(and mine_selected permissions.edit)` evaluates to false
because `mine_selected` is undefined on first render (the
`update_selected` observer hasn't fired yet). Once it flips to true,
Ember should re-render the attribute — but worth verifying.

**Verification needed:** inspect the live element in DevTools to
confirm `draggable="true"` is present after the page settles.

### H3: A capture-phase listener calls preventDefault on mousedown/dragstart
[available-boards-section.js:502-533](app/frontend/app/components/available-boards-section.js#L502-L533)
attaches a capture-phase `click` listener for click-outside-to-exit.
Only on `click`, not `mousedown` or `dragstart`. So this is NOT the
cause.

### H4: CSS `user-drag: none` on a child
Ruled out — the explicit comment at
[app.scss:54208-54231](app/frontend/app/styles/app.scss#L54208-L54231)
documents that this used to be the bug, and the rule was removed.
Grep confirms no `user-drag` anywhere in app.scss.

### H5: `(and ...)` helper undefined
Ruled out — custom helper exists at
[app/helpers/and.js](app/frontend/app/helpers/and.js) and is used
elsewhere (subscribe.hbs, board-detail-grid.hbs) successfully.

## Next step

Live browser inspection to confirm H1 (button-suppresses-drag).
Specifically:
1. Confirm `draggable="true"` is on the rendered `.ub-boards-page__board-item`.
2. Try dragging from the IMG area — does drag start?
3. Try dragging from the PREVIEW pill — does drag start?
4. Try dragging from the info chip (top-right) — does drag start?

If H1 is confirmed, the fix is to add `draggable="false"` on the
two `<button>`s inside the draggable area
(`.info` and `.board-icon__info`), so they defer drag-initiation to
the parent the same way the `<img>` already does.

## Evidence collected so far

- Branch: `traci/styling/styling-updates`, ahead of `origin/staging` by
  several commits including 72a77dd1c which already fixed the
  `.board-icon__pick` `<button>` → `<div role="button">` issue for
  the same reason H1 describes. Two more buttons need the same fix.
- Custom helper `and` exists at `app/helpers/and.js:1-5`.
- Drop handlers are wired correctly on the folders section and per-tag.
- Drag source DOM has `draggable={{if ... "true" "false"}}` and a
  `dragstart` handler. No CSS `user-drag` declared anywhere.

## Live test results (2026-05-24)

Traci inspected a board card in DevTools and tried the drag again:

1. **`draggable="true"` IS present** on the outer
   `.ub-boards-page__board-item` element.
   (Not on the inner `.ember-view` wrapper nor on the inner board card
   button — which is correct; only the outer container needs it.)
   → H2 ruled out. The attribute is rendered correctly.

2. **Drag now works** — Traci can drag the board card. She can't
   reproduce the "won't even start" symptom that prompted this task.

## What likely happened (best guess, NOT verified)

The frontend dev server (8184) hot-reloads on every Sass/JS change.
Between the time Traci experienced the broken state and the time we
inspected together, the most recent code (which already has the
72a77dd1c fix converting `.board-icon__pick` from `<button>` to
`<div role="button">`) probably finished compiling + the browser
picked up the fresh bundle. The original failure was likely
caused by an earlier mid-refactor state where `<button class="board-icon__pick">`
swallowed the drag gesture (Chrome quirk documented in
[board-icon.hbs:1-18](app/frontend/app/templates/components/board-icon.hbs#L1-L18)).

The commit history supports this:
- 0de5697ce introduced the buggy `<button class="board-icon__pick">`.
- 72a77dd1c reverted it to `<div role="button" class="board-icon__pick">`
  with an explicit comment citing the drag-suppression quirk.

If the bug returns, the most likely culprits are still:
- **H1 (residual):** The two remaining real `<button>`s inside the
  draggable parent (`.info` PREVIEW pill bottom-center,
  `.board-icon__info` top-right) — Traci's drag was working when she
  tested, but if she grabs directly on either of those buttons, drag
  may still silently fail. This is a smaller, narrower failure than
  the original symptom but still worth knowing.
- **Stale cache:** Hard-reload (Ctrl+Shift+R) busts cached app.css /
  app.js. See styling-recurring-problems.md #12 (the Rails-vs-Ember
  symlink case) for the related symptom.

## Decision

**No code change applied.** Per Rule #0.4 — diagnosis is incomplete
(can't reproduce the failure), so we do NOT apply a guess-fix on top.

**Next step if the bug returns:** capture (1) browser console output
during the failed drag attempt, (2) the rendered `draggable=` attr
at the moment of failure, (3) exactly where on the card the user
clicked. Reopen this log with that evidence and the right fix will
be obvious.
