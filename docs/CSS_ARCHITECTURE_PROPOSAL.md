# CSS Architecture Proposal — Untangling the `app.scss` Spaghetti

> Status: **PROPOSAL ONLY — nothing implemented.** Decision needed before any work.
> Author: styling investigation, 2026-05-19.

## 1. The problem, measured

`app/frontend/app/styles/app.scss` is a **single 78,684-line / 2.3 MB stylesheet** with:

- **4,818 `!important`** declarations (~one per two rule blocks).
- **2,445 ID-anchored selectors** (`#within_ember .x .y …`) — very high base specificity.
- **589 `:has()`** selectors — each further inflates specificity.
- **607 exactly-duplicated selectors**, plus thousands of *different* selectors competing for the same elements.
- **308 scattered `@media` blocks**, usually far from the base rule they modify.
- Bootstrap's CSS imported globally **underneath** all of it.

### Root cause (not "messy code" — a structural cascade failure)

1. **One giant file** → no ownership boundaries. The same logical component gets styled in 3–5 places over time (the "it appears twice" you keep finding). Source order becomes the only tiebreaker, so the path of least resistance is *append an override at the bottom*.
2. **High base specificity** (`#within_ember .a .b`, `:has()`, deep descendant chains). Once a base rule is that specific, any later change must match or beat it — so it reaches for `!important`. Once one `!important` exists, the next override must also `!important`, recursively → 4,818 of them.
3. **Global flat namespace.** A class like `.md-board-detail-symbol-card` is reachable from *any* selector anywhere in 78k lines; nothing enforces who "owns" it.
4. **Bootstrap underneath** adds a low-specificity baseline (`.btn`, element resets) that every custom component must out-specify.

These compound: **#2 + #4 force `!important`; #1 + #3 cause duplication.** Fixing file organization *alone* (the instinct to "just split into files") does **not** fix #2/#4 — concatenated back into one bundle, specificity and source order still decide the winner. This is the key insight that shapes the recommendation.

## 2. Industry standards (survey)

| Approach | What it solves | Fit here |
|---|---|---|
| **CSS Cascade Layers (`@layer`)** — native, Baseline since 2022 | Orders the cascade *explicitly*, independent of source order **and specificity**. Put `bootstrap` + `base` in low layers and `components` above → component styles win **with zero `!important`**. | **Highest-impact, lowest-risk single change.** Directly dissolves the `!important` war. |
| **ITCSS** (Inverted Triangle CSS) | Organizes the codebase by reach/specificity: Settings → Tools → Generic → Elements → Objects → Components → Utilities. Specificity only ever *increases* down the file. | Industry-standard skeleton; pairs with `@layer`. |
| **BEM** (`block__element--modifier`) | Flat, **single-class, low-specificity** selectors. Ownership encoded in the block name. Kills descendant-chain specificity. | You already half-use this (`md-`, `la-`, `ll-`, `nb-` prefixes). Formalizing it removes the need for ID/`:has()` anchors. |
| **Component-scoped CSS** (Ember: `ember-css-modules` / `ember-scoped-css`) | Class names are **hashed/locally scoped per component** at build time → cross-page/cross-component bleed becomes *structurally impossible*, automatically. | This is the *automated* form of what your proposal does by hand. Strongest long-term guarantee; biggest tooling change. |
| **Sass 7-1 pattern** | `abstracts/ base/ components/ layout/ pages/ themes/ vendors/` + one `main.scss`. The professional version of "split into partials". | The right file structure — but **organized primarily by component, with a thin `pages/` layer**, not primarily by page. |
| **Stylelint** (`no-duplicate-selectors`, `declaration-no-important`, `selector-max-id`, `selector-max-specificity`) | Automated enforcement so the mess **cannot regress**. | Essential regardless of which architecture is chosen — this is what stops it happening again. |
| Utility-first (Tailwind) | Eliminates custom selectors entirely. | Not recommended — full rewrite, wrong cost/benefit for a mature AAC app. |

**Consensus position across these:** the professional fix is *not* "more files" — it is **(a) explicit cascade control (layers), (b) low, flat specificity (BEM), (c) enforced ownership/scoping (component-scoped CSS or strict BEM blocks), (d) automated linting**. File splitting (7-1) is the *organizational* layer on top, not the fix itself.

## 3. Verifying your proposal

> Your proposal: (a) break into per-page partial SCSS files; (b) rename every class used on more than one page so it's page-specific, so changing one page can't affect another.

**Verdict: the *goal* is exactly right and industry-aligned; the *mechanism* needs two adjustments.**

- **(a) Per-page partials — directionally correct, refine the axis.** Splitting into partials is standard (Sass 7-1's `pages/`). ✅ But:
  - File splitting **alone does not stop cross-page bleed or the `!important` war** — everything still concatenates into one `app.css` where specificity + order rule. Partials must be paired with **`@layer`** (Section 2) to actually deliver the win.
  - The primary organizing axis in professional codebases is **component**, not page. This app is component-heavy: the board grid, speak bar, modals, folder tabs are *reused across pages*. A pure per-page split would force you to duplicate those (the OOCSS anti-pattern — and a cause of the current duplication). Recommended structure: `components/` (the reusable blocks) + a thin `pages/` (only page-specific composition/overrides) + `layout/`, `base/`, `vendors/`, `abstracts/`.

- **(b) Rename shared classes to be page-specific — correct intent, wrong tool.** The intent (a change to one page can't silently alter another) is precisely what scoping guarantees and is 100% industry-standard. But achieving it by **hand-renaming every multi-page class**:
  - is laborious and risky — every rename must be mirrored in `.hbs`, `.js` (raw_events, app-state, board-icon, etc.), and tests, or it silently breaks behavior (exactly the regression class we keep fighting);
  - **duplicates genuinely shared components** — a button that legitimately appears on 5 pages becomes 5 near-identical class trees instead of one block + modifiers. That *increases* CSS size and visual inconsistency — the opposite of the goal.
  - The professional way to get the **same guarantee automatically** is **component-scoped CSS** (build hashes the names per component) **or strict BEM block ownership** (one block = one owner file; shared UI is a shared *component*, not a copied class). Genuinely shared UI should stay **one component with `--modifiers`**; only truly page-specific styling gets a page scope.

So: **keep your instinct (modularize + scope so pages can't bleed), drop "manually rename every shared class," and add cascade layers + lint enforcement.** Your proposal is ~70% the standard answer; the missing 30% (layers, component-not-page axis, automated scoping, linting) is what makes it actually hold.

## 4. Recommended target architecture

```
app/styles/
  app.scss                 # only @use + @layer order declaration
  abstracts/               # _variables (exists), _mixins, _functions  — compile to NO css
  vendors/                 # _bootstrap-overrides            -> @layer vendor
  base/                    # _reset, _elements, _typography   -> @layer base
  layout/                  # _shell, _header, _grid           -> @layer layout
  components/              # _board-grid, _speak-bar, _folder-tab,
                           # _modal, _share-text, _board-icon… -> @layer components
  pages/                   # _board-detail, _board-detail-edit,
                           # _boards-browser, _caseload…       -> @layer pages
  utilities/               # _helpers (the only place text-... etc) -> @layer utilities
```

```scss
// app.scss — the cascade order is declared ONCE, here:
@layer vendor, base, layout, components, pages, utilities;
```

Result: a `pages/_board-detail-edit.scss` rule beats a `components/_speak-bar.scss` rule **because of its layer, not because of `!important` or being lower in the file**. `!important` becomes a near-zero, exceptional tool. Cross-file overrides become predictable.

## 5. Migration strategy (incremental, regression-safe)

A big-bang rewrite of 78k lines on an AAC app used by vulnerable communicators is unacceptable risk. Phased:

- **Phase 0 — Stop the bleeding (½ day, no visual change).**
  Add `@layer` declaration; wrap the Bootstrap import and a new `base` in low layers. Add **Stylelint** with `no-duplicate-selectors`, `declaration-no-important: warn`, `selector-max-id`, `selector-max-specificity` — CI **warn-only** first (baseline the existing count, fail the build only on *new* violations). This alone halts regression and lets new code drop `!important`.

- **Phase 1 — Carve, don't rewrite.** Mechanically extract regions of `app.scss` into the folder structure **byte-for-byte** (no rule changes), wrapping each file in its `@layer`. Visual diff per slice (the app already has the screenshots/areas we've been working). Lowest-risk, highest-clarity win; kills the "append at bottom" habit immediately.

- **Phase 2 — De-duplicate within a file.** Once a component lives in one file, the 607 duplicates collapse to one rule each, reviewable in isolation.

- **Phase 3 — Specificity reduction, opportunistic.** When touching a component file, flatten `#within_ember .a .b` → BEM single class and delete the now-unnecessary `!important`s. Never a sweep; always alongside feature work, screenshot-verified.

- **Phase 4 (optional, longer-term) — `ember-css-modules`** for *new* components only, so scoping becomes automatic going forward without rewriting the world.

**Effort:** Phase 0–1 ≈ 2–3 focused days, near-zero visual risk. Phases 2–4 are continuous, opportunistic, not a blocking project.

## 6. Tooling to make it stick

- **Stylelint** + `stylelint-config-standard-scss`, custom rules above. CI gate (new-violations-fail).
- **`stylelint-declaration-strict-value`** optional — forces design tokens over magic numbers.
- Pre-commit hook (the repo already has a `docs/PRE_COMMIT_CHECKLIST.md`) runs stylelint on changed `.scss`.
- Update `docs/CSS_SCSS_GUIDELINES.md` with the layer order + "one component = one file = one owner; no `!important` without a code comment justifying it."

## 7. Bottom line

- Your modularize-and-scope instinct **matches industry direction** — keep it.
- Refine: organize by **component** (thin `pages/` on top), not purely by page; achieve scoping via **cascade layers + BEM/component-scoped CSS + Stylelint**, **not** by hand-renaming every shared class (which re-introduces duplication).
- The single biggest, cheapest, lowest-risk lever is **CSS `@layer`** — it retires the `!important` war without touching a single visual rule.
- Migrate **incrementally and screenshot-verified**; never a big-bang rewrite on this app.
