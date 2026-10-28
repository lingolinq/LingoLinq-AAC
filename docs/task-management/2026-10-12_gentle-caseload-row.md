# 2026-10-12: Gentle caseload row, admin without Speak, caseload-light image

Branch: `traci/fix/scots-review-fixes`. Uncommitted at the time of writing.

## Asked
1. Modern Gentle: My Caseload top left, then Speak Mode, then Extras, in one row at equal sizes, with
   Focused's button heights.
2. Admin users: no Speak button on the home page.
3. Gentle My Caseload: the caseload-light image instead of the icon on its icon background.

## Decisions (Traci, 2026-10-12)
- The row leads the page for everyone with a caseload, org managers included (above My Organizations).
- 900px and below: the three stack, one per row (as Focused stacks Speak and Extras).
- "Admin" is the registry's own role name for an org manager (`hero_for: 'admin'`, `hasOrgManagement`).
- Four existing tests updated to the new spec (approved): the org-manager divergence test, the Focused
  Speak-toggle test, and the Focused and Gentle reading-order tests.

## How it works
- `utils/dashboard_sections.js`: `caseloadRowFirst` moves Caseload and its visible partners to the front
  at both Gentle seams (live grid and editor default). `packOrder` emits them as one row; with three,
  `dashboardLayout` widens Gentle to six columns. The full-width check in `gridLayoutState` compares
  every cell (a third is two cells). Classes `md-grid--caseload-row` and `-3` drive the CSS.
- Speak `available()` is false for an org manager, so both layouts drop it and Dashboard Design does not
  offer it. On Focused this ends the org Caseload | Speak bottom pair: Caseload is a full row after the
  My Organizations hero.
- `app.scss`: the caseload-light swap moved out of the >=951px full-width block to every Gentle Caseload
  button; the supervisor action-card rule (-14px pull-up) no longer applies to Extras in the row; a new
  block scoped to `md-grid--caseload-row` gives the three Focused's height curve
  (`clamp(84px, 12vw - 24px, 120px)`), padding, image sizes and text sizes. At 901-1200px with three
  across the image is 80% of Focused's and the title steps 18px to 14px, so the text fits.

## Verified
- Unit: 66/66 dashboard utility tests (6 new caseload-row, 3 new admin). Lint gate: no new findings.
- Browser (marcus_williams_slp, a non-admin supervisor; sarah_chen_slp, an org manager; prefs restored):
  heights equal Focused at 1440/1201/1100/1025/1024/951/950/901 (120/120/108/99/99/90/90/84) and 84 when
  stacked at 900/600/390; content inside every button at every width.
- Not run: the full Ember suite.

## Open
- At 901-1100px the subtitles shorten with an ellipsis ("Manage your...", "Tools &...").
- Communicators' Gentle Speak and Extras are unchanged (not in the request).

## Later the same day
- **Admin row below My Organizations** (requested: "for an admin user, move caseload and extras buttons
  below organizations div"). `caseloadRowFirst` now inserts the row directly after 'org' when the grid
  has `vis.org` (or, for the editor's default with no `vis`, when the order is led by 'org'). Two tests
  that pinned "above" were updated (approved). Verified live on sarah_chen_slp: My Organizations, then
  Caseload | Extras.
- **Focused My Caseload styled like Speak** (requested: "give the my caseload button the same bg and
  style as the speak mode on modern focused"; Traci chose both buttons). The `--caseload-focused` card
  (Speak's navy radial already) now shows for admins as well as supervisors, replacing the admin's pale
  `--caseload-action` row, and takes Speak's sizes: 120px tall, 94px image, 21px title, the same
  scaling below 1200px and 1024px. It was 220px with a 144x148 image and a 25px title. Verified live
  (marcus_williams_slp and sarah_chen_slp, prefs restored): equal to Speak at every measured width.
- Unit: 67/67 dashboard utility tests; lint gate clean. Full Ember suite not run.
- Left in place: the <=640px `hero-org > .md-card--caseload-action` selector, which no longer matches a
  visible card.

## Focused: Caseload beside Extras, and lighter organization tiles
- **Caseload left of Extras** (requested: "modern focused show my caseload to the left of extras (like it
  does on gentle view)"). `focusedLayout` reuses its Speak-beside row with Caseload as the lead when
  Speak is not the hero (supervisor and admin) and Extras is visible; the grid flags it
  `md-grid--caseload-beside`, a separate class because the Speak row's 8px row gap would tighten the
  Attention and Rooms panels below. CSS: the two drop their hero margins above 900px, keep the grid down
  to 901px, and take the flex layout at 900px; the org-pair half-width rule at <=1024px now skips this
  row so it stacks at 900px. Two tests updated (approved). Verified live (both users): equal halves
  1440-901, stacked 900/600/390.
- **Organization tiles match Gentle** (requested: "modern focused, lighten the organization buttons to
  the same as they are on gentle view"). Removed the Focused-only tile surface and the organization-dark
  icon from `_focused-view.scss`, and that icon's two preloads (index.html, boards/index.html.erb).
  The organization-dark PNG/WebP files are still on disk, now unused. The My Organizations card itself
  is unchanged (not in the request).
- Unit: 71/71 dashboard utility tests; lint gate clean.
- **organizations-focused art** (requested): the uploaded 1254px opaque square was cropped to its circle
  with a transparent mask, resized to 184x184 (2x the 92px box): 9KB WebP + 50KB PNG, in both
  `app/frontend/public/images` and `public/images`. It replaces organizations-dark in the Focused My
  Organizations icon rule and both preloads. Verified live (92x92, WebP, Rails 200). The
  organizations-dark files are now unused.
