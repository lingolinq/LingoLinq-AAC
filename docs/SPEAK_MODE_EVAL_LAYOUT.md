# Speak mode header and evaluation boards

This document maps the **canonical** speak-mode DOM, CSS anchors, layout math, and eval-specific behavior so future header refactors do not break `obf/eval*` boards.

## Canonical DOM (source of truth)

The live template is **[`app/frontend/app/templates/application.hbs`](../app/frontend/app/templates/application.hbs)**. Speak mode renders only when `app_state.speak_mode` is true.

```
#within_ember
  header.row.new_index.speaking…
    #inner_header
      #speak                          ← flex row; eval toolbar and sentence strip live here
        .speak-header__home-marker    ← #home_button (board picker on board routes, or home)
        #back_button?                 ← optional
        .speak-bar__eval-actions      ← only when eval_mode (keys matching ^obf/eval)
        .speak-bar__button-list-wrap
          #button_list
          #speak_options?             ← hidden during eval_mode
        …
        #backspace_button, #clear_button
      #identity                       ← sibling of #speak inside #inner_header (account menu)
```

**Eval chrome** (prev/next section, settings, intro Start/Skip) is **inside** `{{#if speak_mode}}`. If speak mode is off, eval controls are not shown even on an eval board.

## Critical CSS selectors

| Anchor | Role |
|--------|------|
| `#inner_header:has(#speak)` | Modern speak bar: flex layout, white bar, 90px controls, `.speak-bar__button-list-wrap`, `.speak-bar__eval-actions` |
| `#within_ember #content` | `padding-top: calc(var(--topbar-height) + 3rem + var(--speak-bar-extra, 0px))` — clears the fixed header |
| `#within_ember.board-view` / `board-alt-view` + `#inner_header #speak` | Sets `--topbar-height: 135px` baseline on board routes (see [`app.scss`](../app/frontend/app/styles/app.scss)) so JS `ResizeObserver` split matches layout when `header-index-with-dark-toggle` is absent |
| `.board.eval_mode` | Stacking: `#board_bg` behind; `#board_canvas` / `a.button` above — do not add `position: relative` on `.button_row` for fast_html eval boards |

Renaming `#speak` or moving `.speak-bar__eval-actions` outside `#speak` requires updating all `#inner_header:has(#speak)` rules.

## Layout variables

- **`--topbar-height`**: Defined in `:root` and overridden by `#within_ember` context. On authenticated pages a low base (e.g. 16px) is common; **board speak** uses a higher baseline where noted in SCSS.
- **`--speak-bar-extra`**: Set in JS ([`board/index.js`](../app/frontend/app/controllers/board/index.js) `_updateFromSpeakBarResize`) from `inner_header.offsetHeight - parseFloat(--topbar-height)`. Keeps `#content` padding aligned when the speak bar wraps.
- **Board height**: [`board/index.js`](../app/frontend/app/controllers/board/index.js) `computeHeight` uses `appState.header_size` → `header_height` plus `extra_header_height` (from the same resize logic). Speak mode must be on for the `ResizeObserver` on `#inner_header` to run.

## App state

- **`eval_mode`**: `currentBoardState.key` matches `^obf/eval` ([`app-state.js`](../app/frontend/app/services/app-state.js)).
- **`ensure_speak_mode_for_eval`**: Observer that calls `toggle_mode('speak', { force: true, override_state })` when on an eval key without speak mode (skips in tests; respects `sessionUser.eval_ended`).

## Board render pipeline (Loading…)

If the board shows **Loading…** indefinitely, see [`board/index.hbs`](../app/frontend/app/templates/board/index.hbs): the grid needs `fast_html.html` or `ordered_buttons` from `edit_manager.process_for_displaying`. Pending buttons must reach `all_ready` via [`board.js`](../app/frontend/app/models/board.js) `set_all_ready` (terminal `content_status`: `ready`, `errored`, `missing`).

**Speak mode / fast_html:** In speak mode, [`edit_manager.js`](../app/frontend/app/utils/edit_manager.js) may return early after `render_fast_html`. An empty Ember `SafeString` is **truthy** in JavaScript (`if (fast && fast.html)`) but **falsy** in templates (`{{#if board.fast_html.html}}`), which used to leave **no** `ordered_buttons` and a permanent “Loading…”. The code uses `fastHtmlHasRenderableContent()` so we only short-circuit when the HTML string is non-empty. [`board.js`](../app/frontend/app/models/board.js) `render_fast_html` returns `null` when the grid is not yet valid (rows/columns).

## QA matrix (manual)

| Scenario | Pass criteria |
|----------|----------------|
| Eval from dashboard (`run_eval`) | `speak_mode` on; eval prev/next/settings visible; board grid or fast_html renders (not stuck on “Loading…”). |
| Deep link / `jump_to_board` to `obf/eval-*` | `ensure_speak_mode_for_eval` enables speak mode; eval toolbar appears. |
| Narrow width / long UI strings | Speak bar may wrap; `#content` clears fixed header; board area height tracks (`ResizeObserver`). |
| `preferences.device.canvas_render` | Canvas path: `.board.eval_mode` buttons/canvas receive clicks; background stays behind. |
| Intro steps | Header Start/Skip when `eval_intro_header_show_*`; on-board intro buttons still work. |
| `sessionUser.eval_ended` | Speak toggle may open eval-status modal; user not left with eval board and no speak chrome indefinitely. |

Automated `ember test` requires a browser launcher (e.g. Chrome); run locally when CI or Testem is configured.
