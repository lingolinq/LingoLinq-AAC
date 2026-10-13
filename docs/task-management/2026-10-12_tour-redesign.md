# 2026-10-12: tour redesign (welcome, communicator board tour, offer after first message, SLP tour)

Branch: `traci/fix/scots-review-fixes`.

## Asked
"One clear welcome: a primary Start talking now button with the board picture and 'We'll set up Vocal
Flair 60. You can change it anytime.' Add a secondary Choose a different board and a small Take a quick
tour (1 min) link. 4 or 5 steps per role. Communicators: review your board, switching boards, messages
and help, the grown-ups area. SLPs: favorites, caseload, Model, dashboards. Offer the tour after the
person has talked once."

## Agreed design (Traci, 2026-10-12)
1. Welcome (communicators, Modern and Basic, first login and the home page's "Take a tour"):
   - Start talking now (primary, Vocal Flair 60 picture): their own vocal-flair-60 copy (made at signup)
     becomes their home board, then Speak Mode in their view.
   - Choose a different board (secondary): straight to the board picker.
   - Take a quick tour (1 min) (link): as Start talking now, then the communicator tour on the board.
2. Communicator tour, 5 steps, on their board in Speak Mode: welcome, review your board (grid), switching
   boards (Home / folders), messages and help (message bar, Speak, Help), the grown-ups area (the way out
   to the home page, PIN-protected if set). Modern replaces the board speak tour for communicators; Basic
   gets its first board-page tour.
3. Offer: after a communicator's first spoken message, one small "Take a quick tour (1 min)?" prompt
   (Start / Not now), shown once.
4. SLP tour, 5 steps, on the home page in both views: welcome, favorites (Boards), caseload, Model (from
   Caseload), dashboards (Attention, Rooms). No board-setup welcome for SLPs.

## Progress
### Phase 1: welcome (done, verified live in Modern and Basic)
- `utils/tours/home.js#communicatorWelcomeStep`, used by `home.js` and `classic-home.js` for a communicator.
- `utils/tours/start_talking.js#start_talking_now`: copy-or-reuse Vocal Flair 60 as home, then
  `app-state#home_in_speak_mode`; on failure, an error and the board picker.
- Dispatch: `components/guided-tour.js` `_welcomeAction` (a `reopen`, line-neutral for `.eslint-todo`).

### Phase 2: communicator board tour (done, verified live in Modern and Basic)
- `utils/tours/communicator-board.js`: 5 steps. Modern via `board-detail-speak.js` when `supporter === false`;
  Basic via `registry.js` (`user.board-alt`, key `board_alt_speak`) and a `@boardAltHost` instance in
  `templates/board/index.hbs`. The Speak Mode intro modal is held back while `board_alt_tour_pending` is set.

### Phase 3: offer after the first message (done)
- `utils/tours/tour_offer.js` (`maybe_offer_tour`, `accept_tour_offer`, `dismiss_tour_offer`,
  `arm_board_tour`, `mark_tour_offered`) and `components/tour-offer` (mounted once in `application.hbs`).
- Called from `utterance.vocalize_list` and from Modern's quick-phrase fallback in
  `controllers/user/board-detail.js#_speak_current_sentence`, which skips `vocalize_list` (found while
  tracing; red test first).
- Remembered as `preferences.progress.guided_tours_autoshown.tour_offer`: the server keeps only the
  progress keys in `User::PROGRESS_PARAMS` (an allowlist), and a new key was silently dropped. Verified
  live: the server row holds `{"tour_offer" => true}` after the offer.
- "Take a quick tour" on the welcome also marks it, so nobody is offered a tour they already chose.
- Tests: `tests/unit/utils/tours/tour-offer-test.js` (7). Falsified: removing the `vocalize_list` hook
  turns "speaking a message makes the offer" red.
- Live (Aiden, both views): the offer after the first message; Start opens `comm_board_tour_welcome`;
  a second message brings no offer; 0 page errors.

### Phase 4: SLP tour (done, verified live: Modern Gentle, Modern Focused, Basic)
- Five steps (Traci, 2026-10-12: "5 steps with a welcome"): welcome, then favorites, caseload, Model and
  dashboards, the last one finishing the tour. An SLP is a supporter (`supporter_role`; `User` registration
  types therapist, parent, teacher, other), so this is the supporter tour.
- Modern (`utils/tours/home.js#menuTopics`): the Boards pill (its page has Favorites), the My Caseload card,
  the Caseload pill (Model is a quick action on the Caseload page, `templates/caseload.hbs:161`), the
  attention card or else Rooms. The replay menu offers the same four. The old linear done step and the
  communicator skip off-ramp were removed: nothing reached them after the redesign.
- Basic (`utils/tours/classic-home.js#interiorSteps`): the Boards tab (no favorites view there, so "Your
  boards"), the Communicators tab, a communicator card's actions (Model tile, shown once that communicator
  has a home board; the step opens the Communicators tab first), the side menu. Tab markers
  `data-tour-tab="supervisees"` / `"boards"` added in `classic-view.hbs` (same lines).
- Tests: `tests/unit/utils/tours/slp-home-tour-test.js` (4, falsified on the Basic tab switch). With approval:
  `supporter-home-tour-test.js` and `home-tour-steps-test.js` rewritten to the 5-step spec;
  `tours-classic-home-tab-test.js` deleted (it guarded the removed "main actions" step);
  `communicator-tour-topics-test.js` given the caseload targets. 87/87 tour tests pass; lint gates clean.
- Found while verifying: the unused-style cleanup (3fc054bdd) had removed 10 live tour classes. Restored;
  see the correction in `2026-10-12_unused-styles-audit.md`.

### Found along the way, not fixed here (pre-existing, files identical to develop)
- **Basic: tapping the sentence bar does not speak (local build).** `application.hbs:135` listens with
  `{{on "select" (this.ctrlAction "vocalize")}}`, a native listener; `utils/raw_events.js:1705` fires
  `$elem.trigger('select')`, a jQuery event, which native listeners never receive. Measured on a tap:
  jQuery `select` 1, native 0, `vocalize_list` 0. A native `select` event speaks and the offer follows.
  The `{{on}}` form arrived in #625 (2026-07-17). Needs its own fix proposal.
