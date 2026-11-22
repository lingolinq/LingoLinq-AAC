# Firefox draws no symbols in Colored mode on the deployed web app (2026-11-21)

Found 2026-11-16 by the sync e2e suite's Firefox run and carried in the offline-sync handoffs as "Firefox Basic view:
home board pictures not drawn, folder 1 picture oversized/clipped, folder taps do not navigate, even online".

Learnings consulted: none matched `filter`, `svg`, `index.html.erb` or `Firefox` for this surface.

## Still a problem? Reproduced on current develop

Playwright Firefox 1538 and Chromium 1234, 1280x800, develop (`f581c0066`'s code) served by Rails on :5097, private
e2e database. The synthetic picture URLs answer 403 from the CDN today, so every picture showed the broken-image
square in BOTH browsers; to reproduce "pictures loaded but not drawn" the probe serves a real PNG for those URLs
(Playwright `route`, nothing in the app changed). Scripts: `~/offline-sync-handoff/2026-11-21-firefox/`.

- Pictures not drawn: YES, in Firefox only. Every `img.symbol` reports loaded (200x200) in a 285x200 box, identical
  layout to Chromium, but Firefox paints nothing; folder 1's picture is drawn at its own size, shifted up and cut
  off. The Modern view (`board-detail`) has the same failure: no symbol drawn.
- Folder taps do not navigate: NOT reproduced. Click and touch tap (`hasTouch`) both open folder 1 in Firefox.

## Cause (CONFIRMED)

- `app.scss` gives Colored-mode symbols `filter: url(#ll-symbol-white-backing)` (Basic `.button img.symbol`, Modern
  `.md-board-detail-symbol-card__image img.symbol`, the sentence-bar chips and predictions).
- The filter was defined only in `app/frontend/app/index.html` (a hidden `<svg><defs>`), the shell `ember serve` and
  the mobile builds use. Every deployed web page is served by Rails from `app/views/boards/index.html.erb`, which
  never had it: `document.getElementById('ll-symbol-white-backing')` is null on :5097.
- Firefox does not draw an element whose `filter: url(#id)` points at a missing element; Chrome and Safari draw it
  without the filter. So on the web Firefox showed no symbols, and Chrome/Safari users never saw the cream backing.
- Proof: injecting the same `<svg>` into the Rails-served page made Firefox draw every symbol, folder 1 included.

## Fix (Traci, 2026-11-21: "ship the filter")

- `app/utils/symbol_filters.js` (new) holds the filter markup, moved verbatim from `app/index.html` with its notes,
  and `install_symbol_filters(doc)` adds it to the body once (`#ll-symbol-filters`).
- `app/initializers/symbol-filters.js` (new) calls it at boot, so every shell (Rails, `ember serve`, mobile) gets
  the filters from one source. The block is removed from `app/index.html`; the two `app.scss` comments that pointed
  at index.html now point at the module.
- `tests/test-helper.js` installs them before any test, as a real page has them; without that the leak check charged
  the first test that boots the app with the new `<svg>` (seen: "board-detail empty state" failed with "leak check:
  <svg#ll-symbol-filters> was left under <body>"). The leak check's rules are unchanged.

Visible change: on the web in Colored mode, near-white parts of symbols turn cream (#f0ebdf) in every browser, as
designed; Firefox draws the symbols again.

## Tests

- `tests/unit/utils/symbol-filters-test.js` (4): both filters added as SVG (namespace, primitives, cream colour),
  hidden from layout and assistive technology, added once, and the initializer installs them.
- `ember test --query timingStrict=1 --filter "/symbol filters|leak check|board-detail|button/i"`: 655 tests, 651
  pass, 4 skipped (existing), 0 fail.
- Mutations (together): `install_symbol_filters` never attaches the `<svg>`, and the initializer does nothing. Red: the
  "adds both filters", "added once" and "initializer installs them" tests; the markup-attributes test stays green, as
  it checks the element, not where it is. Restored with `git checkout`.
- `npm run lint:js:ci`: no finding in the changed files (the 4 known worktree `no-orphaned-action` false positives).

## Screenshots (production build of this branch on :5112 against develop on :5097)

`~/offline-sync-handoff/2026-11-21-firefox/compare-sync_e2e_basic.png` and `compare-sync_e2e_modern.png`: Firefox
develop draws no symbols (Basic and Modern); Firefox and Chromium with the fix draw them with the cream fill;
Chromium develop draws them with a white fill.

Not covered: Safari (WebKit) and the mobile apps were not run (the mobile shell already had the filter in its
index.html; it now comes from the initializer); dark and high-contrast modes use other selectors and are unchanged.

## Chrome on the Android emulator (2026-11-21, final code `86921356c`)

Same emulator, Chrome 124 over its DevTools socket, the symbol test picture served for the 403 URLs.

| Build | View | Filter in the page | Symbols drawn / with the filter applied |
|---|---|---|---|
| develop (:5097) | Basic | no | 10 / 10 (filter skipped: white fill) |
| this branch (:5111) | Basic | yes | 10 / 10, cream fill |
| develop (:5097) | Modern | no | 16 / 16 (filter skipped: white fill) |
| this branch (:5111) | Modern | yes | 16 / 16, cream fill |

Screenshots: `~/offline-sync-handoff/2026-11-21-firefox/emu-compare.png`. Firefox is not installed on the emulator,
so the Firefox fix itself was checked in desktop Firefox only.
