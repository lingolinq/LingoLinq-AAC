# Recurring Styling Problems & Their Fixes

Quick-reference catalog of styling issues that have come up multiple
times during the modal/UI restyle work, with the standard fix for
each. When you hit one of these, paste the fix directly — don't
re-derive it.

---

## 1. Dropdown menu clipped by an `overflow: hidden` ancestor

**Symptom:** A dropdown opens but only the first option (or part of
the list) is visible. The rest is cut off at a parent card or panel
edge. The trigger looks correct; the menu just doesn't fully render.

**Cause:** The dropdown menu uses `position: absolute` so it floats
over surrounding content. If any ancestor has `overflow: hidden`
(common on rounded cards), the absolutely-positioned menu gets
clipped at the ancestor's bounds.

**Fix (preferred — flow-positioned dropdown):**
```scss
.parent-context .modern-select__list,
.parent-context .bound-select__list {
  position: static;
  /* `top/left/right` and z-index are irrelevant in static flow; the
     menu now occupies real layout space and pushes siblings down. */
}
```

**When to use it:** Forms or modals where the menu is one of several
fields stacked vertically — pushing content down when open is fine
and matches how iOS / native pickers behave.

**When NOT to use it:** Anything where the menu must overlay a fixed
container (e.g., a header pill that opens a tall list — the parent
isn't tall enough to grow). For those cases, find and remove the
`overflow: hidden` on the immediate ancestor instead.

**Examples in the codebase:**
- `.la-board-privacy-wrap .bound-select__list` — privacy modal
- `.md-edit-profile__form .modern-select__list` — `/<user>/edit` page
- `.modal-content .bound-select__list` — universal modal block
- create-board-new rail Paint section — first attempt reused the
  center toolbar's absolute `__paint-dropdown` (clipped + wrong
  theme). Real fix: reuse board-detail's own in-panel paint markup
  (`.md-board-edit-right-panel__paint-grid` / `__paint-pill` /
  `__custom-picker`), which is already flow-positioned and dark-themed
  for the rail. Lesson: when porting a control into the rail, reuse
  the rail's existing classes, not the toolbar's absolute ones.
- create-board-new rail `.md-settings-dropdown-menu` (skin/font/etc.) —
  bumping z-index did NOT help: the menu was clipped by PAGE-level
  `overflow: hidden` ancestors (`.beta-program-access`,
  `.with_user…content--no-top-padding`, `body`), which no z-index can
  escape. Two valid fixes depending on the requirement:
  1. **Flow-position** (`position: static`) — simplest, but the menu can
     only grow *inside* the panel (it can't spill out of a narrow rail, so
     labels truncate to the rail width). Use when in-panel is acceptable.
  2. **Anchored fixed positioning (floating-ui pattern)** — the intended
     answer when the menu must SPILL OUTSIDE its container (narrow rail).
     `position: fixed` + a JS positioner that sets top/right/max-height from
     the trigger's `getBoundingClientRect()`. NOTE: an in-house attempt at
     this for the create-board-new rail did NOT land cleanly (the inline
     coords never reliably applied; the menu kept rendering off-screen), so
     it was reverted and the **Skin Tones section was temporarily hidden**
     from the rail (`create_rail_sections` in create-board-new.js). STATUS:
     UNRESOLVED. The robust path if revisited is to PORTAL the menu to
     `<body>` via Ember's built-in `{{in-element}}` (what ember-basic-dropdown
     /Popper do) so it has no clipping ancestor at all, then position from the
     trigger — rather than hand-rolling fixed positioning in place.

**Diagnose the real clipper (don't guess at z-index):** with the dropdown
open, run an ancestor-walk in the console that reports each ancestor's
`overflow`/`transform`/`clipPath`/`contain` and flags any whose box ends
before the menu's edge. The flagged node IS the clipper. z-index only ever
helps for sibling-stacking, never for an `overflow: hidden` ancestor — the
fix is flow-positioning (#1) or anchored `fixed` (#2), never a higher
z-index. `fixed` is only safe to escape overflow when NO ancestor has
`transform`/`filter`/`perspective`/`contain` (each makes itself the
containing block for fixed descendants); the same console walk confirms
that.

---

## 2. Dropdown menu floats above the navbar / topbar when scrolling

**Symptom:** Open a dropdown, scroll the page, and the dropdown's
menu visibly overlaps the sticky navbar at the top of the screen.

**Cause:** Dropdown z-index (often `1050`) > navbar z-index
(`$aac-z-topbar: 400`). When the user scrolls, both the absolute
dropdown and the sticky navbar occupy the same vertical region; the
higher z-index wins.

**Fix:** Drop dropdown z-indexes BELOW the topbar:
```scss
.modern-select__list,
.bound-select__list,
/* any custom *__list */ {
  z-index: 150; /* < $aac-z-topbar (400) */
}
```

The `$aac-z-*` scale defines the contract:
| Token | Value |
|---|---|
| `$aac-z-base` | 1 |
| `$aac-z-dropdown` | 100 |
| `$aac-z-modal` | 200 |
| `$aac-z-toast` | 300 |
| `$aac-z-topbar` | 400 |

Stay below 400 for any in-page floating UI.

---

## 3. Light / dark mode color bleed (icon vanishes on the wrong surface)

**Symptom:** An icon, label, or text element is the same color as
its background — invisible. Most often happens after switching
between light and dark mode contexts (e.g., a board-detail icon on
the dark toolbar gradient).

**Cause:** The base rule sets a `$la-navy` (or `$brand-charcoal-*`)
color that looks fine on light surfaces but disappears on the dark
gradient bg used by the same component in dark mode. SVGs using
`stroke="currentColor"` inherit this dead color.

**Fix:** Add a dark-mode override that explicitly sets BOTH the CSS
`color` property AND, for SVG icons, `stroke` directly (so the SVG
isn't relying on `currentColor` inheritance which can be overridden
by a deeper rule):
```scss
.md-board-detail--dark .my-component {
  color: rgba(255, 255, 255, 0.92);
}
.md-board-detail--dark .my-component svg {
  stroke: rgba(255, 255, 255, 0.92);
}
```

---

## 4. CSS source-order conflict between base + media-query rules

**Symptom:** A `@media (max-width: 640px)` override at line N seems
to do nothing — the base rule at line N+1000 still wins.

**Cause:** Two rules with the **same specificity** — the LATER one
in source order wins, regardless of whether one is inside a media
query. Media queries don't add specificity.

**Fix (pick one):**
- **Move the base rule earlier** in source so the media-query rule
  comes after it (cleanest, most idiomatic).
- **Bump specificity** on the media-query rule by adding an
  ancestor: `.modal .my-class { ... }` → 0,2,0 vs base `.my-class`
  at 0,1,0.

**Example burn:** the skin-tones popover at `:has(.md-modal-app-stores)`
needed an extra `.modal-content` ancestor in its `@media` rule because
the base `.md-settings-skin-trigger.md-settings-select--trigger` rule
was defined later in the file at equal specificity and was winning.

---

## 5. `background` shorthand vs `background-color` / `background-image` longhand

**Symptom:** Setting `background-color` on a hover state doesn't
override a base rule's gradient — the gradient still shows.

**Cause:** The base rule used the `background` shorthand, which CSS
treats as setting all sub-properties (color, image, position, etc.).
The hover rule only sets `background-color`, but the shorthand has
"already declared" all sub-properties — at equal specificity, the
shorthand wins.

**Fix:** Use the same form as the rule you're overriding. If the base
uses shorthand, override with shorthand. Or use `!important` on the
longhand if the base is unfixable. Common pattern:
```scss
.target {
  background-color: $brand-slate-blue !important;
  background-image: none !important;
  color: #fff !important;
}
```

---

## 6. `:has()`, `(and ...)`, `(not ...)` helpers don't exist

**Symptom:** A template conditional like
`{{else if (and (not this.x) (not this.y))}}` silently fails — the
branch never matches.

**Cause:** `ember-truth-helpers` is **not installed** in this
codebase. `(and ...)` / `(or ...)` / `(not ...)` are template helpers
from that package; without it they evaluate as undefined → the whole
condition is falsy.

**Fix:** Use plain nested `{{#if}}` / `{{else if}}` / `{{else}}`
blocks. Restructure the logic to avoid compound boolean helpers.

CSS `:has()` is available — that's a browser feature, not an Ember
helper.

---

## 7. Modal header/footer class inconsistency

**Symptom:** A universal `.modal-header { ... }` rule applied to
every modal works for most but skips a few.

**Cause:** The codebase has 4+ different header class names:
- `modal-header` (Bootstrap base)
- `md-modal-header` (modern variant)
- `la-modal-header` (landing-alt heritage — also used on real modals)
- `md-getting-started-modal__header` (custom)

Ditto for footers:
- `modal-footer`, `md-modal-footer`
- `la-*-modal-footer` prefixed variants (`la-record-note-modal-footer`,
  `la-valet-modal-footer`, `la-assign-lesson-modal-footer`, etc.)

**Fix:** When defining a universal modal-header rule, list every
alias and scope each by `.modal` ancestor so the landing-alt
standalone usage isn't affected:
```scss
.modal-content > .modal-header,
.modal .modal-header,
.modal .md-modal-header,
.modal .md-getting-started-modal__header,
.modal .la-modal-header { ... }
```

**Corollary (2026-08-27) — changing ONE modal's header/footer padding.**
That universal block lives at the very end of `app.scss` and sets
`padding-top/bottom: 28px` at specificity (0,2,0). A per-modal rule
`.la-<x>-modal-wrap .la-modal-header` is also (0,2,0) and sits earlier,
so its vertical padding **never applies** — editing it in place looks
correct and changes nothing on screen. Fix: edit that modal's existing
rule in place but qualify it, `.modal .la-<x>-modal-wrap .la-modal-header`
(0,3,0). Never edit the universal block for a single modal.

Also check whether the modal even *has* a footer: `modal-dialog.hbs`
yields straight into `.modal-content`, so many modals render only a
header and a body. For those the "footer padding" is the body rule's
bottom padding, and the universal `*-modal-footer` selectors match
nothing.

---

## 8. Empty array rendered as broken / blank state

**Symptom:** A list view shows a blank body when the user has no
data, or a "Loading…" spinner that never resolves, or a generic
error.

**Cause:** Templates often check `{{#if collection}}{{#each}}…{{/each}}{{/if}}` —
which is truthy for an empty array, so the `{{#each}}` renders zero
items and the `{{else}}` empty-state never fires. Separately, some
APIs return `404` instead of `[]` for "user has no X yet" — which
the controller logs as an error rather than empty.

**Fix:** Differentiate three states in the template:
```hbs
{{#if collection.loading}}
  <p>Loading…</p>
{{else if collection.error}}
  <p>Couldn't load — try again.</p>
{{else if collection.length}}
  {{#each collection as |item|}}…{{/each}}
{{else}}
  <p>No items yet — friendly empty-state copy here.</p>
{{/if}}
```

For dropdowns, use the shared `.dropdown-empty` (or the
`bound-select__empty` / `modern-select__empty`) row pattern.

---

## 9. Modal opened via dev console without a model errors out

**Symptom:** `modal.open('badge-awarded')` shows a Promise but the
modal renders blank, or the controller throws
`Cannot read properties of undefined (reading 'X')`.

**Cause:** Most modals expect a model object with specific shape.
`modal.open(name)` with no second arg means `model` is undefined, and
the controller's `.get('model.badge.id')` etc. blows up.

**Fix:** For visual testing, pass a mock object — see
`docs/modal-testing-commands.md` "Mock fixtures". For end-to-end
testing, use the UI navigation paths in that doc. For hardening the
component, gate accesses with `{{#if this.model.X}}…` and provide
empty-state branches.

---

## 10. SCSS variable shorthand recompute on dependency change

**Symptom:** Updated `$fitzgerald-verb-green` but the soft-mode swap
didn't update.

**Cause:** Often nothing — Sass recomputes derived variables on every
build. The "miss" was a stale browser CSS cache.

**Fix:** Hard-reload (Cmd+Shift+R / Ctrl+Shift+R) to bust the cached
`app.css`. If it persists, the derived variable might be hand-rolled
instead of `color.adjust(...)` from the base — check
`_variables.scss` for `-soft` / `-aa` derivatives.

---

## 11. Custom-select dropdowns lack keyboard navigation

**Symptom:** Open a custom dropdown (`modern-select`, `bound-select`,
`user-select`, etc.), press Tab or arrow keys, and the **entire list
appears highlighted** instead of focus moving option-by-option.
Pressing Enter doesn't select anything.

**Cause:** The `<li role="option">` elements have no `tabindex` set,
so they're not focusable. The browser falls back to focusing the
`<ul>` itself (or skips the whole dropdown on Tab), and a single
focused full-width container looks like a giant block of highlight.

**Fix (per component):**

1. **Template** — give each option `tabindex="0"` and wire a keydown
   handler:
   ```hbs
   <li role="option" tabindex="0"
       {{action "choose" item}}
       {{action "option_keydown" item on="keydown"}}>
     {{item.name}}
   </li>
   ```

2. **Component JS** — handle ArrowUp / ArrowDown / Home / End / Enter /
   Space / Escape (move focus, select, close). Auto-focus the
   currently-selected option when the dropdown opens so navigation
   has a sensible starting point. After a selection, return focus
   to the trigger so Tab resumes from the dropdown's position.

3. **SCSS** — distinguish keyboard `:focus-visible` from mouse
   `:hover` so the active option stands out during arrow-key nav:
   ```scss
   .my-select__option:focus-visible {
     box-shadow: inset 0 0 0 2px rgba($brand-verdigris, 0.55);
   }
   ```

**Reference implementation:** `modern-select` was the first to get
this treatment. Mirror its template + component + CSS pattern for any
other custom dropdown.

**Status:**
- ✅ `modern-select` — fixed (template + component + CSS)
- ✅ `bound-select` — fixed (template + component + CSS)
- ⚠️  `user-select` dropdown ("Other User" picker) — uses Bootstrap's
  `data-toggle="dropdown"` plugin which provides arrow-key
  navigation natively for `<a>` items. Works without the per-component
  fix. Verify in browser; only patch if Bootstrap's nav doesn't kick in.
- ⬜ Other Bootstrap `<ul class="dropdown-menu">` instances — same as
  above, rely on Bootstrap's built-in keyboard nav. Patch only if
  individual sites are broken.

---

## 12. CSS changes don't show up on the Rails server (`:5000`) but do on Ember (`:8184`)

**Symptom:** You're styling the modern UI on `localhost:8184` (the
Ember dev server), everything looks right. Then you check the same
page on `localhost:5000` (the Rails app server) and the styling is
stale or completely missing — old colors, old layout, old chrome.

**Cause:** The two servers source frontend assets differently:

- **`localhost:8184`** = Ember CLI dev server (`ember serve`) — serves
  `app/frontend/dist/` directly, with hot reload on every Sass / JS
  change.
- **`localhost:5000`** = Rails server (`rails s`) — serves static
  assets from `public/` via symlinks that point into the Ember dist
  output. If the symlinks haven't been refreshed, Rails serves
  whatever files were linked the LAST time `extras:assert_js` ran.

When you start a fresh dev session — or after `npm install`, or
after `ember build` finishes its first pass — the symlinks may not
exist yet (or may point at stale paths). Rails then 404s on the
new asset hashes or serves an old bundle.

**Fix:** From the project root, run:
```bash
bundle exec rails extras:assert_js
```

That rake task creates / refreshes the symbolic links between
`public/<asset>` and `app/frontend/dist/<asset>`. After it runs,
`localhost:5000` picks up the same compiled CSS/JS the Ember dev
server is serving. CLAUDE.md flags this as part of initial Rails
setup, but it's also the right move any time the Rails-rendered
pages look stale relative to Ember.

**When to run it:**
- First time setting up the project (`db:create` / `db:migrate`
  step)
- After pulling a branch that added new assets / renamed files
- Whenever `localhost:5000` looks visually behind `localhost:8184`
- After `npm install` adds new vendor JS
- If you see 404s for `/assets/...` or `/frontend/...` paths in the
  Rails request log

It's idempotent — running it when nothing's wrong is harmless.

---

## 13. `registration_type` is intentionally optional (not a bug)

**Symptom:** A seeded test user (or a real user who skipped the
"Type" field at registration) shows "- Select -" in the Login Role
dropdown on `/<user>/edit`, instead of "Communicator" or whatever
their org-context role is.

**Cause:** Two separate role concepts:
- **Org-context role** (`UserLink.role`) — `user` / `supervisor` /
  `manager` / `eval` per-org
- **`preferences.registration_type`** — self-identification, app-
  wide (`communicator`, `parent`, `therapist`, etc.)

The dropdown binds to `registration_type`. The seed (and the
registration form) don't require it; the field defaults to `null`
in the DB. The Ruby getter masks `null` as `'unspecified'` for
backend logic, but JSON serializes the raw `null` so the frontend
gets nothing matching a dropdown id → "- Select -" placeholder.

**Status:** ⚠️ **Working as designed.** The original architecture
(intact since the 2016 first commit) treats `'unspecified'` as
equivalent to `'communicator'` in `User#supporter_registration?` —
so a user who hasn't picked a type defaults to communicator
behavior throughout the app.

**Don't "fix" by:**
- ❌ Forcing the registration form to require a pick (changes
  product behavior — currently low-friction signup is intentional)
- ❌ Defaulting to `'communicator'` server-side (loses the
  distinction between "user picked communicator" and "user didn't
  pick")

**Reasonable cosmetic options if it looks weird:**
- Pre-populate `registration_type` in `lib/seed_organization.rb`
  for QA fixtures only (option C in the team-discussion bucket)
- Change the placeholder text from "- Select -" to "Communicator
  (default)" or italic muted-gray "Not specified"

---

## How to add to this doc

When you encounter a new repeating problem:

1. Reproduce it once and note the symptom.
2. Find the cause (DevTools, source grep).
3. Add a numbered section above with: **Symptom**, **Cause**, **Fix**,
   and ideally a code snippet + 1-2 example sites in the codebase.

Keep entries terse. The goal is "open this doc, scan headings, find
your fix in 10 seconds."
