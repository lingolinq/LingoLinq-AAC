# AAC Evaluation Standards — research findings

Compiled 2026-08-14 from primary sources (ASHA Practice Portal, CMS LCD L33739 +
Policy Article A52469, NY State Medicaid SGD Guidelines, MN DHS, 34 CFR 300.6 /
300.320, Zabala, Beukelman & Mirenda, Light 1989/2014, Rowland).

Purpose: ground the Quick Eval / Targeted / Comprehensive eval reports in what an
SLP expects and what a funder or IEP team will accept. **Read the licensing
section before naming any framework in shipped UI.**

---

## 1. LICENSING — what we may and may not use

| Framework | Verdict for commercial software |
|---|---|
| **Light's four competencies** (linguistic / operational / social / strategic) | ✅ **Safe.** Academic construct, no trademark evident, used with attribution by competitors. Cite Light (1989), *AAC* 5(2), 137–144. Do not reproduce article text. |
| **Dowden — Communicative Independence Model** (emergent / context-dependent / independent) | ✅ **Safe.** Academic. This is the *unencumbered upstream* of DAGG's ability levels — use it instead of DAGG. |
| **Participation Model** (Beukelman & Mirenda) | ✅ Concept freely citable; textbook figures/text are not. |
| **SETT** (Zabala) | ✅ Freely used convention. See naming note below. |
| **Communication Matrix** 7 level names | ⚠️ Probably fine **with attribution**; the 24-message grid, definitions, questions and Profile layout are copyrighted. **Terms of Use could not be retrieved** (client-rendered SPA) — needs a human to check in a browser before we rely on it. |
| **DAGG-2 / DAGG-3** | ❌ **Name-reference only.** |
| **Social Networks** (Blackstone & Hunt Berg) | ❌ Commercially sold, all rights reserved. |
| **AACP (Kovach)**, **FCP-R (Kleiman)** | ❌ Commercial PRO-ED kits. |
| **ASHA NOMS FCMs** | ❌ ASHA-owned, registration-gated. |

### The DAGG problem (action required)

DAGG-3 carries this verbatim notice:

> "These materials are never to be offered for sale and are not intended for
> revenue generation or profit."

DAGG is published by **Tobii Dynavox — a competing AAC vendor**. We currently use
the name in user-facing places:

- `app/frontend/app/components/eval-quick-report.hbs` — "DAGG-style IEP goal suggestions" (report section title)
- `lib/eval_pdf.rb` — exported reports
- `docs/marketing/` — the Quick Eval spec sheet + PDF

**Good news, verified:** we have **not copied their content.**
- Our prompt hierarchy (`eval_prompt_hierarchy.js`) is independently authored —
  6 levels citing Snell/Snodgrass — and is nothing like DAGG's `GM/IC/DVC/DPC/PA`
  (DAGG-2) or `N/I/D/M` (DAGG-3).
- Our goal templates (`lib/eval_goals_grid.rb`) are structurally unlike DAGG's.

So the exposure is **the name only**. Recommended fix: relabel as
**"IEP goals across Light's four communicative competencies"**, attributing Light
(1989). More accurate as well as safer — DAGG is itself built on Light.

Also: the report card hint reads "Communication Matrix scale (1–7)" — names
Rowland's instrument without attribution. Low risk, but should credit it.

### SETT naming

Zabala's own primary document uses **plural**: "Student, **Environments**,
**Tasks**, Tools." Our runner labels are singular
(`eval-comprehensive-runner.hbs`). The singular is a widespread but
non-canonical variant.

---

## 2. The full eval is TWO different reports

The single biggest structural finding. A medical/funding report and a school/IEP
report are not the same document, and the generator must know which it is
producing.

| Dimension | Medical / funding | School / IEP |
|---|---|---|
| Standard | Medical necessity; severe expressive impairment; natural modes ruled out | Educational relevance / access to FAPE |
| Framework | Feature match + HCPCS category rule-outs | **SETT** — Tools chosen *last*, after S/E/T |
| Author | SLP (+ OT/PT input); SLP signs | Multidisciplinary team; IEP team decides |
| Setting | Clinic + reported environments | **Customary environments required** (34 CFR 300.6(a)) |
| Cost | Least-costly-alternative analysis **mandatory** | Absent |
| Device naming | **Must** name make/model + HCPCS + accessories | **Must NOT name a brand** — naming a product in an IEP obligates the district to it |
| Signatures | SLP license #, ASHA CCC #, physician | Team; no physician |

> ⚠️ **This affects the Vocal Flair card we added to the report.** Putting
> "Vocal Flair 84" in a school/IEP report is the exact anti-pattern above. It
> should be gated to medical mode, and described by *feature* in school mode.

---

## 3. Section spine for the comprehensive report

★ = element explicitly required by Medicare LCD L33739.

1. Header / demographics — medical dx + onset, speech dx + onset, payer IDs, physician, SLP, eval date(s) vs report date
2. Reason for referral & evaluation methods
3. Background, medical history, medications, prior therapy, education/vocational, living environment
4. ★ Current communication status — **type, severity, language skills, cognitive ability, anticipated course**; receptive/expressive/pragmatic; intelligibility familiar vs unfamiliar
5. Cognition & literacy
6. Sensory — vision (acuity for symbol size, tracking, CVI) and hearing, **stated relative to device use**
7. Motor & positioning — postures + % of day; mounting; wheelchair integration
8. Access/selection — optimal technique; **alternatives explored with trial length, training, and reason ruled out**
9. Symbol form, language representation, vocabulary organization, rate enhancement
10. ★ Daily functional communication needs by environment and partner; needs over next 2 years
11. ★ Non-SGD options considered and ruled out — therapy, sign, writing, boards/PECS, low-tech, **and lower-cost tech incl. software on user-owned hardware**
12. ★ **Feature match** — required features derived from §4–10
13. ★ Systems trialed — comparison table + per-trial data (see §5)
14. ★ Recommendation — device/software + accessories, **manufacturer, product name and number, HCPCS**, per-accessory justification
15. ★ Functional communication goals — measurable, time-framed, **set before the trial** and achieved at completion
16. ★ Treatment/implementation plan **with a training schedule**
17. Environmental supports — caregiver capacity, training commitment, local support
18. Upgrade/replacement rationale (conditional)
19. ★ Attestations — physician-forwarding statement; **financial-independence statement**; signature block with license #, ASHA CCC #, NPI

**School mode:** swap 11/14 for SETT-derived features described by feature not
brand; add PLAAFP language, standards-aligned IEP goals, related services,
supplementary aids, **device-failure backup plan**, transition/ownership, and
evidence of evaluation in customary environments.

### ASHA's 13 "Typical Components" (clinical expectation, not funding)
Case History · Ecological Inventory · Self-Report · Sensory and Motor Status ·
Hearing Screening · Speech Sound · Expressive and Receptive Language · Written
Language · Social Communication · Cognitive Communication · Symbol Assessment ·
Feature-Matching · Contextual Facilitators and Barriers

---

## 4. Medicare specifics that bind US (E2511)

A browser/tablet AAC app is **software-only, E2511**; the hardware is **A9270,
non-covered**. Policy Article A52469 requires that

> "a device utilizing tablet, smartphone or computer hardware must be designed by
> the manufacturer to function solely as a speech generation device… at the time
> of initial issue."

The report generator should be able to emit a manufacturer/product/model line, a
lock-down statement, and a non-covered-feature exclusion narrative. For
alternative input, the evaluation must state **why standard input cannot be
used**.

LCD L33739 has **seven** coverage criteria, all mandatory; criterion 7 bars the
evaluating SLP from any financial relationship with the supplier.

---

## 5. Trial documentation (the section most often thin, most often denied)

NY Medicaid §10 requires, for each less-costly alternative: **trial length,
education/training provided, and the specific reason it was ruled out**, plus
data collected on the trial device. §6 requires the same rigor for **access
methods**. MN DHS requires "explicit evaluation of each AC device or method…
and information on the effectiveness," with **speed and accuracy** data.

Per-trial capture: device + language system + accessories · start/end dates ·
environments (≥1 outside school, ideally 3) · communication partners · ≥10
distinct medically relevant messages tagged by function/partner/environment ·
operational skills · intrinsic factors (initiation, persistence, breakdown
repair) · cost-effectiveness comparison across no-cost / low-cost / tablet options.

---

## 6. Claims we must NOT make

- **Feature matching is not empirically validated.** No peer-reviewed study shows
  it produces better outcomes. "Research-based and clinically proven" appears
  only in vendor and blog content. Do not repeat it in product or marketing copy.
- **Medicare does not require a trial or rental period.** Neither LCD L33739 nor
  Policy Article A52469 mentions one. Trial-first mandates are **state Medicaid**
  (NY explicitly). Do not hard-code "Medicare requires a trial."
- IDEA requires goals be *measurable* and that the measurement method be stated.
  It does **not** prescribe percentages or trial counts — those are professional
  convention, not law.

---

---

## 8. Symbol systems & iconic encoding — the evidence is far weaker than the marketing

Added 2026-08-14 from a follow-up review of the Minspeak / semantic-compaction
literature. Directly relevant to any claim we make about symbol sets, vocabulary
organisation, or "evidence-based" design.

### The headline numbers

- **PubMed, `"semantic compaction"[Title/Abstract]` → 0 results.** Not one title
  or abstract, in a method that has been sold since 1983.
- **PubMed, `Minspeak[Title/Abstract]` → 3 results.**
- The positive literature is **almost entirely n=1 and n=2 case reports**. The
  comparative group studies run the *other* way.

### The comparative studies go against iconic encoding

- **Light et al. (2004)**, *AAC* 20(2), 63–88 — **n=80** typically developing 4-
  and 5-year-olds, four conditions. Accuracy gains were **significantly greater
  for all three dynamic-display conditions than for iconic encoding**. Penn
  State, no vendor affiliation.
- **Drager & Light (2010)**, *AAC* 26(1), 12–20 — **n=20**, using **Unity itself**.
  Icon prediction **did not** improve accuracy.
- **van der Merwe & Alant (2004)**, *J Communication Disorders* 37(3) — **n=480**
  South African students. Minspeak icon associations are **culture-bound**;
  systems "cannot merely be imported."
- **"Words We Would Want"**, *Perspectives on AAC* 17(4) — compared Unity 45,
  Picture WordPower 45 and Gateway 60 against frequency corpora. Unity had the
  best word coverage but the **worst average keystrokes per word**.

### How the pro-encoding claims are manufactured

The two most-repeated claims in AAC sales conversations trace to **non-peer-reviewed
conference handouts by a device manufacturer's board chairman**, then get laundered
into "research shows" via Wikipedia and vendor training material:

| Claim | Actual source | Status |
|---|---|---|
| "Best method for core vocabulary" | Romich (1999), ERIC ED444308 — a 7-page conference handout, ERIC flags **Peer Reviewed: No** | Unsupported |
| "Up to 6× faster than spelling" | Hill, Holko & Romich (2001), ASHA convention presentation | **No peer-reviewed source located** |
| "LAMP is evidence-based" | Bedwani et al. (2015), *Cogent Education* | n=8, **uncontrolled, non-randomised**, 5 weeks, partly parent report |
| "Improves literacy, effect size 1.16" | Dunst et al. (2012), a practice bulletin describing **one 3-year-old** | Effect size from n=1 |

The consensus bodies decline to endorse any method: **ASHA** describes the three
language representation methods neutrally, and the **National Academies (2017)**
states "little research published to date supports the notion that word prediction
enhances rate."

Tellingly, **Light et al. (2019)** — the field's state-of-the-science review on AAC
display design — does not mention iconic encoding, Minspeak or semantic compaction
at all.

### Iconicity itself is contested

Schlosser & Sigafoos (2002) found support for the iconicity hypothesis **largely
restricted to nouns**, and **no advantage when the referent was unknown to the
learner beforehand** — precisely the emergent AAC learner's situation. Most of the
supporting literature also measures *translucency* (adults rating symbol–referent
relatedness) rather than *transparency* (naive guessing by potential users).

### What this means for us

1. **Do not claim any symbol set or organisation is evidence-superior.** The
   evidence does not exist, and for iconic encoding the independent evidence is
   unfavourable.
2. Our decision to ship a **single symbol library** is defensible on product
   grounds and is **not** contradicted by evidence — there is no demonstrated
   benefit to library choice that we would be giving up.
3. When we cite research, trace it to the primary source. This literature is a
   worked example of vendor conference papers acquiring the appearance of
   evidence through repetition.

## 7. Open items

1. **Communication Matrix Terms of Use** — unreadable by fetch; needs a human in
   a browser, or contact the Foundation, before we reference the instrument.
2. **Trademark status** of "DAGG" / "Dynamic AAC Goals Grid" / "Communication
   Matrix" — USPTO API rejected programmatic queries. Copyright restriction alone
   is disqualifying for DAGG regardless.
3. **Gosnell, Costello & Shane (2011)** feature-matching taxonomy — paywalled;
   citation confirmed, category labels not.
4. **CMS LCD L33739 criteria 1–7 verbatim** — cms.gov 403'd; corroborated via
   ASHA and USSAAC. Verify against CMS directly before encoding.
5. **Closed except access methods.** Symbol systems / iconic encoding → §8.
   Motor planning / grid-size → §9. Symbol assessment, colour, CVI → §10. Still
   **no research gathered** on **access-method assessment protocols** (scanning
   variants, eye-gaze calibration, partner-assisted scanning).
7. **Fitzgerald key colour coding** — see §10.2. Evidence does not support
   background colour coding for young children. Review before marketing it. This still matters: our `GRID_BANDS`
   (24/40/60/84/112) and the marketing sheet's "calibrated bands" claim rest on a
   code comment, **not on published evidence**. Do not defend that calibration as
   evidence-based until it is researched. **§9 confirms no such evidence exists** —
   use "clinically calibrated defaults," not "evidence-based."
6. The marketing sheet's "chosen by evidence" band heading should be reworded — see §9.

---

## 9. Motor planning & grid-size progression — relevant to our GRID_BANDS

Added 2026-08-14. This is the evidence base for the "keep button locations fixed /
start big and mask" design principle every AAC vendor promotes — and for our own
five-band progression (24/40/60/84/112).

### What actually exists

- **Thistle et al. (2018)**, *AJSLP* 27(3), 1010–1017 — **n=24, typically
  developing 4-year-olds**, no disabilities. Consistent symbol location produced
  ~3s faster response by session 5. The authors' own caveat: *"replication with
  children who use AAC is critical."* **That replication has not been published.**
- **Dukhovny & Zhou (2016)**, *AAC* 32(4) — the only study operationalising
  **masking vs resizing**. Within-subject, **adults without disabilities**.
  Location-centred (masked) training beat size-centred. Authors' conclusion is
  explicitly conditional: *"If similar effects are found with individuals with
  complex communication needs…"*
- **Explicit negative finding:** database searches found **no study comparing
  masking against grid-resizing in AAC users.** None.

### The vendors' own bibliography gives the game away

PRC's "References Supporting LAMP → Consistent and Unique Motor Plans" lists
Schmidt, Keele, Hebb, Gentile, and assorted PT/OT motor-learning work. **Not one
is an AAC study.** The AAC-specific claim is an extrapolation from generic
motor-learning theory, not a tested proposition. Vendor pages asserting motor-plan
preservation (PRC-Saltillo, AssistiveWare, Tobii Dynavox) carry **zero research
citations** on the relevant pages.

### The field's own experts call it a gap

- **Thistle & Wilkinson (2015)**, *AAC* — survey of n=112 AAC SLPs — states that
  clinical decisions including **"supports for motor planning"** are areas
  *"for future research"*, i.e. **not** currently evidence-supported.
- **Light et al. (2019)** state-of-the-science on AAC display design contains **no
  mention of LAMP, Minspeak, semantic compaction, or Unity**, and does not treat
  location-consistency as an established principle.
- **Drager et al. (2004)**, *JSLHR* 47(5) — Light's own lab — found 3-year-olds
  performed **significantly better with contextual scenes than grids**, which cuts
  against "put them on a big grid immediately."

### What this means for our GRID_BANDS

1. **Our progression is not contraindicated.** Verbatim from the review: *"don't
   treat a small-grid-then-expand path as contraindicated; nothing in the
   peer-reviewed record shows it produces worse outcomes."*
2. **But we cannot call the bands "evidence-based" or "calibrated" in the research
   sense.** They are clinically sensible defaults. The honest framing is
   **"clinically calibrated defaults"**, not "evidence-based bands."
3. If we ever add masking/Vocabulary-Builder-style progression, build it because
   it is low-cost and preserves user choice — **not** because the literature
   compels it. It does not.

> **Marketing implication:** the current spec sheet says "Five bands, chosen by
> evidence." That is defensible only in the narrow sense that the *band selected
> for a given learner* is chosen from that learner's probe data. It is **not** a
> claim that the band boundaries themselves are research-derived. Consider
> rewording to "chosen from performance, not assumption" to avoid implying the
> latter.

---

## 10. Symbol assessment, colour coding, and CVI

Added 2026-08-14. **§10.2 contradicts near-universal AAC practice — including ours.**

### 10.1 Symbols are not self-explanatory

**Díez et al. (2024)**, *Frontiers in Psychology* 15:1467796 — **1,525 ARASAAC
pictograms**, n≈250 raters. Mean transparency **0.39** — fewer than 4 in 10 naming
attempts matched the intended meaning. **Nouns 0.44 vs verbs 0.22.** Verbs are
roughly half as guessable as nouns, and no symbol set has solved this.

Implication: never claim symbols are "intuitive." And core vocabulary — mostly
verbs and function words — is exactly where iconicity helps least.

### 10.2 ⚠️ Background colour coding is unsupported for young children

Quoting **Light et al. (2019)** state-of-the-science review directly:

> "for young children with typical development and displays with **fewer than 24
> symbols**, background color cues **do not facilitate search**… there are several
> indications that **background color might actually disrupt search in younger
> children**."

> "unlike symbol-internal color cues, background color cues have **no measurable
> effect**" on 16-symbol arrays, for typically developing children *and*
> individuals with Down syndrome.

Only caveat: background colour **may** help **adults without disabilities** on
**64-symbol** arrays.

**What IS supported: internal colour clustering.** Wilkinson & McIlvane (2013),
*AJIDD* 118(5) — n=24 (Down syndrome + ASD). Clustered **3.6s** vs distributed
**4.2s**, *p*=.001. Distributed layouts also produced significantly more
**cross-midline reaches** — biomechanically costly for motor-impaired users.

> **Directly relevant to us:** we colour buttons by **Fitzgerald key part of
> speech** (see `no_fitzgerald_message` in en.json). That is background-colour
> coding by grammatical category — the practice the evidence does *not* support
> for young children. The proposed mechanism is that it requires metalinguistic
> understanding that emerges around **ages 5–7**; below that it is noise.
>
> This is not a reason to rip it out — it is near-universal, and adults/large
> grids may benefit. It **is** a reason to (a) not market it as evidence-based,
> and (b) consider defaulting it **off** for early learners while preferring
> internal-colour clustering as the organising cue.

### 10.3 No symbol set is proven superior

- No systematic review or meta-analysis compares modern sets (PCS / SymbolStix /
  ARASAAC / Widgit / Mulberry) on learnability or comprehension.
- **SymbolStix — the most widely deployed set in iOS AAC apps — has essentially no
  peer-reviewed comparative literature at all.**
- ARASAAC has the most favourable comparative data, but the studies are
  Spanish-population, small (n=24 children), and partly curated by ARASAAC itself.
- **RCSLT** declines to rank sets; **ASHA** names no preferred set.

**So our single-library decision is defensible** — justify it on **licence,
coverage, verb representation and cultural fit**, never on comprehension evidence,
because that evidence does not exist.

### 10.4 The representational hierarchy is partly lore

The familiar "object → photo → line drawing → abstract symbol" teaching sequence
traces to **Mirenda & Locke (1989)**, which measured **guessability, not
learnability**, and only **at the noun level**. RCSLT: *"Use of hierarchies should
be adopted with caution."* ASHA: *"There are no prerequisites for AAC
intervention."* Do not build a gated progression that requires mastering one
representation level before the next.

### 10.5 CVI — converging expert opinion, almost no outcome data

**Wilkinson et al. (2023)**, *AJSLP* 32(5) is a **framework/tutorial**, not an
efficacy trial — "evidence-based" there refers to the EBP triad. **Boster et al.
(2025)** is a focus group of 9 vision professionals. A 2025 meta-analysis found
**only 8 studies** on AAC with visual impairment; 84% targeted requesting only.

Converging recommendations (expert consensus, not outcome data): **dark/black or
grey backgrounds with high contrast**, **fewer and larger symbols**, reduced
internal detail, familiar/personalised imagery, complexity scaffolded over time.

No AAC-specific study isolates **luminance contrast ratio** — contrast guidance is
borrowed from WCAG and the CVI literature.

### 10.6 No standardised symbol test exists

There is **no norm-referenced, psychometrically validated test of AAC symbol
comprehension.** The TASP (Mayer-Johnson/Tobii Dynavox) has **no published
normative sample, reliability, or validity data** that could be located. The
Communication Matrix is **criterion-referenced** and measures expressive
communication *level*, not symbol comprehension.

The methodologically strongest clinical approach with peer-reviewed support is
**dynamic assessment** — graduated prompting measuring *modifiability* rather than
static accuracy (Binger, Kent-Walsh & King 2017, *JSLHR* 60(7)). **Our
`eval_prompt_hierarchy` is already this design.**

---

## 11. Motor planning, part 2 — the mechanism is probably visual, not motor

Added 2026-08-14 from a deeper follow-up review. This supersedes nothing in §9; it
explains *why* §9's evidence is so thin.

### The vendor claim misreads the theory it cites

Every AAC vendor cites **Schmidt's schema theory (1975)** for "consistent motor
plans." But in schema theory, a generalized motor program's **invariants** are
order, relative timing and relative force — while **movement amplitude (spatial
extent) is a PARAMETER**, freely re-specified at execution. Schema theory
therefore predicts a well-formed motor program should **transfer across rescaled
versions**, which is close to the opposite of "any coordinate change destroys the
plan."

Schema theory also predicts **variable practice beats constant practice** for
transfer — again the opposite of "never change anything." And Schmidt himself
(2003) called for the theory's replacement.

The literature that *does* support layout consistency is **Shiffrin & Schneider
(1977)** on consistent-mapping automaticity — but that is about the
**stimulus→response mapping** (this symbol always means this word), not about
pixel coordinates.

### The best-measured AAC finding says latency is visual search

**Wilkinson et al. (2024)**, *AAC* — n=10 autistic adolescents, n=9 with Down
syndrome. Correlation between **time to first fixate** and **time to select**:
**r(8) = .98, p < .001** and r(7) = .68, p = .023.

Selection latency on an AAC display is **dominated by visual search, not motor
execution.** Framing layout gains as "muscle memory" mislabels a visual-search
effect. This matters practically: a visual-search account predicts a change that
preserves grouping and landmarks is cheap; a motor-plan account predicts any
coordinate change is expensive. **They make different predictions and only one is
supported.**

### Absence-of-evidence, measured

PubMed hit counts used deliberately as an absence instrument:

| Question | Records |
|---|---|
| Masking/hiding vs resizing the grid, any outcome | **0** relevant (2 hits, both unrelated chemistry) |
| Cost of relearning when an AAC layout changes | **0**, any design |
| Layout-consistency experiment in people who **actually use AAC** | **0** — both experiments used participants **without** disabilities |
| Longitudinal study of automaticity on an AAC display | **0** |
| Any study isolating LAMP's motor-planning component from its other four | **0** |

The two supporting experiments are **Thistle 2018** (n=24 preschoolers, no
disabilities) and **Brock et al. 2025** (n=42 adults, no disabilities; placement
effect real but **~0.26s**, emerging by trial 4).

**Chen et al. (2026)**, n=8 — the first AAC test of a motor-learning principle —
found **blocked practice gave more stable retention and random practice worse
1-week retention**, contradicting the standard prediction.

### Epistemic warning worth keeping

While researching this, an automated page-summarizer returned a confident,
quotation-marked sentence attributing to Light et al. (2019) the claim that
*"consistent layouts facilitate skill acquisition."* Fetching the open-access PMC
version of the same paper confirmed **the sentence does not exist.** That is
precisely how this claim propagates. **Verify quotes against primary text.**

### Net position for us

"Consistent symbol location improves selection speed" is **supported** — by two
small studies on non-disabled participants over 4–5 sessions, plus a much stronger
adjacent HCI spatial-memory literature. "This works via motor planning, therefore
any coordinate change destroys a learned motor plan" is **supported by nothing**,
is in tension with the r=.98 finding, and misreads its own cited theory.

Our five-band progression remains defensible. Neither we nor anyone else should
claim evidence for masking *or* for resizing — **there is none either way.**
