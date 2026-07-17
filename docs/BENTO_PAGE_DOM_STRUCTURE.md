# Bento Page DOM Structure & Styling

This document describes the **exact** DOM hierarchy and **all** CSS that apply when viewing the bento dashboard (index route, logged in, with the page footer). Use it to reason about layout and to change styles without breaking the full-height / sticky-footer behavior.

---

## When this structure applies

- **Route:** index (dashboard)
- **User:** logged in → `Dashboard::AuthenticatedView` is rendered
- **Footer:** `this.footer` is true → `{{page-footer}}` is rendered
- **Class on #within_ember:** `bento-page-with-footer` is added when the application controller computed `showBentoPageWithFooter` is true: `this.footer && app_state.index_or_for_schools_view && current_route !== 'for-schools'` (so index dashboard with footer, not for-schools route). `footer` is set in the same `runNext` as `index_view` (in `app-state.finish_global_transition`) so both update together and the class is present on the first render that shows the footer.

Relevant classes on `#content`: from `content_class` → e.g. `index`, `with_user`, `new_index` (on index when logged in). Layout rules also target `#within_ember.bento-page-with-footer #content` without requiring `.index` so `display: flex` always applies when the wrapper has the class.  
Relevant classes on `#index_view`: `row main_columns` (when `hasCurrentUser`).

---

## CSS variables (bento layout)

Defined on `:root` in `app.scss`:

| Variable | Value | Use |
|----------|--------|-----|
| `--topbar-height` | 80px | Global header height; padding-top on `#content` |
| `--bottombar-height` | 84px | Page footer height; flex-basis for `.page-footer` when in-flow |

---

## Full DOM hierarchy (exact)

```
html
└── body
    └── div#ember-application-root          ← Ember rootElement (config)
        └── div#within_ember                ← Application template root (single div)
            │   Classes (when bento + footer): bento-page-with-footer, index-or-for-schools-view,
            │   header-index-with-dark-toggle (if index + user), theme classes (bento-*-mode-active), etc.
            │
            ├── div#audio
            │
            ├── header                         ← Global top navbar (not the bento bar)
            │   Classes: from header_class; when index+user: header-index-with-dark-toggle
            │   └── div#inner_header
            │       └── … (speak mode / nav / identity / theme picker / for-schools link / etc.)
            │
            ├── div#content                   ← Main content (outlet container)
            │   Classes: from content_class → index with_user new_index (on index when logged in)
            │   └── {{outlet}} → Ember may render as:
            │       Option A:  div.ember-view (outlet root) → div#index_view
            │       Option B:  #index_view as direct child of #content (or .ember-view as sibling)
            │   When .ember-view is empty / doesn't contain #index_view it is collapsed (flex: 0 0 0; height: 0).
            │   #index_view is targeted as #content > #index_view when direct child so it gets the flex chain.
            │       └── div#index_view.row.main_columns
            │               └── Dashboard::AuthenticatedView (root = .ll-bento-app-shell)
            │               │
            │               ├── div.ll-bento-app-shell
            │               │   Modifiers: ll-bento-app-shell--dark | --midday | --coolBlue | --default | --light | --pastel | --gold
            │               │   ├── div.ll-bento-bg-orbs (aria-hidden="true")
            │               │   │   ├── span.ll-bento-orb.ll-bento-orb--a
            │               │   │   ├── span.ll-bento-orb.ll-bento-orb--b
            │               │   │   └── span.ll-bento-orb.ll-bento-orb--c
            │               │   │
            │               │   └── div.ll-bento-device-frame.ll-bento-device-frame--wide
            │               │       Optional: ll-bento-device-frame--no-section-border, --section-border-thick, --demo-bg
            │               │       ├── header.ll-bento-bar
            │               │       │   Optional: ll-bento-bar--midday, --coolBlue, --default
            │               │       │   ├── div.ll-bento-bar__section.ll-bento-bar__brand
            │               │       │   │   └── a.ll-bento-brand-link → logo, app name, "Home Page"
            │               │       │   ├── div.ll-bento-bar__section.ll-bento-bar__welcome
            │               │       │   │   └── span.ll-bento-bar-welcome (label, badge, celebration icon)
            │               │       │   ├── div.ll-bento-bar__section.ll-bento-bar__demo-colors (optional, default theme)
            │               │       │   └── div.ll-bento-bar__section.ll-bento-bar__actions
            │               │       │       └── refresh link, profile link/span
            │               │       │
            │               │       └── div.row.ll-bento-main-content
            │               │           └── div.col.col-12#bento-main
            │               │               ├── div.ll-bento-span
            │               │               │   └── div.ll-bento-tabs (Actions | Communicators | Boards | Supervisors | Updates | Logging)
            │               │               └── … (tab panels: getting started, actions grid, boards, logging, updates)
            │               │
            │               └── (end of authenticated-view)
            │
            ├── div#sidebar (optional, when sidebar_visible)
            ├── {{modal-container}}
            ├── {{outlet "highlight"}} / {{outlet "highlight-secondary"}} / {{outlet "board-preview"}}
            ├── <FlashOutlet />
            ├── {{outlet "flash-message"}}
            ├── div#setup_footer (optional) OR
            ├── {{#if this.footer}} {{page-footer}} {{/if}}
            │   → footer.page-footer
            │   └── div.wide_links
            │       └── div.row
            │           ├── div.col-sm-6 (app name, About | Support | Contact, language)
            │           ├── div.col-sm-2.page-footer__right-icons (optional, icons)
            │           └── div.col-sm-4.page-footer__right-links (Developers | Privacy | Terms)
            │   {{#if this.app_state.index_view}} div.skinny_links (dropdown "More Resources") {{/if}}
            │
            └── iframe (cache; optional, visibility:hidden; height:0)
{{button-tracker}}   ← Sibling of #within_ember, outside app wrapper
```

There is **no** `.bento-page-main` wrapper in the index + footer case; `#content` and `.page-footer` are direct siblings (with other nodes in between) inside `#within_ember`.

---

## Styling: two selector groups

Layout is driven by two overlapping selector groups:

1. **`#within_ember:has(.page-footer)`** – applies whenever a `.page-footer` exists anywhere under `#within_ember` (any page with footer).
2. **`#within_ember.bento-page-with-footer`** – applies when the application has added the class `bento-page-with-footer` (index + footer).

When both match (bento dashboard with footer), **`.bento-page-with-footer` rules override** for `#within_ember` (position, flex), `#content` (min-height, padding-bottom), and `.page-footer` (position, flex), so the layout uses the **industry-standard flex column**: html/body/root do not scroll; only `#content` scrolls; footer is in-flow at the bottom.

---

## All styling applied (in order of appearance in app.scss)

### 1. Global variables

```scss
:root {
  --topbar-height: 80px;
  --bottombar-height: 84px;
}
```

### 2. Base #within_ember (no footer condition)

```scss
#within_ember {
  position: relative;
  background: #fff;
  overflow: hidden;
}
```

### 3. When any page has .page-footer (:has(.page-footer))

```scss
#within_ember:has(.page-footer) {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

#within_ember:has(.page-footer) > *:not(#content) {
  flex: 0 0 auto;
}

#within_ember:has(.page-footer) > header {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: var(--topbar-height);
  z-index: 1000;
}

#within_ember:has(.page-footer) .page-footer {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: var(--bottombar-height);
  z-index: 1000;
}

/* Scot's landing: footer in flow */
#within_ember.for-schools-route { position: static; overflow-x: hidden; overflow-y: visible; display: block; min-height: 100%; }
#within_ember.for-schools-route .page-footer { position: static !important; bottom: auto; left: auto; right: auto; height: auto; min-height: var(--bottombar-height); }

/* #content when footer present (any page) */
#within_ember:has(.page-footer) #content.index.with_user {
  flex: 1 1 auto;
  min-height: calc(100vh - var(--topbar-height) - var(--bottombar-height));
  overflow-x: hidden;
  overflow-y: auto;
  padding-top: var(--topbar-height);
  padding-bottom: var(--bottombar-height);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: radial-gradient(...) linear-gradient(...);  /* default bento gradient */
}

/* Theme overrides for #content background */
#within_ember.bento-default-mode-active:has(.page-footer) #content.index.with_user,
#within_ember.bento-page-with-footer.bento-default-mode-active #content.index.with_user {
  background: linear-gradient(135deg, rgba(126,184,224,0.35) 0%, rgba(58,107,199,0.3) 100%);
}
#within_ember.bento-gold-mode-active:has(.page-footer) #content.index.with_user,
#within_ember.bento-page-with-footer.bento-gold-mode-active #content.index.with_user {
  background: linear-gradient(to bottom, rgba(126,184,224,0.25) 0%, rgba(212,168,75,0.12) 50%, rgba(61,122,92,0.14) 100%);
}

/* Ember outlet: when .ember-view wraps content it stays in flex chain; when empty or ghost (no #index_view inside) collapse it. */
#within_ember:has(.page-footer) #content.index.with_user > .ember-view,
#within_ember.bento-page-with-footer #content > .ember-view {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
#within_ember.bento-page-with-footer #content > .ember-view:empty,
#within_ember.bento-page-with-footer #content > .ember-view:not(:has(#index_view)),
#within_ember:has(.page-footer) #content > .ember-view:empty,
#within_ember:has(.page-footer) #content > .ember-view:not(:has(#index_view)) {
  flex: 0 0 0;
  min-height: 0;
  height: 0;
  overflow: hidden;
}
/* #index_view as direct child of #content (outlet may render with or without .ember-view wrapper). */
#within_ember.bento-page-with-footer #content > #index_view,
#within_ember:has(.page-footer) #content > #index_view {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* #index_view → shell → device-frame → row (when footer present) */
#within_ember:has(.page-footer) #content.index.with_user #index_view,
#within_ember.bento-page-with-footer #content #index_view {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  padding-top: 0; margin-top: 0;
}

/* .ll-bento-app-shell flex override is defined after the base .ll-bento-app-shell block (see §7 below)
   so one clear winning rule (display: flex) without !important. Not duplicated here. */

#within_ember:has(.page-footer) #content.index.with_user .ll-bento-app-shell .ll-bento-device-frame,
#within_ember.bento-page-with-footer #content .ll-bento-app-shell .ll-bento-device-frame {
  flex: 1 1 auto;
  min-height: 0;
  align-self: center;
  width: 100%;
  max-width: 1200px;
  padding-top: 0;
  display: flex;
  flex-direction: column;
}

#within_ember:has(.page-footer) #content.index.with_user .ll-bento-device-frame > .row,
#within_ember.bento-page-with-footer #content .ll-bento-device-frame > .row {
  flex: 1 1 auto;
  min-height: 0;
  padding-top: 0;
  display: flex;
  flex-direction: column;
}
```

### 4. Bento full-height chain (only when #within_ember.bento-page-with-footer)

These rules make the viewport exactly one screen tall and make **only** `#content` scroll (industry-standard sticky footer).

```scss
html:has(#within_ember.bento-page-with-footer) {
  height: 100%;
  overflow-x: hidden !important;
  overflow-y: hidden;
  max-width: 100%;
}

body:has(#within_ember.bento-page-with-footer) {
  height: 100%;
  min-height: 100%;
  overflow-x: hidden !important;
  overflow-y: hidden;
  max-width: 100%;
}

#ember-application-root:has(#within_ember.bento-page-with-footer) {
  height: 100%;
  min-height: 100%;
  overflow-x: hidden;
  overflow-y: hidden;
  max-width: 100%;
  display: flex;
  flex-direction: column;
}

#within_ember.bento-page-with-footer {
  position: static;
  overflow-x: hidden;
  overflow-y: visible;
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
  height: 100%;
}

/* #content: also targeted without .index so flex always applies when parent has bento-page-with-footer.
   padding-bottom: 0 !important beats :has(.page-footer) #content.index.with_user (padding-bottom: var(--bottombar-height)) so no phantom space. */
#within_ember.bento-page-with-footer #content,
#within_ember.bento-page-with-footer #content.index.with_user {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  padding-top: var(--topbar-height);
  padding-bottom: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

/* .bento-page-main exists only on some pages (e.g. for-schools); not on index */
#within_ember.bento-page-with-footer .bento-page-main { ... }
#within_ember.bento-page-with-footer .bento-page-main > *:not(#content) { flex: 0 0 auto; }
#within_ember.bento-page-with-footer .bento-page-main #content.index.with_user { ... }

/* #content > .ember-view: part of flex chain (see §3 for same rule under :has(.page-footer)) */

#within_ember.bento-page-with-footer #content.index.with_user #index_view {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
}

/* .ll-bento-app-shell flex override: in app.scss after the base .ll-bento-app-shell block (no !important). */

#within_ember.bento-page-with-footer #content.index.with_user .ll-bento-app-shell .ll-bento-device-frame {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  align-self: stretch !important;
}

#within_ember.bento-page-with-footer #content.index.with_user .ll-bento-device-frame > .row {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
}

#within_ember.bento-page-with-footer .page-footer {
  position: static !important;
  bottom: auto; left: auto; right: auto;
  flex: 0 0 var(--bottombar-height);
  height: var(--bottombar-height);
  min-height: var(--bottombar-height);
}
```

### 5. Main content column (#bento-main)

```scss
#within_ember:has(.page-footer) #content.index.with_user .ll-bento-device-frame > .row.ll-bento-main-content > .col,
#within_ember.bento-page-with-footer #content .ll-bento-device-frame > .row.ll-bento-main-content > .col {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

#content.index.with_user .ll-bento-device-frame > .row,
#within_ember.bento-page-with-footer #content .ll-bento-device-frame > .row {
  overflow-x: hidden;
}
```

### 6. Global header and #content padding (all pages)

```scss
#within_ember > header {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
}

#within_ember #content {
  padding-top: 80px;
}
```

### 7. Base bento shell and device frame (no footer condition)

Defined later in `app.scss`. The base block does **not** set `min-height`; a **scoped** rule applies `min-height: 100% !important` only when the shell is **not** in the footer layout, so that rule never appears in the cascade when `#within_ember` has `.bento-page-with-footer` or `:has(.page-footer)`. When footer is present, a single override rule after the base sets the shell to flex and `min-height: 0`.

```scss
.ll-bento-app-shell {
  display: grid;
  place-items: center;
  padding: 24px;
  position: relative;
  overflow: hidden;
  font-family: Inter, system-ui, ...;
  background: transparent;
  /* + CSS custom properties for theming; no min-height here */
}

/* Shell fills height only when NOT in footer layout (keeps 100% out of cascade when bento-page-with-footer or :has(.page-footer)). */
#within_ember:not(.bento-page-with-footer):not(:has(.page-footer)) .ll-bento-app-shell {
  min-height: 100% !important;
}

/* Bento page with footer: shell is flex, min-height: 0 so it can shrink in the flex chain. */
#within_ember.bento-page-with-footer #content .ll-bento-app-shell,
#within_ember:has(.page-footer) #content.index.with_user .ll-bento-app-shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0 !important;
  align-items: stretch;
  place-items: unset;
  justify-content: flex-start;
  width: 100%;
  padding-top: 32px;
  margin-top: 0;
}

.ll-bento-bg-orbs {
  position: absolute;
  inset: -80px;
  pointer-events: none;
  filter: blur(22px);
  opacity: 0.75;
}
.ll-bento-orb { position: absolute; border-radius: 999px; transform: translateZ(0); }
.ll-bento-orb--a { width: 420px; height: 420px; left: 6%; top: 12%; background: radial-gradient(...); }
.ll-bento-orb--b { ... }
.ll-bento-orb--c { ... }

.ll-bento-device-frame {
  width: min(480px, 96vw);
  border-radius: 36px;
  padding: 16px 16px 0;
}
.ll-bento-device-frame--wide {
  width: 100%;
  max-width: 1200px;
}
/* + background, border, box-shadow, backdrop-filter */
```

Additional bento UI (topbar, tabs, action cards, etc.) is defined in the same file under `.ll-bento-bar`, `.ll-bento-tabs`, `.ll-bento-action-card`, etc.

---

## Flex chain order (unbroken for sticky footer)

For the footer to stay at the bottom when content is short, this sequence must be intact (each with `flex: 1 1 auto`, `min-height: 0`, `display: flex`, `flex-direction: column` unless noted):

1. **#ember-application-root** — `height: 100%`, `min-height: 100%` (not 0; root fills viewport).
2. **#within_ember** — flex container; `min-height: 0` so it can shrink.
3. **#content** — only scroll container; `overflow-y: auto`.
4. **#content > .ember-view** — when it wraps content, part of chain; when empty/ghost, collapsed (`flex: 0 0 0`, `height: 0`).
5. **#index_view** — or **#content > #index_view** when direct child of #content.
6. **.ll-bento-app-shell** — overrides base `display: grid` (rule placed after base block).
7. **.ll-bento-device-frame**
8. **.row.ll-bento-main-content**
9. **.col#bento-main**

If any link is missing those properties (e.g. `.ember-view` left as block, or shell left as grid), the chain collapses and the footer floats up.

---

## Layout summary (bento dashboard with footer)

| Element | Role |
|--------|------|
| **html, body, #ember-application-root** | `height: 100%`, `min-height: 100%` (root), `overflow-y: hidden` so the page does not scroll. Root is **not** given `min-height: 0` (that is for flex children in the chain). |
| **#within_ember** | `position: static`, `flex: 1 1 auto`, `height: 100%`, `min-height: 0`, `display: flex`, `flex-direction: column`. Flex container for header (fixed), #content, footer. |
| **header** | `position: fixed` at top; height `var(--topbar-height)`; z-index 1000. Does not take space in flex flow. |
| **#content** | Only scroll container. `flex: 1 1 auto`, `min-height: 0`, `padding-bottom: 0 !important` (beats `:has(.page-footer)` rule’s `var(--bottombar-height)`), `overflow-y: auto`, `padding-top: var(--topbar-height)`, `display: flex`, `flex-direction: column`. Targeted with and without `.index` when parent has `bento-page-with-footer`. |
| **#content > .ember-view** | When it wraps #index_view: in flex chain. When empty or `:not(:has(#index_view))` (ghost sibling): collapsed with `flex: 0 0 0`, `height: 0`, `overflow: hidden` so it doesn't split space. |
| **#content > #index_view** | When #index_view is direct child of #content (no wrapper or wrapper collapsed). `flex: 1 1 auto`, `min-height: 0`, `display: flex`, `flex-direction: column`. |
| **#index_view** | `flex: 1 1 auto`, `min-height: 0`, `display: flex`, `flex-direction: column`. Fills .ember-view. |
| **.ll-bento-app-shell** | `flex: 1 1 auto`, `min-height: 0 !important`, `display: flex`, `flex-direction: column`, `align-items: stretch`. Fills #index_view. Base block has no `min-height`; `min-height: 100% !important` is applied only when **not** in footer layout (`#within_ember:not(.bento-page-with-footer):not(:has(.page-footer)) .ll-bento-app-shell`) so it never appears in the cascade when the footer is shown. |
| **.ll-bento-device-frame** | `flex: 1 1 auto`, `min-height: 0`, `display: flex`, `flex-direction: column`. Fills shell; contains bento bar + .row.ll-bento-main-content. |
| **.row.ll-bento-main-content** | `flex: 1 1 auto`, `min-height: 0`, `display: flex`, `flex-direction: column`. |
| **.col#bento-main** | `flex: 1 1 auto`, `min-height: 0`, `display: flex`, `flex-direction: column`. Holds tabs and tab panels. |
| **.page-footer** | In-flow. `position: static`, `flex: 0 0 var(--bottombar-height)`, `height` / `min-height: var(--bottombar-height)`. |

---

## File references

| File | Responsibility |
|------|----------------|
| **app/index.html** | `<div id="ember-application-root">`; no extra wrappers. |
| **application.hbs** | `#within_ember`, class `bento-page-with-footer` when `this.showBentoPageWithFooter` (computed: `footer && index_or_for_schools_view && current_route !== 'for-schools'`), `#content` with `content_class`, `{{outlet}}`, `{{page-footer}}`. |
| **index.hbs** | `#index_view`, `Dashboard::AuthenticatedView`. |
| **components/dashboard/authenticated-view.hbs** | `.ll-bento-app-shell`, `.ll-bento-bg-orbs`, `.ll-bento-device-frame`, `.ll-bento-bar`, `.row.ll-bento-main-content`, `.col#bento-main`, `.ll-bento-span`, `.ll-bento-tabs`, tab content. |
| **components/page-footer.hbs** | `footer.page-footer`, `.wide_links`, `.row`, `.skinny_links`. |
| **app.scss** | All selectors above; variables; base `.ll-bento-app-shell` / `.ll-bento-device-frame`; bento UI (bento bar, tabs, cards). |
