# Speak sidebar Light/Dark stays on the page

GitHub #1097 / KAN-108. Choice: keep the labels, change colour only, stay on the page.

## Fact sheet

(a) READ. The sidebar labels are `LinkTo`s in `app/frontend/app/templates/application.hbs` (Light → route `board`, Dark → route `user.board-alt`). The page ground those routes paint is the `board-alt-view` class, added only when `on_board_alt` is true (`application.js` `on_board_alt`, template `#within_ember`). The stored board colour is `preferences.board_dark_mode`, read by `routes/user/board-detail.js` into `dark_mode` and painted as `md-board-detail--dark`. The classic `#sidebar` is `display: none` on board-detail (`app.scss` `#content:has(.md-shell--board-detail) ~ #sidebar`), so these links are the classic speak sidebar.

(b) SHAPES. `on_board_alt` true shows Light; any other route with a `user/board` key shows Dark. `board_dark_mode` is `true`, `false`, or absent. Absent is light on the modern board (`!!pref`). Absent on classic board-alt is still the dark route paint. Bento `themeMode` (`light` / `midDay` / `dark` / `default`) paints only when `index_or_landing_view` is true.

(c) CROSS-FILE. `selectThemeMode` writes the bento theme and does not recolor a speak board. Confirmed: the bento body classes in `application.hbs` are gated on `index_or_landing_view`. Classic `board` / `board-alt` templates do not read `board_dark_mode`.

## Candidates

1. Buttons call a new action that stores `board_dark_mode` and toggles colour classes on `#within_ember`. The existing board-alt colour rules also match that class, and they stop matching when the user has chosen light. No route change. Chosen.
2. Buttons call `selectThemeMode`. Rejected: that theme does not paint the speak board.
3. Reuse the whole `board-alt-view` class as the dark theme. Rejected: that class also changes header layout, button shape, and the word-suggestion rail.

## Test

`application-speak-theme-test.js`. Mutation that must fail it: stop writing `preferences.board_dark_mode` in `set_speak_board_theme`.
