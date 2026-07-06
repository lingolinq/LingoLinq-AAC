# Multilingual Language Layer — Data Schema Design

**Status:** DESIGN ONLY — no implementation yet. Reviewed schema decisions for expanding
LingoLinq's OpenAAC-inflections-based language model from English(+minimal Spanish) to ~30
languages.

**Audience:** engineering + SLP product stakeholders.
**Companion log:** `docs/task-management/2026-07-03-multilingual-inflection-schema.md`

---

## 1. Goal

Build one language layer that supports:

1. Morphological inflection (verb conjugation, noun declension, adjective agreement)
2. Grammatical gender and case systems
3. Core vs fringe vocabulary distinction
4. Symbol-to-word mapping with grammatical context
5. Code-switching for multilingual students

across 30 target languages spanning four typology groups:

| Type | Languages |
|------|-----------|
| Fusional | Spanish, French, Portuguese, Italian, German, Russian, Polish, Ukrainian, Greek |
| Agglutinative | Finnish, Turkish, Hungarian, Swahili, Japanese, Korean |
| Isolating | Mandarin, Cantonese, Vietnamese, Thai |
| Mixed/other | Arabic, Hebrew, Hindi, Farsi, Indonesian, Tagalog, Dutch, Swedish, Norwegian, Danish |

**The central decision: extend the OpenAAC words/rules standard LingoLinq already
implements — do not build a parallel language system.** Every proposed structure below is
a backward-compatible superset of the existing `words-{locale}.json` / `rules-{locale}.json`
format (tools.openaac.org/inflections), so English boards keep working untouched and new
languages can be contributed back upstream to OpenAAC.

---

## 2. Current state (what we're extending)

LingoLinq already has a working, if English-shaped, pipeline:

### Datasets (OpenAAC standard)
- `words-{locale}.json` (`_type: 'words'`): flat word list with parts of speech
  (`types`), per-word `inflection_overrides`, antonyms. Only **EN (full)** and
  **ES (minimal)** exist upstream today.
- `rules-{locale}.json` (`_type: 'rules'`): four sections —
  - `rules[]`: **lookback rules**. Each has `id`, `type` (`override` | pos name),
    `lookback[]` (a right-to-left pattern over the utterance history:
    `{words: [...]}` or `{type: 'pronoun'}`, with `optional`, `match`/`non_match`
    regex, `condense`), and either `overrides: {surface → replacement}` or
    `inflection` + `location`. This drives *automatic* inflection from sentence
    context ("have you" + "look" → "have you looked").
  - `inflection_locations`: per part-of-speech mapping of **compass slots**
    (`c,n,s,e,w,ne,nw,se,sw`) to inflection names (`plural`, `possessive`,
    `past`, `present_participle`, `comparative`, `antonym`, …) with `required`,
    `if_empty`, `override_if_same` modifiers. This drives the long-press 3×3
    overlay grid.
  - `substitutions`: `contractions` / `default_contractions` maps.
  - `tests[]`: `[prior, word, expected, {rule_id}]` fixtures (195 for EN).

### Storage & runtime
- **Backend** `WordData` (one row per word+locale; secure-serialized `data` blob
  — `app/models/word_data.rb:12` — holding `word`, `locale`, `types[]`,
  `inflection_overrides{}`, `antonyms[]`, `reviews`).
  `WordData.ingest(url)` (`word_data.rb:74`) loads `words` files into rows and
  `rules` files into `Setting` records keyed `rules/#{locale}`
  (`word_data.rb:751`).
  `WordData.inflection_locations_for(words, locale)` (`word_data.rb:728`) merges
  Setting rules with per-word overrides — **with a hardcoded English fallback
  grid** when a locale has no rules (`locale.match(/^en/i)` branches at
  `word_data.rb:797,940`). Dataset version: `INFLECTIONS_VERSION = 2`
  (`word_data.rb:6`).
- **Board stamping**: `Board#check_for_parts_of_speech_and_inflections`
  (`app/models/board.rb:2040`) writes `inflection_defaults` (skipped when the
  version key `v` already matches, `board.rb:2048`) onto each button and its
  translations (`board.rb:2089`); manual per-button `inflections` (compass-slot
  array, editable in button settings) win over defaults.
- **Frontend**: `edit_manager.js` `long_press_mode`/`grid_for`/`overlay_grid`
  (`edit_manager.js:100,661`) render the long-press 3×3 grid (see
  `docs/INFLECTIONS_LONG_PRESS_OVERLAY.md`);
  `Board.contextualized_buttons` (`app/frontend/app/models/board.js:568`) +
  `editManager.inflection_for_types` (`edit_manager.js:267`) apply lookback
  rules against utterance history for auto-inflection, reading per-locale rules
  from `i18n.lang_overrides` (`edit_manager.js:278`); `i18n.js` helpers
  (`pluralize` `:123`, `tense` `:170`, `verb_negation` `:348`, …) are
  **hardcoded English morphology** used as last-resort fallback, with
  `lang_overrides` loaded per locale from the API and cached
  (`i18n.js:470-494`); utterance contractions also read `lang_overrides` with
  English `substitutions` as fallback (`utterance.js:104,708`).
- **Translations**: boards carry `settings['translations']` — button_id → locale
  → `{label, vocalization, inflections?, inflection_defaults?}`; runtime locale
  is the pair (`label_locale`, `vocalization_locale`) in app_state/stashes.
  Supervisors modeling for a student inherit the student's `preferred.locale`.
- **Core/fringe**: `lib/core_lists.json` and `lib/fringe_suggestions.json`,
  loaded by `WordData.core_lists`/`.fringe_lists` (`word_data.rb:1112,1123`) and
  filtered per locale; per-user core list overlays exist.
- **Prediction**: `word_suggestions.js` — locale-aware lookup, but the local
  ngram corpus is English-only (see LEARNINGS: "Word prediction locale has
  three layers").

### The gaps this design closes
1. Inflection names (`simple_past`, `possessive`) and the fallback grid are
   **English category names hardcoded in two places** (backend fallback +
   `i18n.js`). Other languages have categories English lacks (case, gender,
   politeness, noun class, aspect) and lack categories English has.
2. `words` entries are **surface-form-keyed with enumerated overrides** — fine
   for English's ~5 forms per verb, unusable for Finnish (~2000 forms/noun
   paradigm) or Turkish (unbounded agglutination). Forms must be *generated*,
   not enumerated.
3. **No agreement model.** English lookback rules fake agreement with word
   lists ("he/she/it" → `simple_present`). Gendered/cased languages need
   declarative feature agreement (adjective copies gender+number+case from its
   noun), not per-word lookback tables.
4. **No concept identity across languages.** Core vocabulary transfer ("want" =
   "querer" = "haluta") is implicit via board translations, not modeled.
5. **9 grid slots** cannot host 15 Finnish cases or Arabic person×gender×number.
6. **One locale pair per session.** Code-switchers need per-token locale.

---

## 3. Design principles

- **Superset, not fork, of OpenAAC format.** New keys are additive; a `_schema: 2`
  marker distinguishes extended files; v1 consumers ignore unknown keys. We keep
  the `ext_` prefix convention (as in OBF) for LingoLinq-specific extensions so
  files remain upstream-contributable.
- **Data over code.** Everything currently hardcoded for English (fallback grid,
  morphology helpers, contraction tables) becomes per-locale data. The engine
  becomes language-neutral; `i18n.js` English helpers survive only as the
  generator of the English dataset's regular forms.
- **Features, not English labels.** Grammatical categories use Universal
  Dependencies (UD) feature notation (`Tense=Past`, `Case=Ine`, `Gender=Fem`,
  `Number=Dual`, `Polite=Form`) — a documented ISO-adjacent standard with
  values already defined for all 30 target languages. Legacy OpenAAC names
  (`simple_past`, `plural`, …) remain valid as per-locale **aliases** to feature
  bundles.
- **Generate regular forms, enumerate irregular ones.** Paradigm templates +
  morphophonological rules generate forms client-side; irregulars are explicit
  in the lexicon and always win.
- **Offline-first.** All datasets are static JSON, downloadable and cacheable via
  the existing `persistence.store_json` path. Inflection runs client-side; the
  backend `inflection_defaults` stamping remains as precomputation.
- **SLP-configurable, per student.** Language settings live on the user record,
  editable by supervisors, same as today's `preferred.locale`.

---

## 4. The schema

Per locale, four dataset layers (three files — the profile rides in the rules file):

```
rules-{locale}.json   (_schema: 2)  = language profile + paradigms + agreement
                                      + lookback rules + slot layouts + substitutions + tests
words-{locale}.json   (_schema: 2)  = lexicon (lemma-keyed, paradigm refs, concept links)
vocab-{locale}.json   (new)         = core/fringe vocabulary sets (concept-keyed)
```

### 4.1 Language profile (`rules-*.json → "profile"`)

Typology metadata the engine and UI branch on — replaces every `locale.match(/^en/)`
in code.

```jsonc
"profile": {
  "locale": "fi",
  "morphology": "agglutinative",        // fusional | agglutinative | isolating | templatic | mixed
  "script": {"code": "Latn", "rtl": false, "spaces": true},
  "features": {                          // which UD features this language uses, and their values
    "Case":   ["Nom","Gen","Par","Ine","Ela","Ill","Ade","Abl","All","Ess","Tra","Abe","Com","Ins"],
    "Number": ["Sing","Plur"],
    "Person": ["1","2","3"],
    "Tense":  ["Pres","Past"],
    "Voice":  ["Act","Pass"]
    // es: adds Gender:[Masc,Fem], Mood:[Ind,Sub,Imp]; ar: Number adds Dual; ja: Polite:[Infm,Form]; sw: NounClass:[1..18]
  },
  "inherent_features": {"noun": ["Gender"], "pronoun": ["Person","Number","Gender"]},
  "utterance": {
    "contractions_apply": true,          // en; false for most others
    "tokenizer": "space"                 // space | none (ja/zh/th) | custom id
  }
}
```

Isolating languages (Mandarin, Cantonese, Vietnamese, Thai) get a near-empty
`features` block — their "inflection" surface is particles/classifiers handled as
lexicon entries and lookback rules, which the existing engine already does well.

### 4.2 Lexicon (`words-{locale}.json`, schema 2)

From form-keyed words to **lemma-keyed lexemes**:

```jsonc
{
  "_locale": "es", "_schema": 2, "_type": "words",
  "words": [
    {
      "lemma": "comer",
      "pos": "verb",
      "concept": "eat",                  // cross-language concept id (see 4.5)
      "paradigm": "v_er",                // conjugation/declension class → rules file
      "features": {},                    // inherent features (none for this verb)
      "forms": {                         // ONLY irregulars/suppletives; regulars are generated
        "Tense=Past|Person=1|Number=Sing": "comí"
      },
      "aliases": {"past": "Tense=Past|Person=1|Number=Sing"},  // legacy OpenAAC names
      "antonyms": []
    },
    {
      "lemma": "casa", "pos": "noun", "concept": "house",
      "paradigm": "n_a",
      "features": {"Gender": "Fem"}      // inherent gender drives agreement
    }
  ]
}
```

Notes:
- **Back-compat:** schema-1 entries (`word` + `types` + `inflection_overrides`)
  remain readable; the ingester treats `word` as `lemma` and overrides as `forms`
  keyed by alias names.
- **Surface-form index:** ingestion also writes each distinct generated/enumerated
  form as a lookup row (needed for lookback matching over spoken history —
  matching "comió" must find lexeme "comer"). This mirrors how `WordData` is
  already form-keyed.
- **Homographs:** repeated `lemma` with different `pos`/`concept` is allowed
  (as today via `types[]`); disambiguation order = button's declared
  `part_of_speech` first, then dataset order.

### 4.3 Morphology: paradigms + morphophonology (`rules-*.json → "paradigms"`)

The generative layer. A paradigm is an ordered slot template; each slot maps a
feature to an affix operation. Operations cover all four typology groups:

```jsonc
"paradigms": {
  "v_er": {                              // Spanish -er verbs (fusional: fused endings)
    "pos": "verb",
    "stem": {"strip": "er$"},
    "exponents": [                       // fusional: one exponent realizes a feature BUNDLE
      {"features": "Tense=Pres|Person=1|Number=Sing", "op": {"suffix": "o"}},
      {"features": "Tense=Pres|Person=3|Number=Sing", "op": {"suffix": "e"}},
      {"features": "VerbForm=Ger",                    "op": {"suffix": "iendo"}}
    ]
  },
  "n_talo": {                            // Finnish noun (agglutinative: ordered slots)
    "pos": "noun",
    "slots": [                           // slot order is the morpheme order
      {"feature": "Number", "ops": {"Plur": {"suffix": "i"}}},
      {"feature": "Case",   "ops": {"Ine": {"suffix": "ssA"}, "Ela": {"suffix": "stA"},
                                     "Ill": {"suffix": "Vn"}, "Ade": {"suffix": "llA"}}}
    ]
  },
  "v_katab": {                           // Arabic (templatic: root-and-pattern)
    "pos": "verb",
    "root": true,                        // lemma is a consonantal root, e.g. "k-t-b"
    "exponents": [
      {"features": "Tense=Past|Person=3|Gender=Masc|Number=Sing", "op": {"template": "C1aC2aC3a"}},
      {"features": "Tense=Pres|Person=3|Gender=Masc|Number=Sing", "op": {"template": "yaC1C2uC3u"}}
    ]
  }
},
"phonology": [                           // ordered rewrite rules applied after affixation
  {"id": "vowel_harmony", "map": {"A": {"back": "a", "front": "ä"}, "V": "copy_last_vowel"}},
  {"id": "consonant_gradation", "when": "closed_syllable", "map": {"kk": "k", "pp": "p", "tt": "t"}}
]
```

Operation vocabulary: `suffix`, `prefix`, `infix`, `circumfix`, `stem_change`
(regex replace), `template` (templatic C1/C2/C3 patterns), `reduplicate`
(Indonesian/Tagalog plural & aspect), plus archiphonemes (capital letters like
`A`, `V` above) resolved by the `phonology` rules — this is the standard
two-level-morphology trick that makes Turkish/Finnish/Hungarian vowel harmony a
data problem instead of a code problem.

**Sanity bound:** the engine only ever *generates the forms a slot layout or
agreement request asks for* — it never eagerly expands a paradigm. Turkish's
theoretically unbounded forms are therefore never materialized.

### 4.4 Agreement (`rules-*.json → "agreement"`)

The piece English never needed and lookback word-lists can't express.
Declarative feature-copying between an utterance's tokens:

```jsonc
"agreement": [
  { "id": "adj_noun",                    // Spanish: adjective agrees with its noun
    "dependent": {"pos": "adjective"},
    "governor":  {"pos": "noun", "relation": "nearest_left"},   // or nearest_right (fr postposed)
    "copy": ["Gender", "Number"] },
  { "id": "verb_subject",                // verb agrees with subject pronoun/noun
    "dependent": {"pos": "verb"},
    "governor":  {"pos": ["pronoun","noun"], "relation": "subject_left"},
    "copy": ["Person", "Number"] },     // + Gender for ar/he/ru-past; + NounClass for sw
  { "id": "case_after_preposition",      // German/Russian/Polish: preposition governs case
    "dependent": {"pos": ["noun","pronoun","adjective"]},
    "governor":  {"pos": "preposition", "relation": "nearest_left"},
    "assign": {"Case": {"from_governor_property": "governs_case"}} }  // lexeme property
]
```

Agreement rules run inside the existing auto-inflection hook
(`contextualized_buttons`/`inflection_for_types`): when a button is about to be
rendered or spoken, the engine resolves its governor in the utterance history,
copies/assigns features, and asks the paradigm layer for that form. The existing
`rules[]` lookback engine **stays** — it handles idiomatic overrides and
isolating-language particle logic that agreement can't — and gains one addition:
lookback tokens may match on features (`{"type": "noun", "features": {"Gender": "Fem"}}`)
instead of only surface regexes.

### 4.5 Slot layouts: the compass grid, generalized (`rules-*.json → "slot_layouts"`)

Today's `inflection_locations` (8 compass slots + center per pos) is kept as the
**primary page**, but slots map to feature bundles and layouts can page:

```jsonc
"slot_layouts": {
  "noun": [
    {"page": 1, "slots": {
      "c": "base", "n": "Number=Plur", "s": "Case=Gen",
      "w": "Case=Par", "e": "Case=Ill", "ne": "Case=Ine",
      "nw": "Case=Ade", "sw": "Case=Ela", "se": {"more": 2}   // slot opens page 2
    }},
    {"page": 2, "slots": {"c": "base", "n": "Case=Ess", "ne": "Case=Tra", "e": "Case=Abl", "...": "..."}}
  ]
}
```

- English's layout is byte-identical in behavior to today's (aliases resolve
  `plural` → `Number=Plur`, etc.), so the long-press overlay, swipe-to-inflect,
  and button-settings editor don't change for existing users.
- SLPs choose which page-1 slots matter per student (a case-picker for a Finnish
  7-year-old is a curriculum decision, not an engineering one) — layout ids can
  be overridden per user in preferences.
- Per-button manual `inflections` keep absolute priority over generated forms,
  exactly as today.

### 4.6 Vocabulary sets: core vs fringe (`vocab-{locale}.json`)

Normalizes `lib/core_lists.json` / `lib/fringe_suggestions.json` into
**concept-keyed**, per-locale sets:

```jsonc
{
  "_locale": "es", "_schema": 2, "_type": "vocab",
  "sets": [
    {"id": "core_es_v1", "category": "core",
     "concepts": ["i", "you", "want", "go", "eat", "more", "stop", "help"],
     "surface": {"want": "querer", "eat": "comer"}},          // realization when board lacks one
    {"id": "fringe_food_es_mx", "category": "fringe", "region": "MX",
     "concepts": ["tortilla", "agua_fresca"]}
  ]
}
```

- **Concept ids** are language-neutral keys (namespaced, seeded from the English
  core list + OpenSymbols/board-set concept usage). Core vocabulary transfers
  across languages by concept identity; fringe sets are language/culture/region
  specific by design.
- Per-student focus-word lists and the existing AI focus-word library reference
  concept ids and resolve surface forms through the active locale's lexicon.
- Priority scoring (`WordData.assert_priority`) reads these sets instead of the
  two JSON files, unchanged in spirit.

### 4.7 Symbol-to-word mapping with grammatical context

Button/board layer changes (all additive):

- A button's per-locale entry in the board `translations` hash gains optional
  `pos`, `features`, and `concept`:
  `translations[button_id][locale] = {label, vocalization, pos, features, inflections, inflection_defaults}`.
  The symbol stays constant; the realization per locale carries its own grammar.
- `inflection_defaults` stamping (`check_for_parts_of_speech_and_inflections`)
  becomes locale-aware: for each locale in the board's translations, resolve the
  lexeme, generate the slot-layout page-1 forms, stamp under that locale. The
  existing `v` version key triggers restamps when datasets update.
- Selection-time context: the utterance already tracks history for lookback
  rules; it additionally tracks a small **feature state** (last selected tense
  toggle, subject person/number/gender/class from the last subject token) that
  agreement rules consume. "eat" → "eating"/"ate" by tense selection is then the
  same mechanism in every language: the tense control sets `Tense=...` in
  feature state; the verb realizes it through its paradigm.

### 4.8 Code-switching

- **User language profile** (user settings, supervisor-editable — extends
  `preferred.locale`):

```jsonc
"languages": {
  "profiles": [
    {"locale": "es", "role": "primary",   "voice_id": "...", "symbol_variant": null},
    {"locale": "en", "role": "secondary", "voice_id": "..."}
  ],
  "code_switching": {"enabled": true, "utterance_mixing": true}
}
```

- **Per-token locale in the utterance.** Every token added to the sentence box
  records the locale it was realized in (today the pair label/vocalization
  locale is session-global). TTS switches voices per token run; grammar rules
  only apply *within* a same-locale span — a Spanish adjective never tries to
  agree with an English noun (matches how bilingual speakers actually
  code-switch, and avoids cross-language false inflections).
- **Per-board and per-button locale.** A linked board may declare a different
  primary locale (home board Spanish, school-topic board English); a single
  button may pin `locale` explicitly (loanwords, names). Resolution order:
  button pin → board locale → user primary.
- Prediction follows the LEARNINGS three-layer rule: suggestions are sourced
  from the active token locale first; concept-level prediction (next likely
  *concept*, realized in the active locale) is the extension point that makes
  prediction language-neutral.

### 4.9 Storage mapping (no new tables required for v1)

| Data | Home | Notes |
|------|------|-------|
| Language profile + paradigms + agreement + slot layouts + lookback rules | `Setting["rules/#{locale}"]` | existing ingest path (`WordData.ingest`, `_type:'rules'`), blob grows schema-2 keys |
| Lexicon | `WordData` rows (word+locale) | lemma rows + generated-form index rows; `data` blob gains `lemma`, `paradigm`, `features`, `forms`, `concept`, `aliases` |
| Vocab sets | `Setting["vocab/#{locale}"]` (new key family) | replaces the two static lib JSON files at read time |
| Per-button grammar | board `settings['translations']` + button `inflections`/`inflection_defaults` | additive keys only |
| Student language profile | user `settings['preferences']['languages']` | supervisor-editable like `preferred.locale` |
| Frontend cache | `persistence.store_json` of the three datasets per active locale | offline-first; same path as today's `lang_overrides` |

Datasets are versioned (`_version`); the button `inflection_defaults.v` bump and
the frontend cache key both derive from it. `reviews` on `WordData` already
supports the human-review workflow contributed datasets need.

---

## 5. The 5 languages needing the most special handling

1. **Arabic** — the only *templatic* group member: root-and-pattern morphology
   (`template` op type is justified almost solely by Arabic/Hebrew), dual
   number, verb–subject **gender** agreement, RTL script, and the unresolved
   product question of MSA vs dialect (an MSA dataset is learnable in school
   contexts but is nobody's home language). Hebrew shares the machinery but has
   a smaller feature space.
2. **Finnish** — 14–15 cases (slot paging is driven by Finnish), consonant
   gradation *interacting* with vowel harmony (ordered phonology rules must
   compose), possessive suffixes stacking after case. The stress test for the
   generate-don't-enumerate rule.
3. **Swahili** — 15+ noun classes where the class of the noun drives agreement
   prefixes on *everything* (adjectives, verbs, demonstratives, numerals), and
   verbs carry subject + object + tense as ordered **prefixes**. Validates that
   slots/agreement aren't suffix-biased and that `NounClass` works as an
   agreement feature end to end.
4. **Japanese** — no word boundaries (tokenizer profile), politeness as a
   *feature dimension* (`Polite=Infm|Form` on every verb/adjective — an axis no
   European language exercises), counters/classifiers for numerals, and SOV
   order that makes English-ordered symbol selection produce unnatural output
   (word-order transformation is explicitly deferred — see §6). Korean shares
   the honorific + agglutination profile.
5. **Russian** — representative hard fusional: 6 cases × 3 genders × animacy
   fused into single endings, **verbal aspect pairs** (perfective/imperfective
   are distinct lemmas needing a lexeme-to-lexeme `aspect_pair` link — a lexicon
   relation, not an inflection), and numeral government (2–4 → genitive
   singular, 5+ → genitive plural) which stretches `assign`-type agreement
   rules. Polish/Ukrainian ride on the same machinery.

(Turkish and Hungarian are individually hard but are covered by the same
archiphoneme + ordered-slot machinery Finnish forces; German's case system is a
mild subset of Russian's.)

---

## 6. What this schema does NOT handle (deferred, explicitly)

1. **Word-order transformation.** Symbols are spoken in selection order. SOV/VSO
   languages (Japanese, Korean, Hindi, Arabic VSO) will get correctly *inflected*
   words in possibly unnatural *order*. Reordering is a sentence-level NLG
   problem; defer (research: optional "polish utterance" step, possibly
   AI-assisted with the existing AI-feature legal review gate).
2. **Semantic disambiguation.** One symbol ↔ multiple lemmas (bank/banco) is
   resolved only by declared button pos/concept, not by context.
3. **Derivational morphology.** Only inflection; no productive word formation
   (German/Dutch compounding, Indonesian derivational voice system beyond what
   paradigms encode).
4. **Dialect/register variation** beyond one register axis (`Polite`). Arabic
   dialects, Cantonese written-vs-spoken divergence, Norwegian bokmål/nynorsk
   are separate *locale datasets*, not features.
5. **TTS/voice quality per language** — external dependency; the schema only
   guarantees per-token voice routing.
6. **Automatic translation quality.** The schema stores human-reviewable data
   (`reviews` workflow); it does not make machine-translated board content
   grammatical by itself.
7. **Sign languages / non-written languages** — out of scope for a text
   realization layer.
8. **Full syntax checking.** The engine realizes forms; it does not reject
   ungrammatical selections — AAC users must never be blocked by grammar.

---

## 7. Migration & compatibility

- English: generate `words-en.json`/`rules-en.json` schema-2 from the current
  dataset + `i18n.js` helper logic; aliases keep every existing inflection name
  valid. Existing button `inflections`, `inflection_defaults` (restamped via
  `v` bump), board translations, and the long-press overlay behave identically.
- The two hardcoded English fallbacks (backend `inflection_locations_for`
  fallback grid; frontend `i18n.js` grammar helpers in `grid_for`) are retired
  *last*, after the EN schema-2 dataset ships and parity is proven against the
  195 existing `tests[]` fixtures plus a new golden-form test corpus per
  language (`tests` section extends to `[features_request, lemma, expected]`
  triples).
- Rollout per CLAUDE.md: behind a feature flag (e.g. `multilingual_grammar`),
  per-locale enablement, EN unchanged by default.

## 8. Open questions (need product/SLP input)

1. Concept-id governance: adopt/extend an existing vocabulary (OpenSymbols
   concept keys?) vs minting our own namespace — affects upstream contribution.
2. Arabic: MSA-only v1, or block Arabic until a dialect decision?
3. Which locales are v1? Proposal: es (upgrade the minimal set), fr, pt, de +
   one stress-test language per group (fi, sw or tr, ja, ar) to prove the
   engine before the long tail.
4. Slot-layout defaults per language: needs SLP review, not just linguist review
   (which cases/forms matter for emergent communicators in each language).
5. Dataset authoring pipeline: hand-authored vs bootstrapped from UniMorph/
   Wiktionary extracts with human review (license check required: UniMorph is
   CC BY-SA per language source; OpenAAC files are CC BY).
