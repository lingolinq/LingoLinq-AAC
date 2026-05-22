# CSS / SCSS Refactor — Implementation Plan

> Companion to **`docs/CSS_ARCHITECTURE_PROPOSAL.md`** (the *why* + standards survey).
> This doc is the *how* — an ordered, low-risk execution checklist to run later.
> Status: **NOT STARTED.** Nothing here is implemented yet.

## 0. Current state (baseline to beat)

- `app/frontend/app/styles/app.scss`: **~78,700 lines / 2.3 MB, single file.**
- **~4,818 `!important`**, **~2,445 ID-anchored selectors**, **~589 `:has()`**, **~607 exactly-duplicated selectors**, ~308 scattered `@media` blocks.
- Bootstrap CSS imported globally underneath everything.
- Only partials today: `_variables`, `_focus`, `_header_sizing`, `_eval_quick` (via `@use`).
- Build: `ember-cli-sass` → single `app.css`. CSS compression disabled in Rails prod (keep it that way — see `docs/CSS_SCSS_GUIDELINES.md`).

**Guiding principle (from the proposal):** fix the *original* rule; never stack a competing `!important` override. Modularize by **component** (thin `pages/` layer), control the cascade with **`@layer`**, enforce with **Stylelint**. No big-bang rewrite — incremental, screenshot-verified slices.

## 1. Target architecture

### 1a. Folder structure (Sass 7-1, component-first)

```
app/styles/
  app.scss                 # ONLY: @use of partials + the single @layer order line
  abstracts/   _variables _mixins _functions          (compile to NO css)
  vendors/     _bootstrap-overrides                    -> @layer vendor
  base/        _reset _elements _typography            -> @layer base
  layout/      _shell _header _board-detail-layout     -> @layer layout
  components/  _board-grid _speak-bar _folder-tab
               _edit-panel _modal _share-text
               _board-icon _boards-browser …           -> @layer components
  pages/       _board-detail _board-detail-edit
               _boards-browser-page _caseload …        -> @layer pages
  utilities/   _helpers                                -> @layer utilities
```

Rule of ownership: **one block = one component file = one owner.** Shared UI stays one component with `--modifiers`; pages only *compose/override*, never redefine component internals.

### 1b. The cascade order (declared once, in `app.scss`)

```scss
@layer vendor, base, layout, components, pages, utilities;
```

Later layer wins regardless of specificity/source order. Unlayered CSS beats *all* layered CSS — this is the safety lever for incremental migration (see Phase 1).

### 1c. Stylelint rule targets (enforced, baselined)

| Rule | Setting | Purpose |
|---|---|---|
| `no-duplicate-selectors` | error (new only) | kill the 607 dupes / "appears twice" |
| `declaration-no-important` | warn, baseline 4,818 | count only ever decreases |
| `selector-max-id` | `1` (new only) | retire `#within_ember …` anchors |
| `selector-max-specificity` | e.g. `0,4,0` (new only) | stop deep chains |
| `selector-class-pattern` | BEM regex per block prefix | enforce block ownership |

"new only" = snapshot current violations; CI fails only on **net-new** ones.

## 2. Phased execution checklist

### Phase 0 — Stop the bleeding (≈½ day, ZERO visual change)
- [ ] Add `@layer vendor, base, layout, components, pages, utilities;` at the top of `app.scss`.
- [ ] Wrap the Bootstrap import in `@layer vendor { … }` (via `@import` in a layer or an `@layer` wrapper file).
- [ ] Leave **all** existing `app.scss` rules unlayered for now → they still win (unlayered > layered) → **pixel-identical output**.
- [ ] Add `stylelint` + `stylelint-config-standard-scss`; config the rules in §1c; generate the baseline; wire into CI + the pre-commit checklist (`docs/PRE_COMMIT_CHECKLIST.md`) as **warn/new-only**.
- [ ] Acceptance: visual diff of key screens = no change; CI green; new `!important`/dupes now blocked.

### Phase 1 — Carve into partials byte-for-byte (incremental)
For each component/page slice, one PR:
- [ ] Cut the rule region out of `app.scss` into the right partial **unchanged**.
- [ ] Wrap that partial's content in its `@layer` (`components` / `pages` / …).
- [ ] `@use` it from `app.scss` in layer order.
- [ ] **Screenshot-verify** that slice's screens before/after (use the areas already exercised this milestone: board-detail, edit page, boards browser, modals, speak menu).
- [ ] Order suggestion (lowest risk first): `vendors` → `abstracts`/`base` → `utilities` → leaf `components` (folder-tab, board-icon, share-text) → bigger `components` (board-grid, speak-bar, edit-panel) → `pages` (board-detail-edit, board-detail, boards-browser, caseload).
- Caution: migrate **coherent whole components** per slice — never split a component half-layered/half-unlayered (unlayered would out-rank the layered half).

### Phase 2 — De-duplicate within each file (per slice, after it's carved)
- [ ] Collapse the now-co-located duplicate selectors (the 607) into one rule each; review in isolation.
- [ ] Re-screenshot the slice.

### Phase 3 — Specificity reduction (opportunistic, never a sweep)
- [ ] Only when already editing a component file for feature work: flatten `#within_ember .a .b` → single BEM class, delete the `!important`s that the layer now makes unnecessary.
- [ ] Each change screenshot-verified alongside the feature.

### Phase 4 — (Optional, long-term) Build-enforced scoping
- [ ] Adopt `ember-css-modules` (or `ember-scoped-css`) for **new** components only → automatic per-component scoping without retrofitting the world.

## 3. Risk controls (non-negotiable on an AAC app)

- Never a big-bang rewrite; every slice is independently revertable.
- Visual regression: screenshot before/after each slice on the slice's screens (and dark mode + the responsive breakpoints we now use: desktop, ≤1024, ≤819, ≤640).
- Phase 0 must produce **byte-identical render** (it only changes *why* rules win, not *whether*).
- Keep Rails `config.assets.css_compressor = nil` (re-enabling `:sass` re-triggers mixed-unit errors — see CSS_SCSS_GUIDELINES).
- Don't touch JS/HBS class names during the CSS refactor (class renames are a separate, riskier workstream — and unnecessary once layers + ownership are in place).

## 4. Definition of done

- `app.scss` is only `@use` + the `@layer` line.
- Every rule lives in a layered partial owned by exactly one component/page.
- `!important` count trending to near-zero; **0** ID-anchored selectors in new code; Stylelint green with no net-new violations.
- A page-level style change provably cannot alter another page (ownership + layers + lint enforce it).

## 5. First concrete step when we start

`Phase 0` only. One PR: add the `@layer` line + Bootstrap-in-vendor wrapper + Stylelint baseline. No rule edits. Verify zero visual diff. Everything else builds on that.
