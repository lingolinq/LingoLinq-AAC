# Multilingual Language Layer - Phase Roadmap

**Status:** Living roadmap. Companion to `MULTILINGUAL_LANGUAGE_LAYER_SCHEMA.md` (design doc, PR #522).
Produced 2026-07-03 after resolving the design doc's 5 open questions (Section 8). This is the source
of truth for phase sequencing -- update it here first when a decision or phase status changes; the
team-facing Notion page (linked from Engineering Home) is kept in sync from this file.

**Companion Notion page:** see Engineering Home -> Technical Stack & Roadmap section for the
plain-language team view of this roadmap.

---

## Decisions locked (Section 8 resolved)

1. **Concept-id governance:** mint LingoLinq's own concept-id namespace (new `concept_id` table/key,
   seeded from the current English core list). Store optional `external_refs` (wikidata_sense,
   cili_synset) per concept for future interop, never a dependency.
2. **Arabic:** ship MSA-only in v1. No dialect layer yet.
3. **V1 locales (6):** es (upgrade from minimal), fr, pt, de, ar (MSA), fi.
   Finnish is the agglutinative/generative-engine stress test; Arabic is the templatic/RTL/
   gender-agreement stress test, both real v1 languages, not just proofs.
4. **Slot-layout SLP review:** mixed. Get real SLP review for locales where a reviewer is available
   (es, given install base); ship draft/provisional defaults elsewhere (fi, ar) and flag them
   in-product as provisional pending review, then iterate from real supervisor/student usage.
5. **Dataset authoring:** hand-author every language's `words-*.json`/`rules-*.json`. UniMorph and
   Wiktionary are reference/QA aids only, never copied or transformed into shipped data. This avoids
   any CC BY-SA ShareAlike obligation (UniMorph is CC BY-SA 3.0 per-language; OpenAAC files are CC BY;
   ShareAlike is one-directional and would otherwise force the derived file, at minimum, under CC BY-SA).

## Phase breakdown

### Phase 1 - EN schema-2 migration (must land first, per design doc Section 7)
Generate `rules-en.json` / `words-en.json` schema-2 from the current dataset plus `i18n.js` helper
logic. Every legacy inflection name (`simple_past`, `plural`, etc) becomes a valid alias resolving to
a UD feature bundle. Existing button `inflections`, `inflection_defaults` (restamped via `v` bump),
board translations, and the long-press overlay must behave **identically** for existing EN boards.
**Gate:** parity proven against all 195 existing `tests[]` fixtures before anything else touches the
hardcoded English fallbacks. Ship behind `multilingual_grammar` feature flag; EN unchanged by default
when flag is off. Hardcoded fallbacks (`word_data.rb:797,940` backend grid; `i18n.js` `grid_for`
helpers) are **not** removed in this phase, they stay as the disabled-flag fallback.

### Phase 2 - Concept-id + vocab-set layer (still EN-only)
Stand up the new `concept_id` namespace and migrate `lib/core_lists.json` / `lib/fringe_suggestions.json`
into the new concept-keyed `vocab-en.json` format (design doc Section 4.6). Prove `WordData.assert_priority`
and existing core/fringe behavior are unchanged when reading through the new schema. This is the layer
every later locale's core vocabulary transfer depends on, so it lands before any non-English locale work.

### Phase 3 - Spanish upgrade (es)
First non-English, first fusional language with real gender + adjective agreement. Hand-author full
paradigm/lexicon/agreement data (upgrading from the existing minimal ES set). Validates the paradigm
+ agreement + slot-layout architecture beyond English's degenerate (no-gender, no-case) case. Real SLP
review for slot-layout defaults happens here (per decision 4).

### Phase 4 - French + Portuguese (fr, pt)
Second and third fusional languages, reusing es's paradigm/agreement patterns. Validates that the
templates generalize across Romance languages without per-language special-casing, and that core-vocabulary
concept transfer works across 3 non-English locales simultaneously (es/fr/pt sharing concept ids).

### Phase 5 - German (de)
Adds a real case system (nominative/accusative/dative/genitive) on top of gender, plus adjective-ending
agreement that varies by case+gender+definiteness combined. Proves case+gender interaction and slot
paging for a 4-case fusional language, ahead of Finnish's much larger case inventory.

### Phase 6 - Finnish (fi): generative-engine stress test
14-15 grammatical cases (slot paging, design doc Section 4.5), consonant gradation interacting with
vowel harmony (ordered phonology rules must compose, Section 4.3), possessive suffixes stacking after
case. This phase is the real test of "generate, don't enumerate": if the archiphoneme/phonology-rule
machinery holds up here, it holds for Turkish/Hungarian/Swahili's ordered-slot needs in a later milestone.

### Phase 7 - Arabic (ar, MSA): templatic-engine stress test
Root-and-pattern (`template` op) morphology, RTL script support end-to-end (frontend rendering,
long-press overlay mirroring, board editor), dual number, verb-subject gender agreement. First and
only locale exercising the templatic typology group in v1. MSA-only, no dialect layer (decision 2).

### Phase 8 - Code-switching (design doc Section 4.8)
Per-token locale tracking in the utterance (today's session-global label/vocalization locale pair
becomes per-token), user language profile (`primary`/`secondary` roles), agreement rules scoped to
same-locale spans only, per-token TTS voice switching. Sequenced after Phase 7 because it needs at
least 3+ live non-English locales (es/fr/pt/de/fi/ar) to be worth validating cross-locale behavior
against.

### Phase 9 - Retire hardcoded English fallbacks
Remove the backend `inflection_locations_for` fallback grid (`word_data.rb:797,940`) and the frontend
`i18n.js` grammar helpers' role as runtime fallback (they may survive as the *generator* of the English
dataset per design doc Section 3, just not as a live code-path fallback). Gate: golden-form test corpus
exists for every v1 typology group (fusional via es/fr/pt/de, agglutinative via fi, templatic via ar),
not just EN parity. The design doc's "retire last" instruction is stronger than EN parity alone once
multiple typologies are live, since that's the only way to confirm the abstraction genuinely
generalized rather than being an EN-shaped default no one else exercises.

## Provisional / deferred (not in this roadmap)

- Turkish, Hungarian, Swahili, Japanese, Korean, Mandarin/Cantonese/Vietnamese/Thai, Hebrew, and the
  remaining ~18 languages from the original 30-language target: next milestone, after v1 (6 locales)
  ships and the engine is proven.
- Word-order transformation (SOV/VSO reordering), semantic disambiguation beyond declared pos/concept,
  derivational morphology, dialect/register variation beyond MSA, sign languages: all explicitly out
  of scope per design doc Section 6, unchanged by this roadmap.
- Arabic dialect strategy: revisit once there's a concrete per-dialect or MSA-plus-overlay proposal.

## Next steps

1. Confirm GSD is initialized in the repo (`.planning/` did not exist as of this roadmap; run the
   `lingolinq-aac` gsd_init_cmd with `--minimal` if not already done elsewhere).
2. Run `/pre-execute-check` on the Phase 1 approach (EN schema-2 migration) before formal planning,
   mandatory for bucket B non-trivial changes.
3. `gsd-new-project` (or `gsd-discuss-phase 1` if a project shell already exists) to turn Phase 1 above
   into a real PLAN.md with task breakdown, using this roadmap plus the design doc as CONTEXT.
4. `/adversary-review` on the Phase 1 plan before execution. Critical/High findings block.
5. Dual-reviewer pass (`/review-pr` + `/adversary-review`) before merging Phase 1, per the standard
   bucket-B / ship workflow.
6. PR #522 itself should get its own review/merge resolved independently. It does not block starting
   Phase 1 work (this roadmap can proceed on the design as drafted), but staging should have the
   design doc merged before Phase 1's PR lands, for a clean paper trail.

## Phase status tracker

| Phase | Status | Notes |
|---|---|---|
| 1. EN schema-2 migration | Not started | Blocks all subsequent phases |
| 2. Concept-id + vocab-set layer | Not started | |
| 3. Spanish (es) upgrade | Not started | SLP review happens here |
| 4. French + Portuguese (fr, pt) | Not started | |
| 5. German (de) | Not started | |
| 6. Finnish (fi) | Not started | Generative-engine stress test |
| 7. Arabic (ar, MSA) | Not started | Templatic-engine stress test |
| 8. Code-switching | Not started | |
| 9. Retire hardcoded EN fallbacks | Not started | Gated on all v1 typologies proven |
