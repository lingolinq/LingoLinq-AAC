# 2026-10-12: Remove the retired Account Setup wizard and its images (PLAN, not yet executed)

Branch: `traci/fix/scots-review-fixes`. Requested 2026-10-12: "the plan is not to bring the wizard back
-> remove the wizard and the images used there". Paused after the inventory: three of my own search
commands failed in a row (rule #13), so nothing was deleted yet. This is the plan for one careful pass.

## Verified facts
- The wizard is unreachable: `routes/setup.js` `beforeModel` redirects every `/setup` URL home (since
  2026-08-15). Checked in the browser: `/setup`, `?page=core`, `?mode=critical`, `?mode=layout` all land
  on `/` with no error.
- `setup_user` (app-state) is NOT wizard-only: the board picker, board preview, tours and home-board
  flows use it. Keep it.

## Decisions (Traci, 2026-10-12)
- Remove the wizard; it is not coming back.
- Delete the one test that calls `controller:setup`'s `close_board_layout`
  (tests/unit/controllers/board-edit-route-modeling-test.js, "setup: closing the board layout ..."). The
  file's other test (app menu copy-and-edit) stays.
- Removing dead code from controllers/application.js may shift `.eslint-todo` rows: move only the shifted
  application.js rows to their new lines (same rules and findings) and show the diff.

## Remove
1. app/frontend/app/controllers/setup.js, templates/setup.hbs, templates/setup-footer.hbs,
   components/setup/** (36 files).
2. controllers/application.js: the `setup_go` action and `setup_next` / `setup_previous` /
   `setup_index` computeds; the two `if(setup_footer) send('setup_go')` branches in setAsHome's done()
   (the flag is never set now). Check every other `setup_order` / `setup_page` / `setup_footer` read first.
3. routes/setup.js: keep ONLY the redirect (`beforeModel`); drop setupController / deactivate. Keep the
   router.js entry (else `/setup` resolves as a user named "setup"). Keep tests/unit/routes/
   setup-retired-test.js; update its header comment (pages are now deleted).
4. Images used only by the wizard (whole-repo search by path and by name; collisions checked):
   20 x `Bubble-*.png`, board-back, board-edit-mode, board-exit, board-modeling, board-small, board,
   dashboard, logs, reports, speak-mode (.png) in public/images; pastel-reports.png in both
   public/images and app/frontend/public/images. KEEP amazon.png, google_play.png, ios_app_store.svg,
   windows.svg (used elsewhere).
5. Styles: 72 class names appear only in the wizard and have styles (list below). 129 references, all in
   app/styles/app.scss, almost all between lines ~5200 and ~8700, plus 3 strays (~47800, ~89600, ~96000).
   Watch for Sass `&__` nesting and shared selector lists; remove only wizard selectors; compile and
   check zero new deprecations.
6. Locale keys used only by the wizard files: compute (keys referenced in the removed files minus keys
   referenced anywhere else), then remove from all 13 locales.
7. Comments that point at removed files (board-actions.js, board-picker-category-order-test.js header,
   routes/setup.js) -- update.

## Not in scope (noted)
- `appState.board_layout_mode` and its reads in routes/user/board-detail.js: the board layout editor that
  lived on the setup route. It can no longer be set; leave it unless asked.

## Wizard-only class names with styles
col-sm-offset-5 md-board-layout-close md-card--setup md-card--setup__content md-card--setup__nav 
md-card--setup__nav--centered md-card__getting-started-btn--secondary md-card__head--setup-intro 
md-hero--setup md-hero--setup__back md-hero--setup__back-pill md-hero--setup__head 
md-hero--setup__nav md-hero--setup__nav-buttons md-hero--setup__progress 
md-hero--setup__progress-fill md-hero--setup__skip-pill md-hero--setup__stage 
md-hero--setup__status md-main--setup md-setup-error md-setup-loading md-shell--setup setup-access 
setup-access__card setup-access__card-left setup-access__card-right setup-access__card-row 
setup-access__display setup-access__display-icon setup-access__display-media 
setup-access__display-p setup-access__img setup-access__page-header setup-access__prompt 
setup-access__question setup-access__radio setup-access__radio-dot setup-access__radio-label 
setup-access__radios setup-back-btn-demo setup-back-btn-demo__circle setup-back-btn-demo__img 
setup-board-category setup-board-category__assign setup-board-category__assign-btn 
setup-board-category__cta-icon setup-board-category__intro setup-board-category__new-btn 
setup-board-category__page-header setup-core-bubbles setup-core-bubbles__img setup-done-actions 
setup-done-actions__btn setup-done-actions__btn--primary setup-exit-demo setup-exit-demo__circle 
setup-exit-demo__img setup-exit-demo__rect setup-intro__encourage setup-intro__get-started 
setup-intro__header setup-intro__username setup-modeling-demo setup-modeling-demo__circle 
setup-modeling-demo__img setup-modeling-demo__rect setup-voice-toggle setup-voice-toggle--in-nav 
setup-voice-toggle__icon setup_container usage-checklist__title
