# Multilingual Language Layer - Tooling & Contribution Roadmap

**Status:** Decisions locked 2026-07-04. Companion to `MULTILINGUAL_LANGUAGE_LAYER_SCHEMA.md`
and `MULTILINGUAL_LANGUAGE_LAYER_ROADMAP.md`. Covers the AI-dev tooling, open-source
linguistic resources, and the human-review/contribution platform for the 30-language
expansion.

The work splits into three tracks that run partly in parallel:

- **Track A - Generate.** AI produces schema-2 datasets (profiles, lexicons,
  paradigms, agreement, vocab) per language, grounded in open linguistic data.
- **Track B - Review.** Native speakers / university teams verify generated
  entries asynchronously; verified data supersedes generated data in-app.
- **Track C - Integrate.** LingoLinq ingests, serves, and inflects with the data
  (the schema doc covers this track).

Model note: Track A generation and Track B platform build are mostly Sonnet/Opus
work; reserve Fable 5 for the genuinely hard, high-blast-radius pieces - the
client-side morphology engine internals, the English-parity migration, and
reviewing the first "hard language" datasets (Arabic/Finnish/Swahili).

---

## Decisions locked (Section 6 resolved)

1. **Review platform:** Label Studio as the pilot bridge for the first 1-2
   languages (es, fi) to prove the queue/consensus workflow cheaply and gather real
   reviewer feedback fast; the purpose-built Rails+Hotwire app is the durable
   target, built in parallel. Both write the same `WordData.verification` shape via
   one API, so migrating reviewers off Label Studio later is invisible to the data.
2. **Consensus threshold:** fixed at 2 independent approvals for every language, no
   per-language scaling. Simple to implement and explain to volunteers.
3. **Contributor licensing/CLA:** reviewers sign a lightweight CLA at first login,
   separate from the dataset-licensing question (already resolved in the schema
   roadmap's decision 5: hand-authored data, UniMorph/Wiktionary reference only,
   never copied/transformed). The CLA protects LingoLinq's clear ownership of the
   reviewed dataset and avoids ambiguity if a reviewer's edited form is later
   disputed or reused.
4. **Where the review app lives:** a separate GCP service, matching LingoLinq's
   in-flight Render-to-GCP migration rather than adding a new Render service.
5. **Recruiting/coordination:** defer external recruiting for v1. Language leads
   for the 6 v1 locales (es/fr/pt/de/ar/fi) come from existing SLP/dev
   relationships and Scot's AAC-industry network. Design the open recruiting/CLA/
   credit process for outside contributors only once external contribution is
   actually needed for the post-v1 long tail of languages.

---

## 1. The contribution & review platform (Track B)

The original plan had academics author lists via forms/spreadsheets. Now the AI
authors them and humans **review**. That is a fundamentally different UX: a
**queue-based annotation/verification workflow**, not a data-entry form. Design
it as such.

### 1.1 Data model - extend, don't add tables

`WordData` already carries a `reviews` field. That is the anchor. Add a
per-entry verification state machine rather than a language-level flag, so many
people can work one language at once at entry granularity:

```jsonc
// WordData.data.verification (per word+locale; also per paradigm in Setting rules)
{
  "status": "generated",        // generated -> in_review -> verified | needs_fix | disputed
  "confidence": 0.0-1.0,        // model self-rated + heuristic (gold-data agreement)
  "reviews": [
    {"reviewer_id": "...", "affiliation": "Univ. of X", "verdict": "approve|fix|flag",
     "edited_forms": {...}, "note": "...", "at": "..."}
  ],
  "consensus": {"approvals": 2, "required": 2, "verified_at": "..."},
  "source_citations": ["unimorph:fi", "wiktionary:fi:talo", "cldr:plural"]
}
```

Rules:
- **Ship generated data immediately, flagged.** In-app, unverified inflections
  surface with a subtle "auto-generated, unverified" badge on the long-press
  grid / button settings; verified entries lose the badge. Never block an AAC
  user on verification status.
- **Verified overrides generated.** A reviewer's `edited_forms` become the
  authoritative form; the generated form is retained for audit/rollback.
- **Concurrent reviewers, entry-level claiming.** No language-level lock. A
  reviewer claims a *batch* of N entries (soft lease, auto-expires) so two people
  don't review the same 10 at once, but the whole language stays open.
- **Consensus, not single-approver.** 2 independent approvals -> `verified`
  (decision 2); a `fix` with edits resets the count and re-queues. Disagreement ->
  `disputed`, routed to a language lead. This gives quality without a bottleneck.
- **Attribution + gamification.** Track contributor + affiliation; a per-language
  leaderboard and "X% verified" progress bar are the cheapest motivation levers
  for volunteer academics. Export credits for citations/acknowledgements.

### 1.2 Build approach

The data is **structured** (paradigm grids, feature bundles, agreement rules),
so generic string-review tools (Weblate, Pontoon, Crowdin, Tolgee) don't fit
cleanly even though the async-multi-reviewer workflow is exactly theirs - borrow
their UX, not their schema. Three real options were weighed:

| Option | Fit | Verdict |
|--------|-----|---------|
| **Label Studio** (open-source, self-host) | Built for multi-annotator review of AI output with per-item status, consensus, agreement metrics. Custom labeling config could host a paradigm grid. | **Chosen for the pilot** (decision 1) - lowest build cost, fastest path to real reviewer feedback. |
| **Purpose-built micro-app** (Rails+Hotwire) | Full control of the grid/paradigm/agreement UI; reads/writes `WordData` directly via a new `/api/v1/review` namespace. | **Chosen as the durable target** (decision 1); it can reuse the app's Google SSO and the existing overlay-grid component. |
| **Retool / Appsmith / Budibase** (internal-tool builders) | Very fast admin UI over the API. | Good for an internal triage/lead dashboard, weak for external volunteer UX. Not used for the main review surface. |

### 1.3 Contributor UX principles

- **Queue, don't browse.** "Give me 10 verbs in Finnish to check" - one entry at
  a time, keyboard-driven, approve/fix/flag, next. Reviewing "as they have time"
  means every session must be resumable and require zero setup.
- **Show the grid, not JSON.** Render the actual 3x3 inflection overlay + a
  paradigm table (all generated forms), with the symbol/concept for context.
  Reviewer edits a cell inline; the app diffs against the generated form.
- **Cite the source.** Show where each form came from (UniMorph/Wiktionary/CLDR)
  so a reviewer can sanity-check fast and flag systematic generator errors.
- **Low-friction auth.** Google SSO (already in the app) or magic-link; external
  academics should not need a full LingoLinq account. Role = `linguist_reviewer`
  scoped to chosen locales. Signs the reviewer CLA (decision 3) at first login.
- **Batch/paradigm review > word-by-word.** Many errors are systematic (a wrong
  affix in a paradigm affects thousands of words). Let leads review *paradigms
  and rules* directly, which validates whole swaths at once, and reserve
  word-level review for irregulars/overrides.

---

## 2. AI generation pipeline (Track A)

### 2.1 Claude API features that matter here

- **Message Batches API** - 30-language x POS x paradigm generation is
  embarrassingly parallel and not latency-sensitive; batch it for ~50% cost.
- **Prompt caching** - the schema spec + language profile + few-shot exemplars
  are large and repeated across thousands of calls; cache them. This is the
  single biggest cost lever for bulk generation.
- **Structured outputs / tool use** - force paradigm/lexicon output to conform to
  the schema-2 JSON so nothing needs re-parsing; validation happens at the
  tool-call boundary and the model retries on mismatch.
- **A generation workflow** (Claude Code Workflow / Agent SDK): fan out one agent
  per (language, POS) cell, each generating a paradigm + sample lexicon, then a
  verifier stage checks every generated form against gold data (Section 3) before
  it lands. Loop-until-clean per language. This mirrors the repo's existing
  `/audit-run` fan-out pattern.

### 2.2 Grounding to fight hallucination

Never generate morphology from the model's parametric memory alone for the hard
languages. Retrieve gold forms first, then have the model *organize them into the
schema* and *fill regular-form gaps*, which is a far safer task than inventing
Finnish case endings. Sources in Section 3.

---

## 3. Open-source linguistic resources to integrate

These are the difference between a plausible-looking dataset and a correct one.

| Resource | What it gives | Use |
|----------|---------------|-----|
| **UniMorph** | Inflection tables, ~170 languages, permissive license | Primary gold paradigms; seed + validation for Track A |
| **Wiktextract / kaikki.org** | Structured Wiktionary dumps (forms, POS, gender, IPA) | Lexicon seeding + per-word form verification |
| **Unicode CLDR** | Plural rule categories, gender lists, locale metadata per language | Directly drives the `profile.features` + plural handling; authoritative |
| **Universal Dependencies** | The feature inventory (`Case=`, `Gender=`...) + treebanks | Canonical feature vocabulary (schema Section 3) + agreement-pattern mining |
| **GiellaLT / Giella (HFST)** | Finite-state morphological analyzers for many agglutinative/minority langs | Generate/verify Finnish, Sami-family, agglutinative forms - the "hard" set |
| **Apertium** | FST morphologies + bilingual dicts, 100+ pairs | Cross-check forms; some fringe-language coverage |
| **HFST / foma** | FST toolkits to *run* the above analyzers | The morphology engine's offline oracle for validation |
| **spaCy + Stanza** | POS/lemma/morphological-feature tagging, many languages | Tag utterance corpora to validate agreement rules end to end |
| **ICU / PyICU** | Unicode text, collation, bidi | RTL (Arabic/Hebrew), script handling in the client engine |
| **epitran / panphon** | Grapheme-to-phoneme + phonological features | Author/verify the `phonology` rewrite rules (vowel harmony, gradation) |

Licensing caveat: UniMorph/UD are permissive; Wiktionary is CC BY-SA (share-alike
- keep generated derivatives attributable and compatibly licensed, matching the
OpenAAC CC BY intent). Track `source_citations` per entry (Section 1.1) so
provenance and license obligations are auditable. This is reference-only use per
decision 3 in the schema roadmap; nothing from these sources is copied or
transformed directly into shipped data.

---

## 4. Claude Code dev tooling for this repo

Fit the existing `.claude/` convention (the repo already runs an audit
orchestration system with agents/skills/hooks - mirror it).

### 4.1 Subagents (`.claude/agents/`)
- **`linguist-generator`** - generates a language profile + paradigms + sample
  lexicon for one (language, POS), grounded in retrieved gold data. Write-scoped
  to dataset files only.
- **`morphology-validator`** (read-only) - runs generated forms against the
  HFST/UniMorph oracle and the schema-2 `tests[]` fixtures; emits a
  register-style pass/fail with citations. The Track A gatekeeper.
- **`review-triage`** - summarizes reviewer flags, clusters systematic errors
  ("all Finnish illative forms wrong -> paradigm bug"), and files fix tasks.

### 4.2 Skills (`.claude/skills/`)
- **`paradigm-authoring`** - the schema-2 spec + op vocabulary + worked examples
  per typology group, embedded so any agent authoring datasets is consistent.
- **`language-profile`** - checklist for filling `profile.features` from CLDR/UD
  for a new locale.

### 4.3 Workflows (`Workflow` / `.claude/workflows/`)
- **`/generate-language <locale>`** - retrieve gold data -> fan out per POS ->
  generate -> `morphology-validator` verify -> loop-until-clean -> write datasets +
  citations. One well-scoped fan-out per language.
- **`/validate-language <locale>`** - re-run all fixtures + oracle checks; used in
  CI and before promoting a language from beta.

### 4.4 MCP servers
- **Custom `morphology` MCP** - wraps HFST analyzers, UniMorph lookup, CLDR
  plural rules, and Wiktextract queries behind a few tools
  (`analyze(word,locale)`, `paradigm(lemma,locale)`, `plural_rules(locale)`).
  This is the highest-leverage custom build: it turns "generate morphology" into
  "retrieve + organize," which is what makes the output trustworthy.
- **`github` / `filesystem`** MCPs - already available; dataset file ops + PRs.
- **Hugging Face MCP** - pull tagged morphology datasets/models (UniMorph mirrors,
  spaCy/Stanza models) directly.

### 4.5 Hooks (`.claude/hooks/`)
- **Dataset validation gate** (PreToolUse / pre-commit) - reject any dataset file
  that fails schema-2 validation or whose `tests[]` don't pass, modeled on the
  existing `citation-check.rb` / `audit-readonly-guard.sh`. No unverified-shape
  data reaches a branch.

### 4.6 Loops / scheduling
- A **generation-monitor loop** (or `send_later` check-ins) to watch long Batch
  API jobs and kick the next language when one completes - no polling by hand.

### 4.7 CLIs / infra to install
- **HFST + foma** (FST runtime for validation oracle), **ICU** (text/bidi),
  **Claude CLI** batch runner, a small in-repo **`bin/validate_language`** wrapper
  around the schema validator + fixtures for CI and contributors.

---

## 5. How it connects (phased)

1. **Foundation.** Custom `morphology` MCP + `paradigm-authoring` skill + schema
   validator + `bin/validate_language`. Pick pilot locales (es upgrade, + fi and
   ar as hard-case proofs).
2. **Generate pilots.** `/generate-language` for the pilots, grounded in
   UniMorph/CLDR/Giella, gated by `morphology-validator`. Ship into LingoLinq
   behind the `multilingual_grammar` flag, all entries `status: generated` with
   the unverified badge.
3. **Stand up review.** Label Studio instance for the pilots (decision 1) ->
   real reviewer feedback fast. Wire `WordData.verification` + the
   `/api/v1/review` namespace, deployed as its own GCP service (decision 4).
4. **Build the contributor app.** Durable queue-based review UI (grid + paradigm),
   Google SSO + reviewer CLA (decision 3), consensus (decision 2), leaderboard,
   per-language progress. Migrate reviewers off Label Studio.
5. **Scale to 30.** Batch-generate the long tail; recruit university teams per
   language once external recruiting opens (decision 5); promote a language from
   "beta/unverified" to "verified" as its coverage crosses a threshold.
6. **Feedback loop.** `review-triage` turns systematic flags into paradigm fixes;
   regenerate affected words; verified edits become new few-shot exemplars that
   improve later generation.

This tooling track runs alongside the phase roadmap starting around Phase 3
(Spanish, the first locale needing real hand-authored data and SLP/reviewer
input) - Phases 1-2 (EN schema-2 migration, concept-id layer) work from existing,
already-reviewed English data and don't need the review platform yet.
