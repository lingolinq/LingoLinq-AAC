# Eval Rework — Tiered SLP Assessment Suite

**Branch:** `traci/feature/eval-rework`
**Status:** Plan, awaiting approval to scaffold
**Owner:** Traci
**Last updated:** 2026-05-09

---

## Goal

Replace LingoLinq's current procedural eval flow with a tiered, modern, feature-matching assessment suite for SLPs. Three administration tiers — 5, 10, and 15 minutes — built on one shared item-bank, session model, and recommendation engine. Population-aware intake routes to age- and etiology-appropriate items. Mode 1 (Quick Screen) ships first.

---

## Why now

- Current `eval.js` is 2,807 lines of procedural board generation. Works, but hard to extend, hard to test, and unaware of population/etiology.
- Modern SLP best practice is **Feature Matching** + **Dynamic Assessment** + **SETT framework** — none of which the current system exposes as first-class.
- Competitors (DAGG-3 from Tobii, TASP, Communication Matrix) ship structured tools but none combine adaptive item banks, multi-access trial, and AI-narrated SETT reports inside the AAC device itself.
- Existing branch is mostly modal-to-component refactor — the algorithmic layer is untouched, so we can rework it cleanly.

---

## Research summary (what SLPs use today)

| Tool | What it measures | Time | Notes |
|---|---|---|---|
| **TASP** (Bruno, 2010) | Symbol performance, basal/ceiling | 10–20 min | Closest analog to our 10-min target |
| **Communication Matrix** | 7 levels of communicative behavior | Untimed (web) | Gold standard for early/pre-symbolic |
| **DAGG-3** (Tobii, free) | Linguistic / operational / social / strategic | Variable | Direct competitor; goals + progress grid |
| **CSBS** | Early communication, 6–72 mo | 30–75 min | Out of scope for in-device, useful as model |
| **AAC Profile** (Kovach 2009) | Continuum of learning | Variable | Influence for tiered design |
| **SETT framework** (Zabala) | Student / Environment / Task / Tools | Process, not test | We adopt as report structure |
| **Feature Matching** (ASHA portal) | Match user strengths/needs to features | Process | Primary/secondary/tertiary components |
| **Dynamic Assessment** (Vygotsky-rooted) | Learning potential via graduated prompts | Process | Best practice; nobody has it built into device |

---

## Architecture

### Three modes, one engine

```
                 ┌──────────────────────────────┐
                 │  Intake (population + access) │
                 └───────────────┬───────────────┘
                                 │
                       Item-bank profile selection
                                 │
       ┌─────────────────────────┴───────────────────────────┐
       │                          │                          │
   ┌───▼────────┐         ┌───────▼──────────┐      ┌────────▼──────────┐
   │ Mode 1     │         │ Mode 2            │      │ Mode 3             │
   │ Quick      │ ──────► │ Targeted          │ ───► │ Comprehensive +    │
   │ Screen     │ promote │ Feature-Match     │      │ DA + SETT report   │
   │ ~5 min     │         │ ~10 min           │      │ ~15 min            │
   └────────────┘         └───────────────────┘      └────────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Recommendation engine (pure)  │
                  │   events + intake → config    │
                  └───────────────┬───────────────┘
                                  │
                  ┌───────────────▼───────────────┐
                  │ Outputs: starter board JSON,   │
                  │ SETT report, LogSession data   │
                  └────────────────────────────────┘
```

### Key design decisions

1. **Item bank, not procedural levels.** Convert eval.js's `levels` array to JSON item bank stored as versioned `EvalProtocol` records. Three modes select subsets via session-policy. One source of truth.
2. **Session state machine.** New `EvalSession` Ember service replaces ad-hoc `working` object in eval.js. States: `configuring → screening → targeting → comprehensive → reviewing`. Resumable across modes — Quick Screen promotes to Targeted without losing data.
3. **Pure recommendation function.** `recommend(events, intake) → DeviceConfig`. Same logic on frontend (`utils/eval_recommend.js`) and backend (`lib/eval_recommend.rb`) for offline + Resque.
4. **Reuse, don't rewrite.** Keep eval.js's OBF callback registration and `obf.shell` board renderer. New code emits item specs that the existing renderer consumes.
5. **Backwards compatible LogSession.** Extend `data` shape; keep `log_type='eval'`. Old records keep rendering.
6. **Behind a feature flag.** `quick_screen_eval` flag in `lib/feature_flags.rb`. Beta orgs opt in.

---

## Population branching (intake → item-bank profile)

Intake form (~60s) collects four fields, all from the conversation answer "All populations, branched by intake":

| Field | Options |
|---|---|
| Age band | <3 / 3–5 / 6–12 / 13–21 / 22–64 / 65+ |
| Etiology category | Developmental / Autism / CP / Acquired (stroke/TBI) / Progressive (ALS/MND) / Sensory-primary / Unknown |
| Current communication | None observable / Pre-symbolic / Single-symbol / Phrase / Sentence |
| Suspected access | Direct touch / Switch / Gaze / Unknown — try multiple |

Routes to one of five **item-bank profiles**:

| Profile | Trigger | Item emphasis |
|---|---|---|
| `early-comm` | Pre-symbolic at any age | Communication Matrix L1–4, cause-and-effect, joint attention, choice-making |
| `peds-emerging` | Symbolic-emerging, age <13 | Single-symbol find, core-word find, 4→9→16 grids, kid fringe |
| `peds-established` | Phrase+ syntactic, age 6–21 | Categories, simple syntax, fringe vocab, literacy probe |
| `adult-motor` | Adult acquired with motor needs | Multi-access weighted, fast cognitive probe, fatigue-aware items, adult fringe |
| `adult-progressive` | Progressive etiology | Gaze-first multi-access, predictive layouts, life-participation vocab |

Each profile is a JSON document seeded into `EvalProtocol`. SLPs can optionally override the auto-selected profile.

---

## Mode 1 — Quick Screen (5 minutes) — DETAILED DESIGN

### Subtests (~5 min total, time-boxed)

1. **Stage probe** — 60s, 4 items
   - Cause-and-effect (1 button → animation)
   - Choice-making (2 photos)
   - Symbol→referent match (3 trials)
   - Category recognition (1 item)
   - **Output:** `communicator_stage` (1–7, Communication Matrix-aligned)

2. **Access snapshot** — 90s, motor probe across suspected access channels
   - 3 → 6 → 12 button progression
   - Per-channel for whichever methods are configured/available (touch, scan, gaze via `capabilities`)
   - Records: hit accuracy, miss radius, dwell duration, fatigue trend (accuracy degradation across items)
   - **Output:** `access_recommendation` `{ method, confidence, secondary }`

3. **Symbol library micro-comparison** — 60s, 6 trials
   - Same target word in 2 active libraries, shuffled to control novelty bias
   - **Output:** `library_preference` `{ winner, margin, response_times }`

4. **Vocabulary depth probe** — 60s, 3 items
   - 1 core word (pronoun or verb), 1 high-frequency noun, 1 category
   - **Output:** `vocab_band` `{ core, fringe, category }`

5. **Wrap card** — 15s
   - Auto-generated "Start here" recommendation
   - SLP quick-notes field
   - "Promote to Targeted Eval" button (stub for Mode 2)
   - "Build starter board" button (consumes recommendation JSON, hands to existing board generator)

### Recommendation engine contract

```js
// app/frontend/app/utils/eval_recommend.js
function recommendFromQuickScreen(events, intake) {
  return {
    access_method: 'touch',                 // touch | scan | gaze
    access_secondary: 'gaze',               // optional
    grid_size: { rows: 3, cols: 3, band: 'small' },
    library: 'symbolstix',                  // winner of bake-off
    communicator_stage: 4,                  // 1–7 Communication Matrix
    vocab_recommendation: {
      core: true,
      fringe_categories: ['food', 'animals', 'play'],
      band: 'emerging',
    },
    starter_board_spec: { /* OBF-compatible */ },
    confidence: 0.74,
    next_action: 'build_starter_board',     // or 'promote_to_targeted'
    promote_reasons: [],
  };
}
```

### LogSession data shape (extension, not replacement)

```json
{
  "log_type": "eval",
  "data": {
    "eval_mode": "quick_screen",
    "protocol_version": "1.0",
    "intake": {
      "age_band": "6-12",
      "etiology": "autism",
      "current_comm": "single_symbol",
      "suspected_access": "touch"
    },
    "item_bank_profile": "peds-emerging",
    "events": [
      {
        "subtest": "stage_probe",
        "item_id": "cm_l3_01",
        "response": "correct",
        "latency_ms": 1820,
        "prompt_level": 0,
        "access_method": "touch",
        "hit_pos": [314, 198],
        "target_pos": [320, 200],
        "grid": [3, 3]
      }
    ],
    "recommendation": { /* see above */ },
    "duration_s": 287,
    "slp_notes": ""
  }
}
```

---

## Mode 2 — Targeted Feature-Match (10 min) — outline

Includes Mode 1 + adds:
- **Adaptive grid sweep** (binary search 4 → 9 → 16 → 24 → 36 → 60 → 84) — replace eval.js's linear stepping with a true binary-search policy.
- **Symbol library 3-way bake-off** with shuffled order.
- **Access-method co-trial** — same 6 items run via each available access method, side-by-side timings. Major modern differentiator.
- **Receptive vs expressive split** — explicit task labeling.
- **Output:** Feature-match report + exportable JSON board spec.

Detailed design produced after Mode 1 ships.

---

## Mode 3 — Comprehensive Eval (15 min) — outline

Includes Mode 2 + adds:
- **Dynamic Assessment protocol** — every item escalates through prompt levels (independent → expectant pause → verbal model → gestural cue → partial highlight → full prompt). Each level is timestamped and scored separately. Best-practice per current research, not in any commercial AAC eval.
- **Literacy probe** — reuse eval.js level 9.
- **SETT companion form** — Student / Environment / Task fields filled alongside session.
- **AI-narrated SLP report** — feature-flagged. Claude API ingests events + SETT form + recommendation, drafts SLP-readable narrative for IEP/insurance documentation. Uses prompt caching (per CLAUDE.md `claude-api` skill guidance) to keep cost low. Opt-in per org.
- **Output:** PDF-exportable SETT report + DAGG-style goals grid + auto-built starter board set.

Detailed design after Mode 2 ships.

---

## File layout (Mode 1 scope)

### Backend (Rails)

| File | Purpose |
|---|---|
| `app/models/eval_protocol.rb` | Versioned item-bank templates (mirrors `profile_template.rb`) |
| `db/migrate/YYYYMMDDHHMMSS_create_eval_protocols.rb` | Migration |
| `db/seeds/eval_protocols.rb` | Seeds the 5 starter item-bank profiles |
| `app/controllers/api/eval_protocols_controller.rb` | REST: index, show |
| `app/controllers/api/eval_sessions_controller.rb` | REST: create, update (events), recommend |
| `lib/json_api/eval_protocol.rb` | Serializer |
| `lib/json_api/eval_session.rb` | Serializer |
| `lib/eval_recommend.rb` | Server-side recommendation function (mirror of frontend) |
| `lib/feature_flags.rb` | Add `quick_screen_eval` flag |
| `spec/models/eval_protocol_spec.rb` | Model spec |
| `spec/lib/eval_recommend_spec.rb` | Engine spec — high coverage target |
| `spec/controllers/api/eval_protocols_controller_spec.rb` | Controller spec |

### Frontend (Ember)

| File | Purpose |
|---|---|
| `app/frontend/app/utils/eval_session.js` | State machine service |
| `app/frontend/app/utils/eval_recommend.js` | Pure recommendation function (mirror of backend) |
| `app/frontend/app/utils/eval_items.js` | Item-bank loader & filter |
| `app/frontend/app/components/eval-quick-screen/index.js` + `.hbs` | Outer container |
| `app/frontend/app/components/eval-quick-screen/intake.js` + `.hbs` | 60s intake form |
| `app/frontend/app/components/eval-quick-screen/runner.js` + `.hbs` | Subtest runner |
| `app/frontend/app/components/eval-quick-screen/report.js` + `.hbs` | Wrap card + recommendation |
| `app/frontend/app/routes/eval/quick.js` | Route |
| `app/frontend/app/templates/eval/quick.hbs` | Top template |
| `app/frontend/tests/unit/utils/eval_recommend_test.js` | Engine unit tests |
| `app/frontend/tests/unit/utils/eval_session_test.js` | State machine tests |
| `app/frontend/tests/integration/components/eval-quick-screen-test.js` | Component test |
| `public/locales/en.json` (and others) | New i18n keys via `i18n_generator.rb` |

### Reuse without modification

- `app/frontend/app/utils/eval.js` — keep functioning for legacy `obf/eval-*` boards. Don't rewrite v1.
- `app/frontend/app/components/stats/eval-hits.js` — heatmap reused for access snapshot visualization.
- OBF `obf.shell` and `evaluation.callback` — runtime board renderer untouched.
- `LogSession` model — extend `data` shape only.

---

## Phasing (Mode 1)

| Phase | Scope | Demo-able? |
|---|---|---|
| **1A — Plumbing** | `EvalProtocol` model + migration + seeds, recommendation function with tests, session state machine with tests, item-bank JSON for `peds-emerging`, feature flag | No (backend + utility only) |
| **1B — Intake + Stage probe** | Intake form component, stage-probe subtest, render via `obf.shell`, save to `LogSession` | Yes — minimal flow end-to-end |
| **1C — Access + Library** | Multi-channel motor probe (start touch-only; gaze/scan in 1.x), 2-library bake-off | Yes — fuller subtest set |
| **1D — Vocab + Wrap card** | Vocab probe, recommendation card UI, "Promote to Targeted" stub button | Yes — full Mode 1 flow |
| **1E — Polish** | All 5 item-bank profiles, i18n complete, SLP quick-notes, ≥80% coverage on recommendation engine | Ship-ready beta |

---

## What "impressive" looks like at end of Mode 1

- SLP runs a 5-minute screen on a new client.
- Population-aware intake auto-selects appropriate items.
- At minute 5, one-card recommendation: access method + grid size + library + communicator stage + starter vocabulary band.
- One tap promotes session to Targeted Eval (Mode 2) without data loss.
- Data is exportable, queryable in existing logs UI.
- Behind feature flag — beta orgs validate before rollout.

---

## Differentiators vs DAGG-3 / TASP / Communication Matrix

1. **Dynamic Assessment built in** (Mode 3) with prompt-level scoring — research best-practice, not in any commercial AAC eval.
2. **Live multi-access trial** (Mode 2) — same items, all available access methods, side-by-side. `capabilities.js` already provides the hooks.
3. **Recommendation → starter board pipeline** — eval output consumable by existing board generator. SLP gets a working board on day 1.
4. **AI-narrated SETT report** (Mode 3, flagged) — drafts IEP-quality writeup, SLP edits.
5. **Tiered + resumable** — 5-min triage today, promote to 15-min comprehensive next visit, no data lost.
6. **Heatmap + motor map** — `eval-hits` data surfaced as actionable visualization in every mode.
7. **OBF-compatible exports** — recommended boards exportable as OBF/OBZ via existing exporter.

---

## Risks and tradeoffs

- **Scope creep on Mode 3.** Dynamic Assessment + SETT companion + AI narration is the biggest single chunk. Phasing keeps this honest.
- **Eval.js refactor surface.** Converting `levels`/`words` to JSON item bank is real work but unlocks all three modes sharing logic. Skipping it = three parallel codebases.
- **Backwards compatibility.** Existing `LogSession log_type='eval'` records must keep rendering. New shape extends, not replaces.
- **AI narration cost/privacy.** Per-session API call. Needs feature flag, opt-in for orgs, prompt-cached system prompt to keep cost low. Anthropic SDK already in scope per CLAUDE.md.
- **Population branching authoring.** v1 ships 5 fixed item-bank profiles. SLP-authored protocols deferred to v1.x.

---

## Open questions for round 2

1. **Item authoring** — fixed catalog v1, or SLP-customizable from day one?
2. **Heatmap visibility** — surface `eval-hits` heatmap inline during Mode 1, or save for the report card only?
3. **Library defaults** — which 2 symbol libraries default to the micro-comp? (PCS, SymbolStix, ARASAAC, OpenSymbols — depends on contractual / availability story.)
4. **Promotion data model** — when Mode 1 promotes to Mode 2, is it the same `LogSession` extended, or a linked sibling session? (Recommend extended for continuity.)

---

## Sources

- [ASHA Practice Portal — AAC](https://www.asha.org/practice-portal/professional-issues/augmentative-and-alternative-communication/)
- [PrAACtical AAC — Five AAC Assessment Tools You Should Know](https://praacticalaac.org/praactical/five-aac-related-assessment-tools-you-should-know-about/)
- [PrAACtical AAC — SETT, AAC, Evaluate](https://praacticalaac.org/praactical/aac-assessment-corner-with-vicki-clarke-ready-sett-aac-evaluate/)
- [PrAACtical AAC — Is AAC Feature Matching Still Relevant?](https://praacticalaac.org/praactical/aac-assessment-corner-by-vicki-clarke-is-aac-feature-matching-still-relevant/)
- [PMC — Dynamic Assessment for AAC: Expressive Syntax](https://pmc.ncbi.nlm.nih.gov/articles/PMC4634893/)
- [PMC — DA for 3- and 4-Year-Olds Who Use AAC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5831088/)
- [PMC — Multi-modal Access (eye-tracking + switch-scanning)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9576815/)
- [PMC — Eye Tracking Research for AAC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4327869/)
- [Tobii Dynavox — DAGG-3](https://us.tobiidynavox.com/products/dagg-3)
- [Tobii Dynavox — DAGG-2 PDF](http://tdvox.web-downloads.s3.amazonaws.com/MyTobiiDynavox/dagg%202%20-%20writable.pdf)
- [Bilinguistics — Confidently Assess AAC with the Communication Matrix](https://bilinguistics.com/communication-matrix/)
- [Gateway to Language and Learning — TASP](http://www.gatewaytolanguageandlearning.com/resources/ewExternalFiles/TASP_2020.pdf)
- [Reading Rockets — SETT Framework](https://www.readingrockets.org/topics/assistive-technology/articles/sett-framework-tool-selection)
- [PRC-Saltillo — Standardized Assessment in AAC Evaluations](https://prc-saltillo.com/blog/standardized-assessment-in-aac-evaluations)
- [AAC Community — Evaluation Tools](https://aaccommunity.net/caac_slp/evaluation-tools/)
- [Forbes AAC — Feature-Matching Access Features](https://www.forbesaac.com/post/feature-matching-in-aac-assessment-access-features)
