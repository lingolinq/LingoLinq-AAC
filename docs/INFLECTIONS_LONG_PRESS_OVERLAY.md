# Long-Press Inflections Overlay (Speak Mode)

This document describes the **inflections overlay** feature that appears when users long-press on a button in Speak Mode. It is intended to help preserve this functionality during board display refactoring.

## Overview

When a communicator has **"Show inflection options on long-press in Speak Mode"** enabled (`preferences.inflections_overlay`), long-pressing a button displays a 3×3 grid of inflection options (e.g., plural, past tense, possessive) around the original button. The user can then tap an option to speak that inflected form.

## User-Facing Behavior

- **Trigger**: Long-press (hold) on a board button in Speak Mode
- **Delay**: Default 1500ms; when inflections_overlay is on, uses 2× `short_press_delay` if that yields a longer delay
- **Display**: A floating overlay with the original button in the center and inflection options in the 8 surrounding positions (nw, n, ne, w, e, sw, s, se)
- **Selection**: Tap an inflection option to speak it and add it to the utterance
- **Dismiss**: Tap "close" or tap outside the overlay

## Key Files and Entry Points

| File | Role |
|------|------|
| `app/frontend/app/utils/raw_events.js` | Detects long-press, schedules `track_long_press`, routes overlay clicks |
| `app/frontend/app/utils/edit_manager.js` | `long_press_mode`, `grid_for`, `overlay_grid` – builds and renders the overlay |
| `app/frontend/app/controllers/application.js` | `activateButton` with overlay options; swipe-to-inflect uses `grid_for` |
| `app/frontend/app/templates/user/preferences.hbs` | User preference checkbox for inflections_overlay |
| `app/frontend/app/styles/app.scss` | `#overlay_container` and `.overlay_button` styles |

## Data Flow

1. **Long-press detection** (`raw_events.js`):
   - On `mousedown`/`touchstart` in speak_mode, schedules `track_long_press` via `runLater` with `long_press_delay`
   - Scheduling is enabled when: `long_press_delay` is set, OR `default_mode`, OR `referenced_user.preferences.inflections_overlay`
   - On timer fire, `track_long_press` calls `editManager.long_press_mode({ button_id, clientX, clientY })`

2. **Inflections overlay logic** (`edit_manager.js`):
   - `long_press_mode` checks `speak_mode` and `referenced_user.preferences.inflections_overlay`
   - Resolves button DOM: `$(".button[data-id='" + opts.button_id + "']")` or `synthetic_button_elem_for_overlay` if not in DOM
   - Calls `grid_for(button_id)` to build inflection options
   - Calls `overlay_grid(grid, elem, opts)` to create and show the overlay

3. **Grid construction** (`edit_manager.js` – `grid_for`):
   - Uses button `inflections`, `inflection_defaults`, or translations
   - Falls back to part-of-speech defaults (noun, verb, adjective, pronoun, etc.) via `i18n` helpers
   - Returns array of `{ location, label, vocalization }` for positions nw, n, ne, w, c, e, sw, s, se
   - Center (c) is the base/default form

4. **Overlay rendering** (`edit_manager.js` – `overlay_grid`):
   - Creates `div#overlay_container` with classes `overlay` and `board`
   - Copies board styling from `.board` element
   - Builds 3×3 grid of `.overlay_button` divs with `select_callback` on each
   - Appends to `document.body`
   - Each callback invokes `grid.select(obj, event)` → `activateButton` with `overlay_label`, `overlay_vocalization`, `trigger_source: 'overlay'`

5. **Overlay interaction** (`raw_events.js`):
   - Clicks outside `#overlay_container` remove the overlay (mousedown/touchstart)
   - On release, `element_release` checks for `dom.classList.contains('overlay_button')` and `dom.select_callback`, then invokes it

## DOM Structure

- **Container**: `#overlay_container` (id), `.overlay`, `.board` classes
- **Buttons**: `.overlay_button` on each inflection option
- **Positioning**: Absolutely positioned; uses `getBoundingClientRect()` of the source button
- **Dependencies**: Expects `.board` to exist for copying classes; uses `header` height for layout

## Refactoring Considerations

When refactoring board displays:

1. **Button lookup**: `grid_for` and overlay logic expect buttons to be findable via `$(".button[data-id='...']")` or `board_virtual_dom.button_from_id`. If board rendering changes, ensure:
   - Buttons have `data-id` matching the button id
   - Or `synthetic_button_elem_for_overlay` can provide a fallback using `board_virtual_dom.button_from_id`

2. **Overlay styling**: The overlay copies `.board` classes from the first `.board` element. If board structure changes, verify overlay still inherits correct styling.

3. **Event handling**: Long-press is detected on elements inside `.advanced_selection` (which wraps buttons). The `longPressEvent.long_press_target` must stay on the button for the timer to fire correctly.

4. **Synthetic button fallback**: When the button is not in the DOM (e.g., virtualized or off-screen), `synthetic_button_elem_for_overlay` builds a mock element from `board_virtual_dom.button_from_id`. This requires `board_virtual_dom` and `button_from_id` to remain available.

## Related Features

- **Swipe for inflections**: In application controller, swipe on a button can select an inflection from `grid_for` by direction without opening the overlay
- **Button settings**: Inflections are configured per-button in button-settings (nw, n, ne, w, c, e, sw, s, se)
- **Feature flag**: `feature_flags.inflections_overlay` gates the button-settings UI; the runtime behavior uses `preferences.inflections_overlay`
