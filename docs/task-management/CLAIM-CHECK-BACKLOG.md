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

| Finding (v1 + v2) | Fixed in | Verified |
|---|---|---|
| "Hi No name" / "NO NAME"; signup never asks for a name | `1e293fb03` (+ `35cc67d05`) | Root cause removed server-side, 20 client sites, 10 more fixed for free incl. the utterance SMS. Browser-verified against a live nameless account. |
| Main Search box ignores typing; Enter re-fires previous query | `52d60457a` | Browser: label/URL/API all track typed text |
| Board-picker filter works while main search doesn't | `52d60457a` | Same fix — the inconsistency is gone |
| Save Preferences ~2,025px down, no sticky bar | `35cc67d05` | Bar pins at 717/800 in an 800px viewport |
| Speak Mode tour repeats on every board | `b0e32c94d` | Pick #1 fires, pick #2 does not |
| Tour cannot be dismissed from the keyboard | `b0e32c94d` | Escape closes, arrows advance |
| Tour progress never persisted at all (not in either report) | `b0e32c94d` | `guided_tours_completed` was missing from the server allowlist — the "seen" badge had never worked |

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
| D1 | **"Set as Home" / "Copy" unreachable outside edit mode** | small-moderate | Highest-value remaining item — but **not** "build it", as both reports imply. See the note below the table. |
| D2 | **Home-board pick feedback** | low | 30-40s copy behind a generic spinner; lands on My Boards, not the new board; no confirmation. Add progress + "makes it available offline" microcopy. |
| D3 | **Let users explore a set before picking** | moderate | Preview is a static image of the top board only. Offline-first makes this a core path, not polish. |
| D4 | **Board clutter** — 350+ boards after two picks | moderate | Each pick clones the whole linked set; old copies are never cleaned up. |
| D5 | **DOB dropdowns** → native/typeable inputs | moderate | 121-item custom scroller, no type-ahead. See C1 — month+year typed fields satisfy the FTC example *and* fix the motor load. |
| D6 | **Editor label truncation** | not "low effort" | Investigated: no ellipsis rule exists; labels are dynamically sized. Speak Mode renders them fine, so it is editor-cell specific. Needs a real trace. |
| D7 | Board preview CTA below the fold at ~620px | low | Modal *does* scroll (see B). A pinned action bar — same pattern as the Preferences fix — would close it. |
| D8 | Registration consolidation (5 screens → fewer) | higher | Keep the DOB step; role + signup-method are the merge candidates. |
| D9 | Contrast/font audit against **AAA** | medium | v1's "likely fails AA" was wrong — measured 4.59:1, which passes AA. Reframe as AAA (7:1) for this user base. Include the Maitree serif headings. |
| D10 | Beta-feedback pill on every page | low | Make dismissible or corner-anchored. **Plus an a11y bug:** the expanded form stays in the DOM while visually hidden and can take focus and keystrokes — check screen-reader/switch behaviour. |
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
| N1 | **Untested: the whole post-under-13-signup experience** | medium | Nobody has exercised the pending-approval state, the parent's approval email, or what the child can do while waiting. This is the COPPA path actually working or not. |
| N2 | **Webview: Google OAuth will break** | medium | Google blocks OAuth from embedded webviews (`disallowed_useragent`). Needs Chrome Custom Tabs (Android) / `ASWebAuthenticationSession` (iOS), or hide the button in wrapped builds. |
| N3 | **Webview: every dead end becomes a trap** | medium | No browser Back. Raises the stakes on D7 (tablet-shaped screens) and any screen without an in-app exit. The registration flow's "Change date of birth" links are the right pattern to copy. |
| N4 | **Webview: parental approval crosses contexts** | medium | The parent opens the link in their own browser, so approval must sync back (poll/push) and the child's app needs a "waiting for your parent" state. Pairs with N1. |
| N5 | **Webview: store rules touch the purchase UI** | medium | Apple requires IAP for digital subscriptions and rejects webviews linking out to external payment. Needs per-platform UI flags. Google Play Families / Apple kids policies add child-directed requirements. |
| N6 | **Webview: verify TTS in WKWebView specifically** | verification | Speech support and voices differ from Safari; CoughDrop bridges to native. Do with D13. |
| N7 | Landing-page console errors (a 405 and a 404) | low | Small ticket. |
| N8 | Preview-modal data oddities | low | "Available Buttons: 10" on a 24-cell board; description clips mid-sentence. |
| N9 | Search results open in two steps | low | Not a bug — desktop layout is fine at 1280×800 and 1000×700. One click slower than CoughDrop. |

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

**This supersedes the narrow framing of D1**: it is not one missing menu entry, it is nine actions
migrated to an edit-mode-only surface. Fixing D1 by adding two items to `board-actions.hbs` treats
the symptom; the question worth answering first is which of the nine belong in a view-mode surface.

### G3. Confirmed dead code — the dropdown that was removed

Zero references in any template or JS (verified individually, not just by the script):

| Action | Site |
|---|---|
| `toggle_details_dropdown`, `details_dropdown_keydown` | `controllers/user/board-detail.js:5793`, `:5809` |
| `toggle_share_dropdown` | `board-detail.js:6388` |
| `toggle_folder_dropdown` | `board-detail.js:7922` |
| `open_board_picker` | `board-detail.js:6405` |
| `copy_board` (board-detail's own) | `board-detail.js:6326` — the sibling `set_as_home` survived into the edit panel; this one did not |
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

**Rollout:** the 74 pre-existing cases are recorded in `.eslint-todo`, so nobody is blocked, and
`npm run lint:js:ci` fails on a NEW one. Verified end to end: a probe action added to
`board-actions.js` produced `new=1` and a failing gate; wiring it into the template returned
`new=0`; probes reverted. The rebaseline was checked per-rule — no other rule's count grew, and
`ember/require-computed-property-dependencies` dropped by one (stricter).

**Still worth doing:** triage the 74 baselined cases. They are leads, not confirmed dead code —
`orphans.json` and section G3 hold the ones already verified.

## F. Housekeeping

- Delete the stray staging account `claudec1claudec1` (automation retry).
- Confirm which staging credentials are current — the Aug 13-14 ones returned 400 on re-test.
- **Rotate the staging password** if the one quoted in the v1 report is still live.

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
