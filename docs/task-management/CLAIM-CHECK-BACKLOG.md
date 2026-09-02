# Claim-check backlog — consolidated

Single reconciled list from the two usability/accessibility reviews of LingoLinq staging.
Supersedes ad-hoc tracking in the per-task logs. **Statuses below were verified in code or in a
browser, not carried over from the reports' own claims.**

| Source | Tested | Notes |
|---|---|---|
| Claim check v1 | walkthrough Aug 13-14, scripted re-test Aug 20 | `2026-08-21-lingolinq-claim-check.md` (gitignored, local) |
| Claim check v2 | same two passes, re-written + extended | adds two entirely new sections: **age-gate compliance** and **webview wrappers** |

**The single most important thing about v2:** its re-test ran **Aug 20**; our fixes landed
**Aug 23**. Four of its five top-priority "confirmed bugs" are already fixed and browser-verified.
v2 is not reporting new regressions there — it simply predates the work.

Everything in v2 that is *not* in v1: the Age-gate section, the Webview-wrapper section, and the
post-under-13-signup gap. All other v2 findings are restatements of v1.

---

## A. Done — do not re-open

> **Four of these rows were written prematurely.** An adversarial file-level review of the branch on
> 2026-08-24 (section **A2**) found that three of them shipped incomplete and one shipped a *new*
> regression, in every case because the source change was defeated by something outside the diff.
> The rows below now carry the corrected status. The lesson, recorded in LEARNINGS: **"do not
> re-open" is a claim about a whole user path, and a source-level change plus a green unit test is
> not enough evidence to make it.** Verify at the surface the user touches, then close the row.

| Finding (v1 + v2) | Fixed in | Verified |
|---|---|---|
| "Hi No name" / "NO NAME"; signup never asks for a name | `1e293fb03` (+ `35cc67d05`), completed 2026-08-24 | **Was incomplete when first closed.** The root cause (the `generate_defaults` seed) was removed, but six server-side consumers still rendered `settings['name']` raw — including the **welcome email**, which then opened with a blank. `author.name` was also read at five client surfaces while `lib/json_api/log.rb` never emitted the key at all. All now route through `User#display_name` / `display_name_for`. See A2 row M1. |
| Main Search box ignores typing; Enter re-fires previous query | `52d60457a`, completed 2026-08-24 | **The typing fix was real but introduced a regression.** Each 300ms pause transitioned the route, re-entering `setupController`, which refetched unconditionally — flashing an empty panel per keystroke and leaking one `persistence` observer each time. Now `replaceWith` + a single owner for the reload decision. See A2 row H3. |
| Board-picker filter works while main search doesn't | `52d60457a` | Same fix — the inconsistency is gone |
| Save Preferences ~2,025px down, no sticky bar | `35cc67d05`, completed 2026-08-24 | **Verified only at 1280x800, and was entirely cancelled below that.** A pre-existing `@media (max-width: 1024px)` block re-declared `overflow-x: hidden !important` on the whole ancestor chain at equal specificity and later source order, so tablets, phones and desktop at ≥125% zoom got no pinned bar. See A2 row H6. |
| Speak Mode tour repeats on every board | `b0e32c94d`, corrected 2026-08-24 | **The suppression also killed the only way to replay the tour.** Manual "Take a tour" shares the pending flag with the auto-open, so the once-per-user gate swallowed it for everyone who had picked a home board. Now discriminated. See A2 row H2. |
| Tour cannot be dismissed from the keyboard | `b0e32c94d` | Escape closes, arrows advance |
| Tour progress never persisted at all (not in either report) | `b0e32c94d` (+ specs 2026-08-24) | `guided_tours_completed` was missing from the server allowlist — the "seen" badge had never worked. Now covered by `spec/models/user_spec.rb` (allowlist persistence + the sanitizer), which had no coverage at all when first closed. |
| **D2** — home-board pick: no progress explanation, no confirmation | `231bdcaeb` | Copy-wait explainer + the self-pick confirmation the pick-for-others path already had. **Browser-verified 2026-08-23** — see A1. (One correction: the completion handler was bound to both promise outcomes, so a failed image preload still claimed "saved for offline use". Split 2026-08-24.) |

> **D10's accessibility sub-claim is closed as not-reproducing — but the stated evidence was
> wrong.** CORRECTED 2026-08-24: only ONE of the three `BetaFeedbackPanel` render sites carries
> `inert` + `aria-hidden` (`templates/application.hbs:1497`, the drawer). `templates/beta-feedback.hbs:10`
> and `components/beta-feedback-modal.hbs:3` carry neither. The conclusion still holds per-site —
> the standalone page is never "closed", and the modal only renders inside `ModalDialog` when open,
> so neither has a hidden-but-focusable state — but "all three carry it" was not checked before it
> was written, and it was the sole basis for closing an accessibility finding. Needs a fresh repro
> to re-open. (Separate from D10's *placement* claim, which is re-opened below.)

### A1. Browser verification, 2026-08-23 — D1 and D10 did NOT hold up

Ran `app/frontend/scripts/claim-check-d1-d2-d10-qa.mjs` (Playwright, 1440x900, live dev stack) against
`26ee4f536`. Result: **4 passed, 3 failed.** D2 is confirmed; D1 and D10 are re-opened as **not fixed**.
Both failures are the same shape — the source change is real, but a pre-existing higher-precedence
rule means it never reaches the user.

**D2 — CONFIRMED FIXED.** All three assertions pass against the real copy pipeline via `/board-picker`:
the explainer renders under the spinner (verbatim), the copy completes and hands off to
`/example/board-detail/communikate-home`, and the confirmation toast shows *"This is now your home
board, and it's saved for offline use."* Note the flash lands in `.ll-toast`, not the legacy
`.flash-message` outlet (`utils/modal.js:44`) — the first run failed purely on that selector.

**D1 — was RE-OPENED, now FIXED in the options menu (browser-verified, 7/7).**

*The failure:* the two buttons rendered, gated correctly and were wired — but were **unreachable in
view mode**, which is the entire finding. They had been added to `.md-board-detail-header__actions`,
inside `.md-board-detail-header`, which is hidden by `.md-shell--board-collapsed .md-board-detail-header
{ display: none }` (`app.scss:76138`); `board_collapsed: true` is the controller default
(`controllers/user/board-detail.js:267`), set `false` only on entering edit mode
(`routes/user/board-detail/edit.js:57`, `board-detail.js:5365`) and back to `true` on exit
(`edit.js:100`). **The only control that expands it — `toggle_board_collapsed` — is itself inside the
hidden header** (measured 0x0), so a view-mode user could not reveal it. The actions had moved from one
edit-mode-only container to another.

*What the browser pass also turned up:* **`make_a_copy` was already reachable** the whole time, at
`board-detail.hbs` (the Share & Print "Copy" item) — Options → Share & Print → "Copy" — and it fired correctly. So only **one** of
the two actions was genuinely missing. The reason both were reported absent is the label: under a
"Share & Print" heading, a bare "Copy" reads as copy-to-clipboard/export, not "make this mine".

*The fix:*
- Removed both dead header buttons (a comment marks the spot so this is not re-attempted).
- Added **Set as Home Board** to the options menu as a top-level item beside Edit Board, gated on
  `can_set_as_home`. Top level, not inside Share & Print: it is a "make this mine" action, and it is
  the step that makes a board work offline.
- Relabelled the existing menu item "Copy" → **"Make a Copy"** under its own key
  (`board_detail_copy_board`). `copy` could not be restyled in place — it is shared with the utterance
  clipboard button (`share-utterance.hbs:67`) and a button-settings form label, both of which must
  stay "Copy".
- Gated that item on `can_copy_board`, so an uncopyable / for-sale board no longer offers a copy that
  cannot happen. **This is a deliberate small behaviour change** — previously the menu offered Copy
  regardless — and it puts the already-tested gate to use rather than leaving it dead.

*Verified:* `claim-check-d1-d2-d10-qa.mjs --only d1` → 7/7, including both actions reachable by real
clicks, the label assertion, "no dead copies left in a hidden container", and both modals opening.
The set-as-home modal confirms the journey: *"This board is not owned by the user. You will probably
want to make a new copy…"*. 5/5 unit tests pass, template-lint clean, eslint 1531 findings = unchanged
baseline.

*Still open (G2), corrected count:* the handoff's "seven remain edit-mode-only" was too pessimistic.
Checked per action at HEAD — **four** have no view-mode render site at all and appear only in the
edit panel: `board_details` (`:246`), `add_to_sidebar` (`:222`), `toggle_favorite` (`:263`),
`other_board_actions` (`:278`). The other three — `share_board`, `print_board`, `download_board` —
each have a second render site in the options menu (each has a second render site under Share & Print in the options menu) and were confirmed
visible in the browser under Share & Print.

**D10 — was RE-OPENED, now FIXED (browser-verified, 4/4).**

*The failure:* the tab was still dead-centre on every page — measured box centre **720px of a 1440px
viewport, 0px off centre**. `868193344`'s premise was false at runtime: it assumed the `--navbar`
variant is `position: absolute` inside the navbar, so it re-added `left: 50%; right: auto;
transform: translateX(-50%)` to that variant. But `#within_ember:not(.board-alt-view):not(.board-detail-view)
.beta-feedback-drawer-tab--navbar { position: fixed; top: 0 }` (`app.scss:89818`, pre-existing,
id+class specificity) forced it to `fixed`, i.e. page-level — so the re-centring landed on a
page-level tab and kept the defect alive.

*Correction to this document's own earlier entry:* it said the commit was a pure no-op and that
"before and after are visually identical". That was wrong. There are **two** render sites, each
always carrying a modifier — `app-navbar.hbs:77` (`--navbar`) and `application.hbs:1491` (`--speak`);
the base class never applies alone. `--speak` overrides only top/bottom/borders, so it *did* inherit
the new `right: 16px` and was corner-anchored by that commit. Only `--navbar` — the tab on every
ordinary authenticated page — was unchanged.

*The fix:* removed the three centring declarations from `--navbar`, and removed the
`#within_ember… .beta-feedback-drawer-tab--navbar { position: fixed; top: 0 }` override entirely, so
the variant's own `position: absolute; top: 100%` seats the tab directly beneath the navbar
(`.app-navbar` is `position: relative`, height 70) with the base `right: 16px`. The drawer *panel*
keeps its `top: 0`; only the tab moved.

*Two traps found by measuring, both of which would have shipped a regression:*
1. **The top-right corner at `top: 0` is not free.** Anchoring right while still pinned to `top: 0`
   put the tab over **Settings, Support and the online-status control**. Simulating candidate boxes
   against the live navbar: centred/top:0 collides with nothing, right/top:0 collides with three
   controls, left/top:0 collides with the logo, right/below-navbar collides with nothing. The
   original centred position was collision-free — so a naive corner-anchor trades one mis-tap risk
   for another.
2. **`top: 100%` under `position: fixed` resolves against the viewport,** not the navbar. Dropping
   only the `top: 0` while keeping `position: fixed` sent the tab to y=900 — off-screen at a 900px
   viewport. The `top: 0` had been masking that latent value.

*Verified:* `--only d10` → 4/4 — not page-centred (602px off), covers no interactive control,
on-screen with the hit-test at its centre landing on the tab, and the drawer still toggles
(`aria-expanded false→true`, drawer un-hidden). Negative control: reverting `app.scss` to HEAD makes
`D10-not-page-centred` fail at 0px off centre while the other three still pass, confirming the
assertions discriminate. Note the D10 check now navigates explicitly to `/<user>/home`: the
post-login landing `/` can come up with a welcome modal over the tab, which fails the hit-test for
reasons unrelated to placement.

### A2. Viewport + touch matrix, 2026-08-23

`app/frontend/scripts/claim-check-viewport-touch-qa.mjs` — 7 viewports from 1920 down to 390, with
real **touch input** (`hasTouch`, Playwright `.tap()`) on the three narrow ones, deliberately
straddling the `@media (max-width: 720px)` breakpoint. **69 passed, 1 failed.**

**D1 passes on every viewport and by real tap, including 390px.** Set as Home and Make a Copy are
reachable from the options menu at every size; the set-as-home modal opens by tap on iPad, the 712
band, and iPhone. Menu items measure 186x63 — comfortably past WCAG 2.5.5 AAA (44x44).

**D10 passes 6 of 7.** Not page-centred, on-screen, wins its own hit-test, and still toggles the
drawer everywhere — by tap as well as click.

**Known residual (the 1 failure): a ~700-740px band clips one control by ~10-20px x 6px.**
The cause is geometric and worth recording because no placement solves it:

| width | navbar bottom | first interactive row below | gap | tab height |
|---|---|---|---|---|
| ~700-820 | 70 | 97 | **28px** | 34-36px |
| 1440 | 70 | 141 | 72px | 36 |
| 390 | 70 | 145 | 76px | 34 |

In that band the home page's secondary nav row sits 28px below the navbar while the tab is 36px
tall, so a tab seated under the navbar **must** clip it — there is no vertical gap to fit. Every
alternative measured is worse: `top: 0` right covers Settings/Support/online at *all* widths;
`top: 0` left covers the logo; bottom-right collides at nearly every size ("My Account",
"Create a Board", the home-board card); and top-centre is the defect D10 reported.

Mitigated, not eliminated, by extending the compact tab sizing (141px vs 172px) through 721-820 —
the row's right edge scales with the viewport while the tab's left edge is `100vw - 16 - width`, so
narrowing clears it horizontally. That took 760-820 to clean and cut the 721 overlap from 41px to
10px. **Still open: ~700-740 at tall viewports**, where ~6px of the top edge of one secondary-nav
control sits under the tab. Home-page-specific, and the affected control stays ~80% tappable.
Judged not worth a fourth placement change without a design call.

> **Tap-target note (not a regression, pre-existing):** the tab is 34-36px tall at every size —
> past WCAG 2.5.8 AA (24x24) but **below 2.5.5 AAA (44x44)** on height. The board-detail options
> toggle is 44x44 except at 390px, where it measures **32x26** — AA-compliant, AAA-failing. Neither
> was introduced here; both are worth a separate a11y ticket for an AAC product.

> **Method note:** the collision detector must skip `pointer-events: none`, `[inert]` and
> `aria-hidden` subtrees. The closed beta-feedback drawer keeps its own form in the DOM, and its
> file input reports an on-screen rect — it produced two false "collision" failures at 820 and 712
> before being excluded. The exclusion was then validated against a true positive by injecting
> `top: 0` and confirming Settings/Support/online are still flagged.

> **Method note:** board-detail gates itself behind a full-viewport "Larger screen recommended" overlay
> (z-index 450) that sets the header to `display: none`. A first run reported every header button as
> 0x0 because of it — a property of the overlay, not the buttons. The script now dismisses it. Any
> future board-detail UI test must do the same or its measurements are meaningless.

## B. Closed — investigated, not defects

- **"Preview modal doesn't scroll; Pick this Board unreachable."** v2 softens this to "clips at
  ~620px", which is right about the heading and wrong about the cause: the modal body **does**
  scroll (measured 115px) and the button is reachable. Real friction, not a blocker → tracked as
  D7 below.
- **"Tour overlay intercepts all pointer events."** True, and **intentional** (`modal: true`,
  `canClickTarget: false`). The actual defect was the missing keyboard exit, which neither report
  identified — now fixed.
- **Direct-URL 500/502s** — did not reproduce; Render free-tier spin-down. Infra decision (D12).
- **Board editor Save/Cancel pinned** — working as intended; it is the pattern Preferences borrowed.
- **Placeholder siblings of the "No name" bug — NOT the same class (audited 2026-08-24).** `Board`
  seeds `"Unnamed Board"` (`board.rb:840`), `Organization` seeds `"Unnamed Organization"`
  (`organization.rb:54`), `Device` seeds `'Web browser for Desktop'` (`device.rb:19`). All three are
  the same truthy-not-null *shape*, but none reproduces the defect. What made `"No name"` a bug was
  that it silently defeated `name || user_name` — a guard written everywhere, so every account showed
  a placeholder instead of its handle. **No equivalent `name || key` fallback exists for boards**
  (the only two hits are record-vs-plain-object normalisation in `board-collection.js:401` and
  `board-picker.js` (the `name || user_name` fallback)), and the sentinel is already explicitly guarded where it matters
  (`board.rb:1233`, `:1644`, `:2601`, `board/index.js:1011`). Scale: **1 of 2247** boards in dev, and
  "Unnamed Board" reads correctly to a user in a way "Hi No name" never did. Note the earlier
  sighting of "Copy of Unnamed Board" in the copy modal was the modal reporting the board's REAL
  name, not a failure to read it — `lingolinq/keyboard` is genuinely named that in the dev database.
  Removing these seeds would also hit the trap recorded in LEARNINGS: it repairs guarded consumers
  and breaks unguarded ones. No action.

## C. Corrected — v2's headline new finding is wrong, and its fix is explicitly forbidden

**v2 says:** the age gate uses a flat 13 for every country, so a 15-year-old in Germany (Art. 8 age
16) wrongly gets normal signup; fix with a country-to-threshold lookup.

**The code says this is deliberate.** `app/frontend/app/controllers/register.js:10-12`:

> *Signup parental-consent age for account activation (COPPA). Always 13 — not jurisdiction Art. 8
> age 16. EU under-16 use Preferences AI parental consent after the account exists.*

and `:236-240`:

> *Deliberately NOT raised to 16 for EU countries — GDPR Art. 8 for optional AI enablement is
> handled post-signup via `eu_ai_parental_consent`, not by blocking account creation.
> `Domain_settings.coppa_consent_age / eu_consent_age` **must not** drive this signup gate.*

The post-signup mechanism exists and is wired: `eu_under_16` /
`eu_ai_parental_consent_active` attributes, `utils/ai_feature_gate.js:114` gating AI features on
them, an `eu-ai-parental-consent` component with a consent-email flow, and
`LingoLinq::Jurisdiction::EU_COUNTRY_CODES`. v2 tested signup only and could not see any of it.

v2's own caveat is the right one: Art. 8 bites *where consent is the legal basis*. The design here
relies on a different basis for the account and uses Art. 8 consent only for optional AI.

**Action is not code.** → C1 below. Implementing v2's suggestion would contradict an explicit
in-code instruction.

---

## D. Open — carried from v1, restated in v2

| # | Item | Size | Note |
|---|---|---|---|
| ~~D1~~ | ~~"Set as Home" / "Copy" unreachable outside edit mode~~ | — | **DONE 2026-08-23.** Both now in the view-mode options menu; browser-verified 7/7 plus touch. See A1. The historical analysis below the table is kept because it explains the class of bug. |
| ~~D2~~ | ~~Home-board pick feedback~~ | — | **DONE 2026-08-23.** Explainer + confirmation toast, browser-verified against the real copy pipeline. See A1. |
| D3 | **Let users explore a set before picking** | moderate | Preview is a static image of the top board only. Offline-first makes this a core path, not polish. |
| D4 | **Board clutter** — 350+ boards after two picks | moderate | Each pick clones the whole linked set; old copies are never cleaned up. |
| D5 | **DOB dropdowns** → native/typeable inputs | moderate | 121-item custom scroller, no type-ahead. See C1 — month+year typed fields satisfy the FTC example *and* fix the motor load. |
| D6 | **Editor label truncation** | not "low effort" | Investigated: no ellipsis rule exists; labels are dynamically sized. Speak Mode renders them fine, so it is editor-cell specific. Needs a real trace. |
| D7 | Board preview CTA below the fold at ~620px | low | Modal *does* scroll (see B). A pinned action bar — same pattern as the Preferences fix — would close it. |
| D8 | Registration consolidation (5 screens → fewer) | higher | Keep the DOB step; role + signup-method are the merge candidates. |
| D9 | Contrast/font audit against **AAA** | medium | v1's "likely fails AA" was wrong — measured 4.59:1, which passes AA. **(UNSUBSTANTIATED, flagged 2026-08-24: no artifact, script or file:line backs this number, and it is stated as a correction OF an outside reviewer, so it carries weight it has not earned. Re-measure and cite the token before relying on it. For calibration, the same audit pass found `.md-board-preview__meta dt` at 3.69:1 and two overlay styles at 4.23:1 — all failing — so "contrast is fine here" was not safe to assume.)** Reframe as AAA (7:1) for this user base. Include the Maitree serif headings. |
| ~~D10~~ | ~~Beta-feedback pill on every page~~ | — | **DONE 2026-08-23.** Corner-anchored below the navbar, verified across 7 viewports + touch. One residual clip in a ~700-740px band (A2) and the a11y sub-claim did not reproduce (`inert` + `aria-hidden` already present). |
| D11 | **Speak-bar feature gap** — Share, Repairs, Hold Thought, Repeats, Alerts | wiring + QA | Product call. The code still ships in the bundle (`hold_thought`, `repair`, `flip_text`, `share_message`…); the redesigned bar never wired it up. Repairs and Hold Thought matter most to communicators. |
| D12 | Staging cold-start 500s | infra | Decide whether staging keeps a warm instance. |
| D13 | **Verify TTS on real devices** | verification | Still unconfirmed outside a headless browser. Blocking for a communication app. Overlaps N6. |

### D1 in detail — it is a placement bug, not a missing feature

Both reports read this as "add Set as Home and Copy to the board menu". Traced in code, the
functionality is already built and the recommended UX already exists:

* `set_as_home` / `copy_board` actions — `controllers/user/board-detail.js:6326`, `:6339`
* `set-as-home` modal already offers CoughDrop's one-dialog choice — "Set as Home Board" **and**
  "Use the Existing Board" (`components/set-as-home.hbs:52-59`)
* `copy-board.hbs:33` carries a `set_as_home` checkbox, so copy-and-set-home in one step exists too

**What is actually wrong:** "Set as Home Board" renders only inside the board **edit panel** —
`templates/user/board-detail.hbs:121` `{{#if this.edit_mode}}` → `:130` `md-board-edit-panel` →
`:269` the button, with no closing `{{/if}}` until `:292`. The menu a *viewing* user opens is
`modals/board-actions`, which lists Categorize, Manage Languages, Change Privacy, Translate, Swap
Images, Record Messages, View Style and Delete — and neither of these.

**It is behind the worst possible door.** The users who most need Copy + Set as Home are the ones
evaluating a public vocabulary they do not own, who cannot enter edit mode at all. The
`board-actions` modal says so to their face (`board-actions.hbs:15`): *"Some of these actions are
not available because you don't have editing permission for this board. If you make a copy of the
board set then you can make more of these changes."* — advising a copy while offering no way to
make one.

**Scope:** add the two entries to `board-actions.hbs` wired to the existing actions, plus permission
gating and placement. **Unverified:** those actions were written for a `details_dropdown` that no
longer exists in any template (they still call `this.set('details_dropdown_open', false)`), and
`copy_board` looks up the application controller — invoking them from a non-edit context needs a
runtime check before assuming it works.

---

## E. New in v2

| # | Item | Size | Note |
|---|---|---|---|
| C1 | **Get counsel to sign off the documented age-gate position, then record it** | doc | The design is deliberate (see C). Two questions for counsel: is the non-consent legal basis for EU minors' accounts sound, and is Art. 8 consent correctly scoped to AI only? Then add it to the compliance register so the next reviewer doesn't re-raise it. Consider the FTC's month+year typed fields — which also closes D5. |
| ~~N1~~ | ~~Untested: the whole post-under-13-signup experience~~ | — | **EXERCISED AND FIXED 2026-08-24 — see N1 detail below.** Two HIGH defects found and closed; the rest of the flow was correct. |
| N2 | **Webview: Google OAuth will break** | medium | Google blocks OAuth from embedded webviews (`disallowed_useragent`). Needs Chrome Custom Tabs (Android) / `ASWebAuthenticationSession` (iOS), or hide the button in wrapped builds. |
| N3 | **Webview: every dead end becomes a trap** | medium | No browser Back. Raises the stakes on D7 (tablet-shaped screens) and any screen without an in-app exit. The registration flow's "Change date of birth" links are the right pattern to copy. |
| N4 | **Webview: parental approval crosses contexts** | medium | The parent opens the link in their own browser, so approval must sync back (poll/push) and the child's app needs a "waiting for your parent" state. Pairs with N1. |
| N5 | **Webview: store rules touch the purchase UI** | medium | Apple requires IAP for digital subscriptions and rejects webviews linking out to external payment. Needs per-platform UI flags. Google Play Families / Apple kids policies add child-directed requirements. |
| N6 | **Webview: verify TTS in WKWebView specifically** | verification | Speech support and voices differ from Safari; CoughDrop bridges to native. Do with D13. |
| N7 | Landing-page console errors (a 405 and a 404) | low | Small ticket. |
| N8 | Preview-modal data oddities | low | "Available Buttons: 10" on a 24-cell board; description clips mid-sentence. |
| N9 | Search results open in two steps | low | Not a bug — desktop layout is fine at 1280×800 and 1000×700. One click slower than CoughDrop. |

### N1 detail — the under-13 / COPPA parental-consent path (2026-08-24)

Driven end to end against a live stack (Rails + Ember + Resque): API create, the child-facing UI,
the parent's email, the approval endpoint, login, and revoke. **Two HIGH defects. HIGH 2 is fixed
and closed. HIGH 1's REMEDIATION is deployed, but its recorded ROOT CAUSE was false and its closure
review is REOPENED (2026-09-02, Scot).** The working log is `2026-08-24-n1-under-13-signup-path.md`
(gitignored, local, and NOT present on this machine at any searched path, which is why the trigger
below is still open).

**HIGH 1 — the parental-consent approval link was unfollowable.** Every backend-built email URL was
`"#{JsonApi::Json.current_host}/path"`. `current_host` is absolute only when set from a web request
(`application_controller.rb:29` prepends `request.protocol`); its fallback `ENV['DEFAULT_HOST']` is a
bare host by design (`.env.example:8` documents `www.lingolinq.com`).

> **THIS DIAGNOSIS IS FALSE. Corrected 2026-09-02.** The sentence that stood here claimed mail is
> delivered from a Resque worker "and nothing restores one, because `Worker.domain_id` /
> `Worker.set_domain_id` are called from nowhere in the repo." Both are called by boy_band:
> `boy_band.rb:58` appends `"domain::<Worker.domain_id>"` at enqueue, `boy_band.rb:140-142` pops it
> at perform and calls `Worker.set_domain_id`, and `lib/worker.rb:149-152` has that call
> `JsonApi::Json.set_host` **and** `JsonApi::Json.load_domain`. Settled by dates, not inference:
> that behavior has existed since `de621007b4` (2019-04-16, "backend job support for alt domains"),
> while this claim was written in `4e09b4617` (2026-08-25). It was false when written, not stale.
> Verified independently by `spec/lib/worker_spec.rb:41-47` and by a live probe across the queue
> boundary. See finding `LL-ffdd40d2e9` and PR #910.
>
> **What is still true:** a bare host in a delivered link does imply the chain originated with no
> request context, since `Worker.domain_id` is `current_host || 'default'` and `current_host` falls
> back to a bare `ENV['DEFAULT_HOST']` (`json.rb:85`). **What is not established:** how this
> particular email came to be sent that way. All known enqueue sites are controllers inheriting
> `ApplicationController`, which runs `set_host` with `request.protocol` prepended and is never
> skipped, so a genuine signup request should have stamped an absolute host. `Worker.requeue_failed`
> replays the original payload, so requeue is not a candidate either. The leading hypothesis, and it
> is only a hypothesis, is that the observed email was triggered manually from a console or rake
> task during the investigation. Confirming that needs the gitignored working log or whoever ran it.
>
> Note also that the symptom URL quoted below, `www.lingolinq.com/...`, matches the illustrative
> value in `.env.example:8` rather than any configured `DEFAULT_HOST` on this machine, so it may
> have been reconstructed rather than copied from the delivered mail.

So the parent received
`href="www.lingolinq.com/parental_consent/complete?..."`, a *relative* URL a mail client cannot
follow. The child was correctly held pending and could never be approved: the COPPA gate failed
closed — safe, but non-functional.
*Remediation shipped and VERIFIED DEPLOYED* (2026-09-02: prod `lingolinq-web` revision
`lingolinq-web-00026-pas` serves image `web:3f752f1fd9c4c8...`, built from `3f752f1fd` / release
#898, which contains `absolute_host` and 67 referencing files under `app/views` + `app/mailers`).
Per Scot's direction the remediation is **NOT** being reverted: it is independently sound because
`absolute_host` guarantees a scheme regardless of what caused the original bare host. But the
soundness of a fix is not evidence for the diagnosis behind it, which is why the closure review is
reopened rather than the code. Implemented as a new `JsonApi::Json.absolute_host` (scheme guaranteed, idempotent, loopback→http),
applied to every `current_host` use in `app/mailers` + `app/views` — 129 lines across 67 files
on staging, 130 `absolute_host` references at HEAD, and `git grep current_host -- app/views` now
returns zero. (CORRECTED 2026-08-24: this said "105", which was never measured.) Also utterance
email/SMS reply links, the email-template previews and the valet login URL. API-payload and
OBF-export links were deliberately left on `current_host`.

**HIGH 2 — revoking consent did not end the child's session.** `revoke_parental_consent!` called
`devices.each(&:invalidate_cached_keys)`, which only drops the Redis `user_token/...` cache and
leaves `settings['keys']` populated. `Device#valid_token?` checks only `disabled?` and key
membership — no consent check — and refreshes `last_timestamp` on use, so an active session never
aged out. Verified pre-fix: a token minted before revocation still returned the child's record from
`/api/v1/users/self`. A parent could withdraw consent and the child stayed signed in.
*Fixed* by switching that one call to `invalidate_keys!`. The sibling call sites (grant, submit
parent email, family offboarding) keep the cache-only behaviour on purpose — they must not log
anyone out.

**What was already correct** (verified, not assumed): the gate is default-ON; the pending account
gets no device token; confirm-registration / new-user / tracking emails are all suppressed while
pending; login is blocked at four entry points (form login, API, Google OAuth, confirm-registration);
approval mints the token and lets the child in. The child-facing UI passed 8/8 in-browser — a "check
with a parent or guardian" screen, a clear reason on the login page, and a self-service **"Resend
approval email to parent"** control.

**Parent-facing pages: verified 12/12 in-browser (2026-08-24).** Reproduce with
`bundle exec rails runner scripts/n1-consent-fixtures.rb > /tmp/consent_pages.json` then
`cd app/frontend && node scripts/n1-consent-pages-qa.mjs --fixtures /tmp/consent_pages.json`.
(CORRECTED 2026-08-24: as originally written this cited a script that read a hardcoded path inside
one machine's session scratchpad, for a fixture file that was never committed — so the claim was
not reproducible by anyone else, and would have broken outright once `/private/tmp` was cleared.
The fixture generator is now committed and the path is a required argument.) Valid
approval → *"Thank you — Parental consent has been recorded"*; clicked twice → *"Consent already
recorded"*; tampered token → *"Link invalid or expired"*; **a 15-day-old link is correctly rejected**,
so the 14-day `parent_consent_expires_at` window works; revoke → *"Consent withdrawn — the account is
now restricted and the child cannot sign in"*; revoke twice → *"Consent already withdrawn"*. No token
echoed into any page, no false success, no 500s. Note the revoke page's promise that the child
"cannot sign in" was only half-true until the `invalidate_keys!` fix above — existing sessions
survived. It is now accurate.

### N1 follow-up — queued mail cannot resolve a custom domain (OPEN, not fixed)

Broader than COPPA and pre-existing. Nothing restores the request host in a Resque worker
(`Worker.domain_id` / `Worker.set_domain_id` are defined at `lib/worker.rb:89` and `:149` and called
from **nowhere**), so in a worker `JsonApi::Json.current_domain` returns the default domain —
measured: `host: nil`, `app_name: "LingoLinq"`.

Mail reads that blob for more than links: `app_name` (`mailers/concerns/general.rb:20`), the **From
address** via `admin_email` (`general.rb:7`, `admin_mailer.rb:10`, `subscription_mailer.rb:10`),
`full_domain` (`general.rb:16`), and `mailer_helper.rb:34` hands the whole settings hash to the
templates. Organizations can set per-host `host_settings` and even `email_templates`
(`organization.rb:1206-1218`).

**So for an org on a custom domain, every queued email is sent with DEFAULT branding, a default From
address, and links to `DEFAULT_HOST` instead of their domain.** `absolute_host` fixed the *shape* of
those links; it cannot fix *which host* they point at.

**Deliberately not fixed here.** The remedy is to capture the domain at enqueue and restore it at
perform — i.e. actually use the two dead methods — which touches every background job in the app. No
org with `custom_domain: true` exists in the dev database (`Organization.load_domains` → `[]`), so
there is nothing local to test against, and whether any exists in production is unverified from here.
Shipping a core Worker change blind against zero test coverage is exactly the bet RULE #0 forbids.

Scoped as: confirm whether any production org uses a custom domain (if none, this is latent and can
wait); if so, add host capture/restore to `Worker` with a custom-domain fixture and specs covering at
least one queued mailer.

**Still unverified after all of the above:** SES deliverability — `development.rb:42` sets
`delivery_method = :ses` with `raise_delivery_errors = false`, so local failures are silent and only
message *construction* has ever been exercised, never transmission.

## G. Orphaned-control sweep (2026-08-23)

D1 and the speak-bar gap are the same shape — functionality that still ships but that the redesigned
UI no longer reaches — so this was swept deliberately rather than waiting for the next review.

**Method.** Two mechanical passes over `app/frontend/app` (excluding `dist/`): every modal in
`modal-container.js`'s registry checked for an `open()` call, and every name defined in an
`actions: { }` block checked against every invocation form this repo uses (`ctrlAction`/`selfAction`/
`eventAction` factories, classic `{{action}}`, `send()`, `data-*-action=`). Scripts in the session
scratchpad; raw candidate list in `orphans.json`.

### G1. Modals — clean

All **124** registered modals have at least one `open()` call site. Re-run with strict matching to
rule out false "wired" results. No action.

### G2. The real finding: nine board actions live behind Edit mode

`templates/user/board-detail.hbs:1533-1539` documents the migration in its own words:

> *Removed in edit mode: the right-side board-actions wrap (quick-actions icon row + Details &
> Actions dropdown). Every action — share_board, make_a_copy, print_board, download_board,
> board_details, set_as_home, add_to_sidebar, toggle_favorite, other_board_actions — is now
> reachable from the left edit panel.*

The left edit panel renders only inside `{{#if this.edit_mode}}` (`:121` → `:130`). In **view** mode
the header offers only `toggle_quick_phrases`, `toggle_categories`, `toggle_color_legend`,
`clear_phrase_search` and `enter_edit_mode`.

So all nine actions sit behind a button labelled **Edit**. It is not literally unreachable —
`can_edit_or_copy_board` (`board-detail.js:3428-3438`) lets any logged-in user enter edit mode on a
copyable board, prompting a copy — but "Edit" signals *modify this board*, not *make this my home
board*. A supporter evaluating a vocabulary they don't own will not click it. That is why two
independent reviewers concluded the actions were missing entirely.

**RESOLVED 2026-08-24 — all nine now have a view-mode route.** `set_as_home` and `make_a_copy` were
restored to the options menu earlier (see A1); `share_board`, `print_board` and `download_board`
already had one under Share & Print. The final four — `board_details`, `toggle_favorite`,
`add_to_sidebar`, `other_board_actions` — now live in a **"Board Actions" submenu** in the view-mode
options menu.

Wired to `board_submenu_open` / `toggle_board_submenu`, which **already existed in the controller
with no template referencing them** — an orphaned control left behind by the very migration this
finding is about. Wiring it rather than adding new state dropped `lingolinq/no-orphaned-action` from
74 to 73, so this also retires one item from the G5 triage list.

A submenu rather than four more top-level rows: the menu is already long and these are secondary to
Edit / Set as Home. All four are safe outside edit mode — `board_details` passes
`edit_mode: this.get('edit_mode')` so its modal renders read-only, and `other_board_actions` opens
`modals/board-actions`, which already tells the user which items their permissions withhold. Gated on
a signed-in user, since favouriting and the sidebar write to that user's own account. The favourite
row's label now tracks state ("Set as Favorite" / "Remove Favorite") — a toggle that always reads the
same gives no feedback that the tap worked.

*Verified:* `scripts/g2-board-actions-qa.mjs` → **10/10** — submenu opens in confirmed view mode, all
four reachable by real clicks, and all four fire (three open their modal; the favourite label flips
false→true). eslint gate `new=0`; 5/5 unit tests; template-lint clean.

**This superseded the narrow framing of D1**: it is not one missing menu entry, it is nine actions
migrated to an edit-mode-only surface. Fixing D1 by adding two items to `board-actions.hbs` treats
the symptom; the question worth answering first is which of the nine belong in a view-mode surface.

### G3. Confirmed dead code — the dropdown that was removed

Zero references in any template or JS (verified individually, not just by the script).

**Citation note (corrected 2026-08-24):** these were originally cited by line number in
`board-detail.js`. Five of them have since been *deleted*, so those line numbers now point at
unrelated code — a line citation for removed code is unresolvable by construction. Anchored to the
removing commit instead; recover any of them with
`git show 72dabfe93^:app/frontend/app/controllers/user/board-detail.js | grep -n '<action_name>'`.

| Action | Site |
|---|---|
| `toggle_details_dropdown`, `details_dropdown_keydown` | deleted in `72dabfe93` (`board-detail.js`) |
| `toggle_share_dropdown` | deleted in `72dabfe93` (`board-detail.js`) |
| `toggle_folder_dropdown` | deleted in `72dabfe93` (`board-detail.js`) |
| `open_board_picker` | `board-detail.js#open_board_picker` (still present, still orphaned) |
| `copy_board` (board-detail's own) | `board-detail.js#copy_board` — the sibling `set_as_home` survived into the edit panel; this one did not |
| `toggleSetHomeMode` | `controllers/user/index.js:1561` — transitions to the dedicated board-picker; a second orphaned set-home entry point |
| `go_to_classic`, `go_to_modern_edit`, `set_board_view_style`, `revert_to_old_style` | superseded by `set_view_style` in `board-actions.hbs` |

Dead backing state with no template reference: `details_dropdown_open`, `share_dropdown_open`,
`folder_dropdown_open`. Several surviving actions still write to them
(`set_as_home` and `copy_board` both call `this.set('details_dropdown_open', false)`), which is the
runtime risk flagged under D1 — they were written for a menu that no longer exists.

### G4. Scope and honesty

The action pass produced **117** names with no matched invocation, of which a shortlist was verified
by hand. The remainder is **not** a list of 117 orphans: it includes DOM event handlers dispatched by
Ember rather than called by name (`dragStart`, `drop`, `keydown`, `tap`, `hold*`, the
`sentence-bar-chip` and `sidebar-editor` drag families) and names reached through invocation forms
the regex does not model. Treat `orphans.json` as leads to triage, not findings. The three groups
above are what survived verification.

### G5. Lint rule — shipped

`lingolinq/no-orphaned-action`
(`app/frontend/eslint-plugin-lingolinq/rules/no-orphaned-action.js`), registered in `.eslintrc.js`
at `'warn'`. This class has now produced two user-visible defects (D1 and D11) found only by outside
usability review; the rule makes the next one fail lint instead.

**Deliberately permissive.** It counts *any* exact-match quoted string in any `.hbs`/`.js` under
`app/` as a call site. There is no single invocation form to match on — templates use per-component
factories (`ctrlAction`, `selfAction`, `eventAction`, and `chipAction` in
`sentence-bar-chip.hbs:24`), plus classic `{{action}}`, `send()` and `data-bd-action=`. Matching an
enumerated list would miss the next factory somebody invents, and a rule that cries wolf gets
switched off. The looser index is what dropped the manual sweep's 117 raw candidates to **74** real
ones — the difference was almost entirely the `chipAction` drag/hold family.

**Accepted limits:** two components sharing an action name make both look wired (this is why
board-detail's orphaned `copy_board` is missed — `share-board.hbs` wires one of the same name), and
dynamic `send(someVar)` is unknowable. Absence of a hit is not proof of reachability.

**Rollout:** the 70 pre-existing cases are recorded in `.eslint-todo`, so nobody is blocked, and
`npm run lint:js:ci` fails on a NEW one. Verified end to end: a probe action added to
`board-actions.js` produced `new=1` and a failing gate; wiring it into the template returned
`new=0`; probes reverted. The rebaseline was checked per-rule — no other rule's count grew, and
`ember/require-computed-property-dependencies` dropped by one (stricter).

**Still worth doing:** triage the 74 baselined cases. They are leads, not confirmed dead code —
`orphans.json` and section G3 hold the ones already verified.

### Sticky action bars: the `.md-shell` fix is now global (2026-08-24)

The Preferences sticky-bar fix (`35cc67d05`) shipped scoped to
`#content:has(.md-preferences) .md-shell--user`, with a note that `.md-shell` is shared and a global
change needed its own regression pass. That pass is done and the fix now lives on `.md-shell` itself;
the narrow override is deleted (CLAUDE.md rule 7 — edit the original rather than stacking).

**The bug, restated:** per CSS spec an `overflow` of `hidden` on one axis computes the other to
`auto`, so `.md-shell`'s `overflow-x: hidden` silently made the shell a scrolling box on Y — measured
`overflow-y: auto` with `scrollHeight === clientHeight`, i.e. a scrollport that never scrolls.
`position: sticky` binds to the nearest scrolling box, so **every** sticky element on a shell page was
pinned inside it and rendered inert at its natural offset. `clip` still contains horizontal overflow
but does not establish a scrollport, so sticky resolves against the real scroller (`#content`).

**Two declarations, deliberately:** `overflow-x: hidden` then `overflow-x: clip`. `clip` is
unsupported before Safari 16; there the second line is dropped as invalid and the first still
contains overflow, so old iPads keep the previous (sticky-inert) behaviour rather than losing
containment and gaining a horizontal scrollbar. That matters for an AAC product on older hardware.

**Regression pass** — `scripts/md-shell-sticky-qa.mjs`, 7 shell pages (preferences, home, badges,
goals, subscription, boards, stats), **15/15**: every shell now reports
`overflow-x: clip / overflow-y: visible`, no page gained horizontal overflow
(`document.scrollWidth == viewport` on all 7), and the Preferences bar still pins (y=642) covering
nothing.

**The risk of going global was the mirror of the bug** — elements that were inert suddenly pinning and
covering content on pages nobody checked. Enumerated: **Preferences is the only shell page with any
sticky descendant at all.** So today the global rule is behaviourally identical to the scoped one; it
is simply correct for the next sticky element somebody adds, instead of silently inert.

### D7 / G3 / N7 / N8 (2026-08-24)

**D7 — preview-modal CTA pinned. FIXED, 20/20** (`scripts/d7-preview-cta-qa.mjs`, 4 viewport sizes
incl. the reported ~620px). `.md-board-preview__actions` is now `position: sticky`, pinned to the
bottom of `.md-board-details-modal__body` (the real scrollport). Checked first that neither
`.md-board-preview` nor `__canvas-col` declares `overflow` — an ancestor with `overflow` hidden on
either axis silently becomes the scrollport, which is the bug behind the `.md-shell` fix.
`bottom: -28px`, not `0`: sticky resolves against the scrollport's CONTENT box, so at `0` the bar
floated 28px up and scrolled content showed through the body's bottom padding beneath it (measured —
row bottom 579 vs body bottom 607). Pushing it down by that padding and adding the same 28px to its
own padding-bottom keeps the buttons where they were and lets the background cover the gutter; row
bottom now equals body bottom exactly at every size. Verified the CTA is in-viewport **with the body
scrolled to the top** and wins its own hit-test.

**G3 — partially done, and the backlog's framing was too confident.** Deleted five genuinely dead
leaf actions: `toggle_details_dropdown`, `details_dropdown_keydown`, `toggle_share_dropdown`,
`toggle_folder_dropdown`, `folder_dropdown_keydown`. Each had no call site; the keydown handlers were
the *only* route to their toggles, via `_dropdown_keydown_handler`'s dynamic
`send(opts.toggle_action)` (`board-detail.js:4957`). That handler stays — it is live for
`toggle_paint_dropdown`.

**Not deleted, deliberately.** The backlog listed the `*_dropdown_open` FLAGS as dead too. They are
not: `details_dropdown_open` is read by the document click-handler at ~`:604` and written by ~8
surviving actions, and `folder_dropdown_open` is reset from `routes/user/board-detail.js:333`.
Removing them means touching ~20 sites across two files including a global click handler — a refactor
with real regression surface in the app's largest controller, not the tidy deletion the entry
implies. With the toggles gone the flags simply stay false, which is harmless. Also left alone:
`open_board_picker`, `toggleSetHomeMode`, and the view-style family (`go_to_classic`,
`go_to_modern_edit`, `set_board_view_style`, `revert_to_old_style`) — those are potential *features*,
not scaffolding. Note `go_to_modern_edit` lives in a different controller (`board/index.js:1471`) and
`go_to_classic` is referenced by five comments as a live pattern, so "superseded by `set_view_style`"
needs its own trace before anyone deletes them.

*Lint discipline:* deletions shifted line numbers, so the gate reported `new=18` against a total that
had **dropped** 1530 → 1525. Verified per-rule before rebaselining — nothing grew; the entire delta
is `lingolinq/no-orphaned-action` −3 and `ember/no-runloop` −2 (the two deleted toggles each held a
`runLater`). Four core rules appeared to "grow" only because they are unprefixed and my first
comparison filtered them out; confirmed identical to baseline (16/8/2/2) and in files not touched.

**N7 — does not reproduce.** Loaded the landing page logged-out with console, pageerror and response
listeners attached: **zero** console errors and no 4xx. The reported 405/404 were seen on staging, so
this is environment-specific rather than a code defect. Needs a repro against staging to re-open.

**N8 — label fixed; the "clipping" half does not reproduce.** "Available Buttons: 10" on a 24-cell
board was **the right number under the wrong label**. The value is `unlinked_buttons` — buttons with
no `load_board`, i.e. ones that SPEAK rather than navigate, summed across the whole linked set
(`board.rb:854`). The other 14 cells are navigation. Relabelled to **"Word Buttons"** with an
explanatory `title`, under a NEW key so existing translations of `available_buttons` are not silently
repurposed. Verified in-browser. The second half — "description clips mid-sentence" — is the same
misreport shape as the modal-scroll claim in section B: `.md-board-preview__description` is
`max-height: 190px; overflow: auto`, so it scrolls and no text is lost.

### Tap targets and the timezone-fragile stats specs (2026-08-24)

**Tap targets — measured, NOT a defect, no change made.** Swept the board-detail controls from
1440px down to 320px. The options toggle and sidebar toggle are **44x44 down to 712px** (the base
rule already carries a `WCAG 2.5.5 AAA touch target` comment) and shrink to 32x31, then 32x26 at
<=390px. **Every tier clears WCAG 2.5.8 AA (24x24); nothing measured below 24 anywhere.** AAA
(44x44) is therefore met on tablet/desktop and deliberately traded away on phones — `app.scss:69775`
explains why: these are "row-height-forcing controls", and at 44px each they hold the sentence bar
~90px tall, taking space from the communication surface. Enlarging them is a design decision with a
real cost to an AAC user, not a compliance fix, so it was left alone. The 26px height on the primary
communication surface is still worth a deliberate product call.

### The stats timezone failures are a PRODUCTION bug, not a spec bug (OPEN)

The backlog carried "~10 stats specs share the UTC-only shape". Measured: `spec/lib/stats_spec.rb`
is **58 examples — 4 failures under TZ=Pacific/Auckland and TZ=Asia/Tokyo, 1 under Europe/London, 0
under Honolulu, Denver and UTC.** So the fragility is real, but it is not in the specs.

All four failures are `expect(res[:days].length).to eq(4)` returning 5. **An attempted spec-side fix
was made and reverted** — making both ends of the range come from one clock (`Time.now` rather than
mixing `3.days.ago` with `Time.now`) is better hygiene but changes nothing, because
`Stats.find_sessions` calls `sanitize_find_options!`, which **rewrites both ends before the day loop
ever reads them** (`lib/stats.rb:801`, `:767-788`):

```ruby
end_time = (options[:end_at].to_date + 1).to_time      # local midnight AFTER the end date
options[:end_at]   = (end_time + end_time.utc_offset - 1).utc
options[:start_at] = options[:start_at].to_time.utc    # plain conversion, no local-date step
```

The two ends are normalised **asymmetrically**: the end is snapped to the end of its *system-local*
date and then offset-shifted into UTC, while the start is converted straight to UTC. In a zone ahead
of UTC the local date is a day ahead, so the normalised end lands one UTC date further from the
start and `start.to_date.upto(end.to_date)` yields an extra bucket. Traced under Auckland: end
normalises to `2026-08-25` UTC against a start of `2026-08-21` — five days; the same inputs in UTC
give four.

**This is a real reporting bug, not test flake.** `daily_use` is what backs per-day usage reports, so
for any user east of UTC the day range can carry an extra, empty day — and `lib/stats.rb:86` already
admits it with `# TODO: this doesn't account for timezones at all.`

**Deliberately not fixed here.** Correcting the normalisation changes report boundaries for real
users and needs a product answer first — should a day boundary follow the *communicator's* timezone,
the *server's*, or UTC? Weakening the assertions to make CI green would bury a live defect. Scoped
as: decide the zone semantics, fix `sanitize_find_options!` symmetrically, then assert day counts in
that zone.

### D4 — "board clutter" investigated: the premise is wrong (2026-08-24)

**The backlog said:** *"350+ boards after two picks. Each pick clones the whole linked set; old
copies are never cleaned up."* Measured against the dev database — both halves of that are wrong.

**It is signup, not picks.** *(Numbers in this section are DEV-DATABASE observations from uncommitted console runs — not production, and not reproducible from this repo. The mechanism below is traced in code and stands; treat the counts as illustrative.)* Two COPPA test accounts created today own **300 boards each**, made
**within 2 seconds of the account row itself** and before any board was ever picked (`home_board`
preference still `{}`). `UserBoardProvisioner.provision_for` runs on account creation
(`api/users_controller.rb:274`, also `session_controller.rb#google_link_user_candidate`) and copies whole linked sets:

| root slug | boards in its linked set |
|---|---|
| quick-core-60 | 61 |
| vocal-flair-60 | 94 |
| vocal-flair-84 | 97 |
| crisis-vocabulary | 1 |
| senner-baud | 43 |
| + `yesno`, `inflections` (sidebar utilities) | 2 |

296 + 2 ≈ **300 — exactly the observed count.** Gated by `signup_default_library_boards`, which is
**ON by default** (`FeatureFlags.signup_default_library_boards_enabled?` → true).

**Copies do NOT accumulate.** Checked every user for two copies of the same source board
(`parent_board_id` tallied per owner): **no user anywhere has a duplicate.** Picking a board already
in your library does not re-clone it, so "old copies are never cleaned up" does not reproduce. The
per-pick growth the reviewer inferred is not the mechanism.

**So D4 is not a bug — it is a design question with a number attached.** Every new account
materialises ~300 board rows (plus their BoardContent and button sets) before the user does anything.
That is deliberate: it gives a new user a browsable starter library and makes boards work offline.
The two real questions, neither of which is mine to answer:

1. **Is a 300-board starter library the right default**, or should provisioning be lazier (copy on
   first use / on pick)? At launch scale this is 300 rows per signup.
2. **The user-visible complaint is the boards LIST, not the row count.** 300 entries in "My Boards"
   is overwhelming regardless of whether the rows are justified. That may be a filtering/grouping UX
   fix rather than a provisioning change — and it would address the reported symptom without touching
   the offline story.

Re-scoped as a product decision, not a defect. Note the `example` account (100 boards) predates the
current slug list, so counts vary by signup date.

### D6 — editor label truncation: NOT reproduced, and the backlog's premise is also wrong (OPEN)

**The backlog said:** *"no ellipsis rule exists; labels are dynamically sized. Speak Mode renders
them fine, so it is editor-cell specific."*

**An ellipsis rule does exist.** Measured on `/example/board-detail/communikate-home` in speak mode:
18 cell labels, **0 clipped**, and `.md-board-detail-symbol-card__label` computes
`overflow: hidden; text-overflow: ellipsis; white-space: normal` at 21.6px. So the first clause is
false.

**The surface is not what earlier notes assumed.** `.button-label` — the class
`edit_manager.js:1041` writes, and the one an earlier trace pointed at — **does not appear on
board-detail at all** (0 nodes in either mode). That markup belongs to the CLASSIC board view
(`templates/board/index.hbs`, `user/board-alt`). Modern board-detail renders
`.md-board-detail-grid__cell` / `.md-board-detail-symbol-card__label`.

**Not reproduced in edit mode.** After entering edit mode the probe found **0 text nodes inside
`.md-board-detail-grid__cell`** — the editor re-renders the grid with different markup again, which
the probe did not capture.

**What this needs before anyone attempts a fix:** a specific repro — which board, which label text,
which view (modern editor vs classic), and at what viewport width. Without that, the previous two
attempts have both aimed at the wrong markup family. Worth noting that `edit_manager.js:1041` writes
`<span class='button-label' style='display: inline;'>` — an INLINE-styled `display: inline`, which
cannot be clipped by `text-overflow: ellipsis` at all — so if the report came from the classic view,
that inline style is the first thing to check.

## F. Housekeeping

- Delete the stray staging account `claudec1claudec1` (automation retry).
- Confirm which staging credentials are current — the Aug 13-14 ones returned 400 on re-test.
- **Rotate the staging password** if it is still live. *Corrected 2026-08-24: this item previously
  read "the one quoted in the v1 report", which is wrong and caused a false alarm.* The v1 report
  does **not** quote a password — it says "(password in the original report)", pointing at the
  external reviewer's document. Verified: `2026-08-21-lingolinq-claim-check.md` has **never been
  committed on any ref** (0 commits touch that path) and is gitignored by `.gitignore:149`
  (`[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*.md`). **No staging password is in this repo or on
  GitHub.** The exposure question, if any, is about the external report — not this repository.

---

## Suggested order

1. **D1** — the one remaining confirmed dead end in the core journey.
2. **D2** — high impact, low effort, and the copy explains *why* the wait matters.
3. **C1 + N1** — compliance sign-off and the untested COPPA path. Cheap to be wrong about, expensive to stay wrong about.
4. **D7 + D10** — low effort, and N3 makes both worse in the wrappers.
5. **N2 → N5** — do as one wrapper workstream before the app builds ship.
6. **D13 / N6** — TTS verification. Overdue for a communication app.
7. **D11** — needs a product decision first, then wiring + QA.
8. Everything else.

---

## A2. Adversarial review of this branch vs `staging`, 2026-08-24 — and the fixes

A file-level review of the whole branch diff (137 files) fanned out across five slices. Findings
below are the ones that were **verified in code at HEAD**, each with what was changed in response.
The pattern worth carrying forward: every High here was a *correct source change defeated by
something outside the diff* — a later `!important`, a shared flag, a route hook, a test fixture.
Reading the diff could not have found any of them.

| # | Finding | Fix |
|---|---------|-----|
| H1 | `start_code_lookup` shipped the supervisor's `user_name` on an endpoint that is exempt from `require_api_token`. `user_name` is accepted as a login credential by `session_controller`, so a forwarded invite link handed out a credential-stuffing target. | Server resolves the display value instead: `User#obfuscated_display_name` (real name when set, `obfuscated_name` otherwise). No handle on the wire. Specs assert the handle appears nowhere in the payload. |
| H2 | The once-per-user `tourAutoShown` gate also swallowed the options-menu **"Take a tour"** replay — they share `board_detail_tour_pending_speak`. The menu item is the only entry point (the component's own Shepherd button is `display: none`), so it was dead for everyone who had picked a home board. The code comment claimed the opposite. | `board_detail_tour_speak_manual` rides alongside the pending flag; the gate and its bookkeeping are skipped for a manual replay. Both auto writers clear it explicitly so a stale replay flag can never make an auto-open skip its one-shot. |
| H3 | Typing in the restored search box transitioned the route per 300 ms pause; the changed dynamic segment re-ran `setupController`, which called `load_results` unconditionally — flashing an empty "Loading boards…" panel on every pause and adding one permanent, never-removed `persistence` observer per keystroke. | `replaceWith` instead of `transitionTo`; one owner for the reload decision (`ensure_results_loaded`), called by both the controller and the route; the online observer is registered once and removed in `willDestroy`. The double-decode of `q` is now guarded (a lone `%` threw `URIError` on the hot path). |
| H4 | `spec_helper` set `DEFAULT_HOST` to `http://test.host` — already absolute — so `absolute_host` was a no-op in every spec and the entire `current_host` → `absolute_host` sweep could be reverted with the suite green. | Fixture is now a **bare** host, matching what production actually sets. Added a mailer spec that renders `parental_consent_request` with a bare host and asserts absolute hrefs plus the absence of any bare-host occurrence. **Verified to fail on revert** of a single call site. |
| H5 | All eight goal-status links in `log_message.{html,text}.erb` carried `#{@target.global_id}` as literal text outside any ERB tag, so every one 404'd. Pre-existing — but this branch rewrote all eight lines for the host sweep without noticing. | Converted to `<%= %>`. Also fixed on touched lines: a `/contact` path missing from the text part of `subscription_resume_failed`, a stray `s` attribute in `log_summary`, and `<br/>` in two `.text.erb` files. |
| H6 | The `.md-shell` `overflow-x: clip` sticky fix was cancelled outright at ≤1024 px by a pre-existing `@media (max-width: 1024px)` block re-declaring `overflow-x: hidden !important` on the whole ancestor chain at identical specificity and later source order (~60656, again ~68384). Tablets, phones, and desktop at ≥125 % zoom got no pinned Save bar — i.e. it failed exactly where WCAG 1.4.10 / 1.4.4 apply. | `clip` companion added to both blocks. Safe on the full selector list including `#content`, because by spec a `clip` on one axis computes back to `hidden` when the other is `auto` — so the app's one real scroll container is untouched and the line only bites where overflow-y is `visible`. |
| H7 | The corner anchor was put on the **base** tab rule, so `--speak` inherited it: an opaque `z-index: 1078` pill over the bottom-right communication cell of the board grid and the foot of the edit rail. D10's entire argument was about the navbar variant. | `right/left/transform` moved to `--navbar`; the base returns to centred. The 721–820 compact-sizing block is scoped to `--navbar` too — the collision it addresses only exists beneath the navbar. |
| M1 | Removing the `"No name"` seed left six server-side consumers rendering it bare (including the **welcome email**, now opening with a blank), and `utterance.hbs:49` / `utterance.js#user_showable` still guarding on the raw `name` — a new regression that hid the linked name behind "Someone said:". Separately, `author.name` was rendered at five client surfaces but `lib/json_api/log.rb` never emitted the key at all. | Views and the remaining Ruby display guards go through `User#display_name`; `PLACEHOLDER_NAME` / `placeholder_name?` are now the single definition of the sentinel. `json_api/log.rb` emits a resolved `author.name` with the same precedence `UserMailer#log_message` uses, and the five client sites go through `{{display-name}}` / `display_name_for` so cached payloads still resolve. |
| — | Ten user-facing strings had no locale entry. | `i18n_generator.rb --generate && --merge`; all twelve non-English locales now carry them. |
| — | `.md-board-details-modal__overlay-subtext` and `__overlay-count` were 4.23:1, and the `.md-board-preview__meta dt` labels 3.69:1 — all below WCAG 1.4.3's 4.5:1 for normal-size text. | Raised to `rgba($la-navy, 0.7)` = 4.89:1. The "Word Buttons" explainer moved from a `title` on a non-focusable `<dt>` to visible text tied by `aria-describedby`. |
| — | `board-preview-overlay` used one handler for both promise outcomes, so a failed image preload still told the user the board was "saved for offline use". | Separate reject path with an honest message. |
| — | Two code comments asserted things that were not checked: sassc-rails does **not** force `:sass` in development (`railtie.rb:72-77` exempts it), and the `calc()` simplification is Dart Sass's, not "the Ember minifier" — `ember-cli-build.js:23-25` disables minification entirely. | Both corrected in place, with the prior error named so the next reader does not go looking for a bug that is not there. |

**Process findings, recorded rather than fixed:**

- `no-orphaned-action` is defeated by this repo's i18n key convention — the index matches any quoted
  identifier-shaped token, and snake_case keys collide with snake_case action names (`board_layout`,
  `new_dashboard`, `manage_supervisors` are each masked by a `key="…"` attribute). It is a sampler,
  not a gate. Noted in `.eslintrc.js` so nobody reads a clean run as proof.
- 70 violations were added to `.eslint-todo` as suppressions and 0 fixed. That is a legitimate
  rollout choice, but it should be stated as such rather than implied to be a clean baseline.
- Several evidence line numbers elsewhere in this document no longer resolve at HEAD (`board-detail.hbs` (the Share & Print "Copy" item)
  is now `:1112`; `:1058/1068/1078` are `:1143/1133/1123`; `session_controller.rb#google_link_user_candidate` is `:971`, plus
  seven in `board-detail.js`). PR preflight P4 requires evidence resolvable at HEAD; prefer symbol
  names over line numbers in this document.
- Two QA harnesses could write to whatever `--base` pointed at, with no guard. Both now refuse a
  non-loopback host unless `--i-know-this-writes` is passed.

### A2b. Second pass — the tail, 2026-08-24

A2 above fixed the Highs and stopped. The remaining findings were then worked through,
because "fixed the important ones" is how a backlog row ends up saying *Done* while the
thing it describes is still half-broken — which is the failure this whole section is about.

**Tests that were not testing anything.** `spec/lib/json_api/absolute_host_spec.rb` carried an
example titled *"produces a followable consent link, which is the defect this exists for"* that
interpolated `absolute_host` into a string literal **in the spec** and asserted on the
concatenation. It touched no caller and passed with every production call site reverted. Deleted,
with a comment at the site saying why, pointing at the mailer spec that does the job. Two of the
four cases in `tests/integration/display-name-surfaces-test.js` had the same shape — they rendered
`{{display-name}}` in a scratch template, not `start_codes.hbs`, in a file whose preamble promises
"the REAL components". Removed; the contract they claimed to cover now lives in
`organizations_controller_spec.rb`, where the server decides it. One assertion in the view-mode
test read `assert.false(!!controller.get('can_set_as_home'))`, which is also true of `undefined` —
it would have stayed green if the computed were deleted outright. Now type-checked first.

**Coverage that did not exist.** The guided-tour sanitizer and the `PROGRESS_PARAMS` allowlist —
live user-input handling on the user record — had **zero** specs, which is how the allowlist
omission shipped in the first place. Eight examples added; verified they fail 7/8 with the
allowlist entry removed and 5/8 with the sanitizer disabled. Also added: `prior_named_email`'s
blank-name branch (its only prior reference stubbed the method out), `User#display_name` /
`placeholder_name?` / `obfuscated_display_name`, three `external_tracker` cases restoring the
name-splitting coverage the placeholder removal silently deleted, and
`spec/lib/tasks/clear_no_name_placeholder_spec.rb` — a bulk mutation over the whole user table
that had none, pinning the dry-run default, the substring non-match, and the "sends no mail,
queues no jobs" claim its comment makes.

**The lint gate caught a bug in this pass's own work.** `_close_options_menu` — the helper added
so the five modal-opening menu items stop leaving the menu open behind them — was first written
*inside* the `actions: {}` hash, where it is reachable as `controller.actions._close_options_menu`
but **not** as `this._close_options_menu`, which is what the callers use. Every one of those five
items would have thrown a TypeError on click. Nothing but `no-orphaned-action` noticed, and only
because the rule flagged it as an unreferenced action. Moved to the controller body and pinned by
a test that asserts it is *not* in the actions hash.

**Everything else in the tail.** The four new Board Actions items are now reachable by the menu's
own arrow keys (the per-item listeners snapshotted the visible items at open time and called
`stopPropagation`, so the container handler — which re-queries live — never ran; the snapshot could
not contain anything rendered later). All five new rows joined `SPEAK_MENU_ITEMS`, so they are
toggleable in Customize Menu like every other row, and the submenu disappears when all four
children are hidden rather than opening onto nothing. `aria-controls` + an id complete the
disclosure. `display_name_for` no longer seeds the "Purchaser's Name" and "Your Name" **write**
fields, against its own documented contract — blank is the honest default when signup collected no
name. The Preferences bar is frosted glass rather than a flat `#eef1f6` band over a fixed gradient
mesh, unpins below 560px of viewport height (WCAG 1.4.4), and preference dropdowns are `position:
relative; z-index: 3` so their trailing options stop painting behind it. The `.mjs` QA harnesses
are linted for the first time (`eslint .` walks only `.js` without `--ext`); the rule index now
expires after 5s so `eslint_d` stops telling developers to delete code they just wired up.

**Comments corrected rather than left to mislead**, each naming the prior error so the next reader
does not go hunting: the `.md-board-preview__actions` margins do *not* span the modal's full width
(the element is inside `col-sm-8`, so the left edge lands in the inter-column gutter — the right
edge is exact); the board-detail EDIT tour is **dormant**, since nothing sets
`board_detail_tour_pending` truthy, so no change to that path is observable at runtime; and
`url_scheme_for` returning http untouched is safe in production because `force_ssl = true`.
`absolute_host` now logs an error when it has no host at all instead of silently returning `''`
and emitting relative links.

### A2c. Not covered — read this before writing "verified" anywhere above

Everything in A2 / A2b is verified by test, by trace, or by both. The following are **not**, and
saying so here is the point: the failure this whole section documents is a source change that was
correct and still never reached a user.

**Needs a browser, on a live dev stack.** None of these can be seen from a unit test, and the
class of bug they belong to is exactly the one that got through last time.

> **The harness exists — it has not been run.** `app/frontend/scripts/a2c-click-tests-qa.mjs`
> covers all four, read-only (no boards copied, no preferences saved, no accounts created):
>
> ```
> bin/fresh_start                       # or foreman start; needs 8184 AND 5000 up
> cd app/frontend
> node scripts/a2c-click-tests-qa.mjs             # add --headed to watch
> node scripts/a2c-click-tests-qa.mjs --only D    # one group at a time
> ```
>
> **RUN 2026-08-24: 22 passed, 0 failed, 2 skipped.** Read the SKIPPED block in its summary as
> carefully as the failures — a check that could not reach its surface verified nothing, and is
> not a pass. The two skips are listed at the end of this section.
- **Speak-mode / edit-mode occlusion** after moving the corner anchor to `--navbar`. The base tab
  is centred again, which is where it sat before this branch, but no QA script exercises speak mode
  or board-detail edit mode. For an AAC app, an opaque pill over a communication cell is a product
  defect, so this wants a real click-test, not a cascade argument.
- **The `≤1024px` sticky fix.** `scripts/md-shell-sticky-qa.mjs` now runs 5 viewports over 7
  routes; run it. The reasoning (a `clip` on one axis computes back to `hidden` when the other is
  `auto`, so `#content` keeps scrolling) is spec-derived, not measured.
- **The Preferences bar** — frosted glass over the mesh, the `max-height: 560px` unpin, and
  dropdown options no longer painting behind it. Three visual changes, zero screenshots.
- **The Board Actions submenu by keyboard.** The per-item snapshot listeners are gone and the
  container handler re-queries live, which should make all four reachable by ArrowDown. Verify with
  a real Tab/Arrow pass, not by reading the handler.

**IT FOUND A REAL BUG THAT THE CASCADE ARGUMENT MISSED — and this is the whole case for
click-testing.** `overflow-x: clip` at ≤1024px was not enough. Two NARROWER blocks re-declare the
shorthand on the same element, one breakpoint down:

```
@media (max-width: 950px)  .md-workspace { overflow: hidden !important; }
@media (max-width: 820px)  .md-workspace { overflow: hidden !important; }
```

`overflow: hidden` sets BOTH axes, so `.md-workspace` became the scrollport again and captured the
sticky bar. Measured, not inferred:

| viewport | `.md-workspace` computed | Save bar |
|---|---|---|
| 1024x768 | `clip` / `visible` | pinned at y=685..768 |
| 768x1024 | **`hidden` / `hidden`** | y=**1936** in a 1024px viewport |
| 390x844  | **`hidden` / `hidden`** | y=**2337** in an 844px viewport |

So the ≤1024 fix worked at exactly one breakpoint and the bar was still dead on every phone and
portrait tablet — while 2116 Ember tests reported `# fail 0`. Fixed with `overflow: clip` on both
axes (these rules pair with `border-radius` to clip the full-bleed corners, so the intent is
CLIPPING, not scrolling; `clip` preserves it and establishes no scroll container). Re-measured:
`768x1024 → y=941..1024`, `390x844 → y=761..844`.

**Confirmed by the run:**
- **A** — in board-detail EDIT mode the tab centre is **640 in a 1280 viewport**, i.e. centred, and
  it covers no interactive element. Incidentally confirmed the `--navbar` geometry note: the tab
  lands 1408 of 1440, **32px** from the edge, which is the double-padding predicted from
  `.app-navbar__inner` rather than the `right: 16px` the rule appears to say.
- **B** — all five viewports pin, computed `overflow-y: visible` throughout.
- **C** — `rgba(255,255,255,0.76)` + `blur(14px)`; `static` at 520px height, `sticky` at 800px.
- **D** — all four submenu items receive focus from ArrowDown; `aria-controls` resolves to a real
  element once expanded.

**Still unverified after the run — the two skips.**
- `A-classic board` — the board URL redirects to `user.board-detail.index`, where the tab is
  suppressed by `hide_beta_feedback_temporarily` (TEMPORARY, 2026-07-27). The occlusion question is
  moot on that route while the suppression stands, but it is moot because nothing renders, not
  because anything was checked. **The first version of this check pointed ONLY at that route and
  skipped twice — which reads as a clean run and proves nothing.** If the suppression is removed,
  re-target the check.
- ~~`C-dropdown-above-bar`~~ — **CLOSED 2026-08-24, manually confirmed by Traci.** The harness
  skipped it twice (no `bound-select`/`modern-select` renders on Preferences for the `example`
  account), which made the `position: relative; z-index: 3` stacking fix the one change in
  A2/A2b with no runtime evidence at all. Confirmed by hand instead: an open dropdown near the
  bottom of the form paints ABOVE the pinned Save bar, and still pushes the card taller rather
  than overlaying or being clipped by the accordion's rounded edge — so the `static` → `relative`
  swap kept the in-flow behaviour the original rule was written for.
  The automated check remains a SKIP; it needs an account whose Preferences page renders one of
  those controls. Do not read the skip as coverage.

**Manual confirmation log.** Items click-tested by a human, where the automated harness could not
reach the surface or no harness covers it. Kept as a running list because "verified" without a date
and a name is the same unsourced claim this section exists to stamp out.

| Date | Who | Item | What was actually exercised |
|---|---|---|---|
| 2026-08-24 | Traci | Preferences dropdown stacking (`C-dropdown-above-bar`) | An open dropdown near the bottom of the form paints ABOVE the pinned Save bar, and still pushes the card taller rather than overlaying or being clipped by the accordion's rounded edge — so the `static` → `relative` swap kept the in-flow behaviour the original rule was written for. The automated check still SKIPS. |
| 2026-08-24 | Traci | "Take a tour" manual replay (**H2**) | Options → Take a tour opens the tour; closing and choosing it AGAIN opens it a second time (the whole fix — it was permanently dead for anyone who had picked a home board); and the auto path still self-suppresses, firing once on a home-board pick and not on the next. **This was the ONLY evidence for H2**: `git grep board_detail_tour_speak_manual -- app/frontend/tests/` returned nothing, and `scripts/a2c-click-tests-qa.mjs` does not cover the tour either. A unit test for the flag-writing half has since been added (`user-board-detail-view-mode-actions-test.js`); actually STARTING the tour needs Shepherd plus a rendered board grid and remains browser-only. |
| 2026-08-24 | Traci | Find Boards search (**H3**) | Typing at ~1 char/sec does not flash the results panel empty between keystrokes; a single Back leaves the page rather than walking the query back a character at a time; `50%` in the box does not blank the page or throw; Enter runs the search and the × clears it; changing the language dropdown re-fetches. This is the first runtime evidence for H3 — the `replaceWith` + `ensure_results_loaded` + observer-removal fix previously had only a code trace, and the defect it fixes (an empty-state flash and one leaked `persistence` observer per keystroke) is invisible to every unit test. |

**Known limitation, shipped deliberately.** `overflow-x: clip` requires Safari 16 / Chrome 90 /
Firefox 81. iPads capped at iPadOS 15 (iPad Air 2, iPad mini 4) and older Cordova WKWebViews keep
the old, sticky-inert behaviour — the `hidden` fallback preserves containment, so nothing breaks,
but the Save bar does not pin there. That is a real slice of AAC hardware.

**Left as-is, with reasons.**
- The **70 `no-orphaned-action` entries stay baselined**; none were triaged. That is a rollout
  choice, not a clean baseline, and `.eslintrc.js` records that the rule is a sampler — this repo's
  snake_case i18n keys collide with action names, so a clean run is not proof of no orphans.
- The **board-detail EDIT tour is dormant**, not wired. Nothing sets `board_detail_tour_pending`
  truthy, so changes to that path are unobservable at runtime.
- **`.md-board-preview__actions`** still stops at the canvas column's gutter on the left at ≥768px.
  Making it genuinely full-width means lifting it out of `col-sm-8`, which changes the layout the
  modal was designed around; the comment now states the true geometry instead of claiming
  otherwise.
- **`absolute_host` still returns `''`** when there is no host at all. It logs an error now, so a
  misconfigured environment is findable, but it cannot invent a host.
- The **eslint-todo gate is line-anchored**, so an edit above a baselined line reports it as new
  and forces a rebaseline. Verify a rebaseline by diffing PER-RULE counts, not the total — that is
  what distinguishes renumbering from a real regression.


### A3. Board Ideas · Button Stash · Set as Home Board relocated, 2026-08-24

Moved out of the board-detail edit panel's "Board Actions" group (which had grown to seven rows)
into the Board Actions modal, immediately above View Style — which came from the same panel
earlier, so the modal is now where relocated panel rows live.

**Why this needed care rather than a delete.** `suggestions` and `open_button_stash` had **no other
render site anywhere in the app** — `git grep 'ctrlAction "open_button_stash"'` returned exactly one
hit. Removing the rows alone would have made Button Stash unreachable from every surface, which is
precisely the failure this modal exists to undo: the board-detail redesign migrated nine actions
onto an edit-mode-only surface and four ended up with no route at all, found months later by an
outside usability review. `set_as_home` was the safe one — it also renders in the view-mode options
menu.

**What was done**
- Three rows added to `components/board-actions.hbs` before View Style, each with a handler on
  `components/board-actions.js` mirroring the controller action it replaces (this modal handles its
  own rows rather than delegating — see its siblings).
- `open_button_stash` carries over the paint-mode clear as `editManager.clear_paint_mode()`. The
  controller's version cleared its own `paint_mode` UI flag, which this component cannot reach; the
  shared editManager state is the half that governs what a click on a button actually DOES.
- Board Ideas / Button Stash are `disabled={{this.cannot_edit}}`, matching their neighbours.
  **Set as Home is deliberately NOT**: `User#process_home_board` authorizes on `view`, so picking a
  public vocabulary as your home board needs no edit rights on it. It is instead hidden when the
  board is already the subject's home board, the same rule as the options-menu row.
- The two now-dead controller actions were **deleted**, not left behind, after confirming by grep
  and by `lingolinq/no-orphaned-action` that nothing referenced them.

**Verified.** 9 unit tests on the component (handler existence, permission gating, the
already-home rule, the empty-vs-empty trap, referenced_user-vs-supporter subject) plus
`scripts/relocated-board-actions-qa.mjs` — **13 passed, 0 failed** on `example/communikate-action`
(owned, not home), driving real clicks through BOTH entry points and asserting each row opens its
modal by heading change: `"Board Actions" -> "Board Ideas" / "Button Stash" / "Set Home Board"`.

**Two harness bugs found and fixed while writing it**, both of which had produced false failures
against correct code — worth knowing because the same mistakes are easy to repeat:
1. The edit panel's "Board Actions" group is a **collapsible accordion**; "Other Actions" is not in
   the DOM until it is expanded. Not expanding it reported "no Other Actions entry point".
2. The wiring check compared `document.body.innerText.slice(0, 400)` before and after the click.
   That slice is the nav sidebar and is byte-identical either way, because the modal renders
   elsewhere in the DOM — so every row looked like a silent dead action. Compare the modal HEADING.

**Fixture sensitivity to know before reading a run.** Board Ideas and Button Stash are disabled
without edit rights, and Set as Home is hidden on a board that is already home — so a run against
the wrong board SKIPS the very checks you care about. `example/communikate-home` skips Set as Home;
`lingolinq/crisis-vocabulary` skips both edit rows. Use an owned, non-home board.
