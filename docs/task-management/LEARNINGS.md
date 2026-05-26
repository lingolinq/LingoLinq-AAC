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
- [Pattern: SVG gradient ID refs inside CSS data URIs mangled by Rails Sprockets in production](#pattern-svg-gradient-id-refs-inside-css-data-uris-mangled-by-rails-sprockets-in-production)
- [Pattern: app.scss contains byte-identical duplicate rules — the LATER copy wins](#pattern-appscss-contains-byte-identical-duplicate-rules--the-later-copy-wins)
- [Pattern: Speak-mode vs edit-mode right-panel selectors look near-identical](#pattern-speak-mode-vs-edit-mode-right-panel-selectors-look-near-identical)
- [Pattern: Atmospheric depth surface formula — replace hard 1px borders with layered shadows + glass veil](#pattern-atmospheric-depth-surface-formula--replace-hard-1px-borders-with-layered-shadows--glass-veil)
- [Pattern: `__label-collapsed` is a multi-role class — scope by parent before styling](#pattern-__label-collapsed-is-a-multi-role-class--scope-by-parent-before-styling)
- [Pattern: "Shrink to fit" is a per-label content-aware problem, not container-scaling — reach for capabilities.fit_text](#pattern-shrink-to-fit-is-a-per-label-content-aware-problem-not-container-scaling--reach-for-capabilitiesfit_text)
- [Pattern: board-detail label surface has TWO elements — `__label` (span) and `__label-input` (input)](#pattern-board-detail-label-surface-has-two-elements--__label-span-and-__label-input-input)
- [Pattern: `organizations.admin` is a singleton boolean, not a normal flag](#pattern-organizationsadmin-is-a-singleton-boolean-not-a-normal-flag)
- [Pattern: settings-backed API flags should be cast before Ember consumes them](#pattern-settings-backed-api-flags-should-be-cast-before-ember-consumes-them)
- [Pattern: duplicate selectors in `app.scss` can leave stale layout constraints active](#pattern-duplicate-selectors-in-appscss-can-leave-stale-layout-constraints-active)
- [Pattern: RESERVED_ROUTES blocks intended system usernames in seeds](#pattern-reserved_routes-blocks-intended-system-usernames-in-seeds)

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

## Pattern: SVG gradient ID refs inside CSS data URIs mangled by Rails Sprockets in production

**Surface:** any CSS rule shipping a `background-image:
url("data:image/svg+xml,...")` data URI whose embedded SVG uses
`fill="url(#someId)"` (or `stroke="url(#someId)"`) fragment refs to
its own `<linearGradient>` / `<radialGradient>` defs.

**Symptom:** the SVG renders **with all solid-color fills present
and every gradient-filled element invisible**, in production /
deployment only. Local Ember dev server (`localhost:8184`) is
fine. Classic shape on this codebase: an avatar silhouette where
the head (solid color) renders but the body (gradient fill) is
transparent — "hollow shell" look.

**Root cause:** Rails Sprockets / the production asset pipeline
runs every `url(...)` reference in CSS through `asset_path` for
URL normalization. It doesn't special-case fragment refs
(`url(#xxx)`) inside `data:` URIs. The source SVG's
`fill='url(%23m)'` (encoded `url(#m)`, a same-document fragment
ref) gets rewritten to `fill='url(/%23m)'` — a path-rooted URL
with fragment `#m`, which doesn't resolve to a gradient definition
inside the SVG. Per the SVG spec the fill then becomes `none` →
transparent. The Ember dev server doesn't run Sprockets, which is
why local was unaffected.

**The same family includes** the older bug at
[app.scss:2473-2479](app/frontend/app/styles/app.scss#L2473-L2479)
where inline `<svg>` in HTML templates had the same gradient-ref
mangling at a different layer of the build. Moving to a CSS data
URI fixed THAT site but landed in this one. There may be other
sites with the same pattern.

**Fix recipe:**

1. **Do not use `url(#id)` refs inside any SVG that ships through
   the production CSS pipeline as a data URI.** Strip the `<defs>`
   block. Replace every `fill="url(#X)"` and `stroke="url(#X)"`
   with a solid hex color picked from the gradient's palette
   (a midpoint, or a brand-anchored endpoint).
2. If the gradient effect is essential to the design, layer the
   gradient via the CSS `background:` property
   (`linear-gradient(...)`) instead of inside the SVG — CSS
   gradients don't go through Sprockets URL normalization. You can
   stack a CSS gradient *under* an SVG that only contains
   solid-color elements.
3. Pin the constraint with a code comment so the next person who
   tries to "improve" the design by reintroducing a gradient knows
   why it'll break.

**How to detect this in the wild:** grep CSS source for
`data:image/svg.*url\(%23` — any match is a candidate for
production breakage. Compare the SOURCE data URI vs the DEPLOYED
data URI (DevTools → Computed styles → background-image value): if
you see `/` prepended to fragment refs in deployment, you have the
bug.

**First seen in:** [2026-05-24-identity-dropdown-avatar-hollow-shell.md](./2026-05-24-identity-dropdown-avatar-hollow-shell.md)


---

## Pattern: app.scss contains byte-identical duplicate rules — the LATER copy wins

`app/frontend/app/styles/app.scss` is a >86k-line file and several
dark-mode rules have been copy-pasted into multiple locations. Editing
only the first occurrence appears to do nothing because the later
occurrence wins the cascade (same selector, same specificity → source
order decides).

**Examples observed (2026-05-25):**
- `.md-board-detail--dark .md-board-edit-panel` exists at ~80105 AND ~82668
- `.md-board-detail--dark .md-board-edit-right-panel` exists at ~81409 AND ~84509
- `.md-board-detail--dark .md-board-detail-edit-toolbar` exists at ~63823 AND ~68371

**Detection:** before editing any dark-mode rule in `app.scss`, run
`grep -n "<exact selector>"` against the file. If you see >1 match,
either edit both (use `Edit` with `replace_all` after confirming the
two blocks are byte-identical) or pick the later one — never edit
only the earlier copy and assume it took.

**Why the duplicates exist:** mostly historical — multiple feature
branches merged in styles that happened to redefine the same dark-mode
chrome. Consolidating them is a separate refactor; for now the rule is
"update every copy in lockstep" so the cascade winner always sees your
change.

**First seen in:** [2026-05-25-board-detail-edit-dark-mode-panel-tiers.md](./2026-05-25-board-detail-edit-dark-mode-panel-tiers.md)

---

## Pattern: Speak-mode vs edit-mode right-panel selectors look near-identical

The board-detail page has TWO right panels with very similar class
names — one for each mode of the page:

- `.md-board-detail-right-panel` — used in SPEAK mode (the
  non-edit board-detail layout). Transparent by default in dark
  mode; sits over the page canvas.
- `.md-board-edit-right-panel` — used in EDIT mode. Has its own
  gradient fill + shadow chrome (it is one of the three "rail"
  surfaces flanking the center board stage).

They differ by a single hyphen-segment (`detail` vs `edit`) and it is
extremely easy to grab the wrong one when fixing edit-mode styling.

**How to confirm you have the right one:** the edit-mode element only
renders when the shell carries `.md-shell--board-detail-edit`. Search
the `.hbs` template for the class name first — `app/frontend/app/
templates/user/board-detail.hbs` will use one or the other depending
on the `editing` branch.

**Same gotcha lives on the left side:** `.md-board-edit-panel` is the
edit-mode left rail; there is no symmetric speak-mode counterpart at
that path (the speak-mode left is `.md-board-detail-sidebar`). So the
`*-edit-*` prefix is the reliable signal that you are looking at an
edit-mode chrome element.

**First seen in:** [2026-05-25-board-detail-edit-dark-mode-panel-tiers.md](./2026-05-25-board-detail-edit-dark-mode-panel-tiers.md)


---

## Pattern: Atmospheric depth surface formula — replace hard 1px borders with layered shadows + glass veil

**Surface:** any chrome panel / card / toolbar on the app that's still
relying on `border: 1px solid rgba(...)` for visual separation. The
boards page already uses an "atmospheric" technique that reads as
premium-SaaS; other pages (board-detail edit, modals, etc.) still
have a 2010s-era hard-edge look until they're transitioned.

**The four-ingredient recipe** (replace ALL of `border: 1px solid
rgba(x, .10–.22)` with these in combination):

1. **Hairline border** — `border: 1px solid rgba(navy-or-white, .04–.08)`.
   At this alpha the border is below the perception threshold for
   "stroke" but still anchors the rounded corners cleanly. Don't drop
   the border entirely or radius corners go soft.
2. **Translucent glass veil (dark mode only)** — layer
   `linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.015))`
   ABOVE the existing panel-surface gradient using CSS multi-layer
   `background:`. Reads as ambient light catching the surface from
   above; solid gradients alone can't produce this quality.
3. **Three-tier shadow stack** — close + mid + broad. The mid is the
   existing convention (`0 8px 24px @ low alpha`); the new ingredient
   is the **broad ambient haze**: `0 24px 60px rgba(x, .06–.30)` (or
   `0 16px 40px` for thinner surfaces like toolbars). This is what
   creates the "fade into the canvas" haze you can't get from a stroke.
4. **Inset top-edge highlight** — `inset 0 1px 0 rgba(255,255,255, A)`.
   Bright in light mode (A=.65–.95); subtle in dark mode (A=.05–.10).
   Pairs with the outer broad shadow to create directional lighting:
   bright above, dark below.

**Light-mode rail template:**
```scss
background: linear-gradient(180deg, #ffffff 0%, #f1f4f8 100%);
border: 1px solid rgba($la-navy, 0.06);
box-shadow:
  0 1px 2px  rgba($la-navy, 0.04),
  0 8px 24px rgba($la-navy, 0.07),
  0 24px 60px rgba($la-navy, 0.06),
  inset 0 1px 0 rgba(255, 255, 255, 0.65);
```

**Dark-mode rail template** (layer over your existing panel-surface base):
```scss
background:
  linear-gradient(180deg, rgba(255,255,255, 0.04), rgba(255,255,255, 0.015)),
  linear-gradient(180deg, <panel-base-1> 0%, <panel-base-2> 100%);
border-color: rgba(255, 255, 255, 0.06);
box-shadow:
  0 1px 2px  rgba(0, 0, 0, 0.20),
  0 8px 24px rgba(0, 0, 0, 0.22),
  0 24px 60px rgba(0, 0, 0, 0.30),
  inset 0 1px 0 rgba(255, 255, 255, 0.06);
```

**For recessed wells** (a panel that should read as INSET, not raised
— e.g. the live-preview region above a board grid): keep the
hairline border at .04–.06 alpha, but invert the shadow direction —
use `inset 0 2px 8px rgba(0, 0, 0, .35)` (inward) instead of an outer
ambient haze. A subtle outer haze underneath the well is fine to
ground it on the page.

**Anti-pattern to avoid:** dropping the border entirely and trying to
delineate purely with shadow. The rounded corners lose definition and
look "un-resolved" at certain zoom levels. The .04–.08 hairline is
load-bearing even when imperceptible.

**Don't apply this everywhere:** chip-style pill buttons (e.g.
toolbar tap-targets at `border-radius: 999px`) genuinely need a
visible 1px border for affordance. Only swap chrome surfaces —
panels, rails, toolbars, sections — not interactive controls.

**First seen in:** [2026-05-25-board-detail-edit-atmospheric-depth.md](./2026-05-25-board-detail-edit-atmospheric-depth.md)

---

## Pattern: `__label-collapsed` is a multi-role class — scope by parent before styling

On the board-detail edit panels (`md-board-edit-panel`), the same
`__label-collapsed` class is used in two distinct contexts that
visually want **different** treatments:

1. **Panel header caption** ("ACTIONS") — lives inside
   `.md-board-edit-panel__header`. Should match SETTINGS
   (`__title-collapsed`) typography: 10px / 700 / inherited body
   color.
2. **Sub-label captions** ("BOARDS", "SEARCH", "COPY", …) — live
   inside `__filter-toggle`, `__search`, `__tile`. Should sit quieter
   than the header: 9px / 500 / reduced alpha.

Targeting `.md-board-edit-panel--collapsed .md-board-edit-panel__label-collapsed`
alone catches BOTH roles. Always scope by parent:

```scss
/* Header ACTIONS — louder */
.md-board-edit-panel--collapsed .md-board-edit-panel__header .md-board-edit-panel__label-collapsed { ... }

/* Sub-labels — quieter, EXCLUDED from header via specificity */
.md-board-edit-panel--collapsed .md-board-edit-panel__label-collapsed { ... }
```

The 3-class header selector (specificity 0,3,0) beats the 2-class
sub-label selector (0,2,0) without needing `!important`. The same
pattern applies symmetrically to the right rail (`__title-collapsed`
vs `__section-label-collapsed`), but those classes are already
distinct so the parent-scoping trick isn't needed there.

**First seen in:** [2026-05-25-board-detail-edit-collapsed-left-panel-spacing.md](./2026-05-25-board-detail-edit-collapsed-left-panel-spacing.md)

## Pattern: "Shrink to fit" is a per-label content-aware problem, not container-scaling — reach for capabilities.fit_text

**Surface:** any label-fit feature on board buttons (the "Shrink labels
to fit" preference on the board-detail page; the same intent might
surface later on create-board-new or the classic board).

**Symptom:** Reaching for `clamp()` / `min(cqw, pref)` / container
queries to "shrink labels" produces uniform card-width-driven scaling
— every label on a card shrinks together, including 2-character words
that already fit. The toggle either has no visible effect (when the
clamp's preferred value exceeds the user-pref upper bound on typical
card sizes) or shrinks short labels needlessly.

**Root cause:** CSS sees container size, not text length. "Shrink
labels to fit" is a **per-label** problem: only labels whose text
would overflow at the chosen size need to shrink, and each one needs
its OWN measurement. CSS alone can't see how long a given label is.

**Resolution:** The codebase has `capabilities.fit_text(str, font, w,
h, min)` at
[`app/frontend/app/utils/capabilities.js:1815`](../../app/frontend/app/utils/capabilities.js#L1815) —
an offscreen-canvas measurer that walks the font down from a starting
upper bound to a floor and returns the first size where the rendered
text fits within `width * 0.9` (with a height ratio check). Already
used by the legacy classic board at
[`utils/button.js:459`](../../app/frontend/app/utils/button.js#L459)
and the find-a-button suggestions at
[`models/board.js:1519`](../../app/frontend/app/models/board.js#L1519).
For wrapped labels (multi-line spans) DOM measurement is needed
instead — see
[`app/frontend/app/utils/label_fit.js`](../../app/frontend/app/utils/label_fit.js)
for the wrap-aware implementation.

**Transition gotcha:** when label_fit drives inline `font-size` and
the label also has a CSS `transition: font-size`, the iterative
measure loop will visibly flicker through every intermediate size
unless the transition is disabled for the duration of the measure
(see `fitWrapped` for the pattern: set `style.transition = 'none'`
before the measure loop, restore after — the final caller-applied
size still animates).

**First seen in:**
[2026-05-26-shrink-labels-to-fit.md](./2026-05-26-shrink-labels-to-fit.md)

## Pattern: board-detail label surface has TWO elements — `__label` (span) and `__label-input` (input)

**Surface:** the board-detail grid (and any new label feature added to
it).

**Symptom:** A new CSS rule scoped to `.md-board-detail-symbol-card__label`
works in speak/view mode but is silently a no-op in edit mode (or
vice versa). The "live preview" on the edit page doesn't reflect the
new treatment even though the toggle is wired correctly.

**Root cause:** The grid renders the label as TWO different elements
depending on `editMode`:

- `editMode === false` (speak/view): the label is a `<span class="md-board-detail-symbol-card__label">`
  rendered at
  [`templates/components/board-detail-grid.hbs:201`](../../app/frontend/app/templates/components/board-detail-grid.hbs#L201).
- `editMode === true` (edit live-preview): the label is a `label-field`
  component (rendered as `<input class="md-board-detail-symbol-card__label-input">`)
  at
  [`templates/components/board-detail-grid.hbs:195`](../../app/frontend/app/templates/components/board-detail-grid.hbs#L195).

Any styling treatment that affects the label MUST cover both selectors
(or split them — span gets `-webkit-line-clamp`-style multi-line
behaviour, input is intrinsically single-line). The generic
`.md-board-detail-symbol-card__label, .md-board-detail-symbol-card__label-input`
font-family + font-size rules at
[`app.scss:63468`-ish](../../app/frontend/app/styles/app.scss) are the
canonical example of this pairing.

**First seen in:**
[2026-05-26-shrink-labels-to-fit.md](./2026-05-26-shrink-labels-to-fit.md)

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

## Pattern: settings-backed API flags should be cast before Ember consumes them

**Surface:** Rails JSON serializers that expose values from `settings` or other
schemaless payloads and Ember templates that branch on them with `{{#if ...}}`.

**Symptom:** The UI shows a truthy state such as "Requested" even when the
stored value is the string `'false'`.

**Root cause:** Ruby will happily pass through string values from schemaless
storage, and Ember treats any non-empty string as truthy in template
conditionals. A write path may normalize new records correctly, but legacy or
manually inserted records can still surface string booleans.

**Fix:** In the serializer, cast the flag with
`ActiveModel::Type::Boolean.new.cast(...)` before returning JSON to the
frontend. See `lib/json_api/beta_feedback.rb` for the beta feedback admin case.

**First seen in:** [2026-05-26-beta-feedback-request-virtual-meeting-boolean](./2026-05-26-beta-feedback-request-virtual-meeting-boolean.md)

---

## Pattern: duplicate selectors in `app.scss` can leave stale layout constraints active

**Surface:** large page-specific layout bugs where a component appears to ignore the "current" style block in `app/frontend/app/styles/app.scss`.

**Symptom:** the rendered page keeps an old width, margin, or sizing behavior even though a later selector with the same name looks correct.

**Root cause:** `app.scss` is large enough that the same selector can be defined twice in distant sections. If the earlier block sets a layout property like `width`, a later duplicate block that restyles typography but does not reset that property will still inherit the earlier constraint.

**Fix recipe:** search for all occurrences of the selector before patching, then remove or update the original authoritative rule instead of stacking on a more specific override. For the beta feedback inbox, the first `.la-beta-feedback-admin__body` block set `width: 160px`, while the later block only changed text styles.

**Evidence:** `app/frontend/app/styles/app.scss` duplicate `.la-beta-feedback-admin__body` blocks found on 2026-05-26.

**First seen in:** [2026-05-26-beta-feedback-admin-table-width.md](./2026-05-26-beta-feedback-admin-table-width.md)

---

## Pattern: RESERVED_ROUTES blocks intended system usernames in seeds

**Surface:** `db/seeds.rb` creating users with `User.process_new`, especially the official `lingolinq` vocabulary account.

**Symptom:** Seed creates `lingolinq_1` instead of `lingolinq`; re-running seeds creates duplicate users because `User.find_by(user_name: 'lingolinq')` never matches. Default sidebar board key `lingolinq/yesno` never resolves.

**Root cause:** `LingoLinq::RESERVED_ROUTES` (`config/routes.rb`) is checked in `Processable#generate_unique_key`; reserved names get suffixed. The `example` seed user works because `example` is not reserved.

**Fix:** Remove the username from `RESERVED_ROUTES` only when no dedicated app route needs that path (there is no `get 'lingolinq'` — `/lingolinq` is handled by the generic user profile route). Harden seeds with email fallback and `rename_to` for legacy `lingolinq_*` accounts.

**First seen in:** [2026-05-26-lingolinq-seed-username.md](./2026-05-26-lingolinq-seed-username.md)
