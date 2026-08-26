# AAC Evaluation Standards — research findings

Compiled 2026-08-14; payer sources re-verified and re-cited **2026-08-25** (see
§0 Sources).

**How to read this document.** There is no SLP on staff. That means nothing here
is safe on anyone's professional recollection — a requirement is only as good as
the source next to it. Every payer requirement below is now marked:

- **[VERIFIED]** — retrieved from the issuing body's current published document,
  cited in §0 with a URL and an effective date, quoted where it matters.
- **[UNSOURCED]** — we assert it, we could not find a published source. Treat as
  clinical convention, NOT as a payer mandate. Do not tell an SLP it is required.
- **[SUPERSEDED]** — was true, the issuing body has since changed it. Kept only
  where the history explains something.

If you add a requirement, add its citation in the same edit. An uncited
requirement in this document is a defect, not a to-do: an SLP cannot tell it
apart from a real one, and the failure mode is a denied funding claim for a
disabled person's communication device.

Purpose: ground the Quick Eval / Targeted / Comprehensive eval reports in what an
SLP expects and what a funder or IEP team will accept. **Read the licensing
section before naming any framework in shipped UI.**

---

## 0a. HOW THIS WAS VERIFIED (method, so it can be redone)

Everything in §0 was retrieved and grepped on **2026-08-25**. Repeat it this way:

```
# All three payer sites 403 a browser-style fetch but answer plain curl.
curl -sL "https://www.emedny.org/ProviderManuals/DME/PDFS/DME_Procedure_Codes.pdf" -o ny.pdf
curl -sL "https://www.mass.gov/doc/guidelines-for-medical-necessity-determination-for-augmentative-and-alternative-communication-devices-including-speech-generating-devices/download" -o mh.pdf
curl -sL "https://sites.ed.gov/idea/files/Myths-and-Facts-Surrounding-Assistive-Technology-Devices-01-22-2024.pdf" -o osep.pdf

# macOS has no pdftotext; Ghostscript is already a dependency of this repo.
gs -q -dNOPAUSE -dBATCH -sDEVICE=txtwrite -sOutputFile=ny.txt ny.pdf
```

Three traps, each of which produced a wrong answer here before being caught:

1. **The 403 is NOT a user-agent block.** A previous revision of this file said it
   was and told the next person to retry with a browser UA. Plain `curl` with **no**
   UA override also returns 200 — it is the fetching client's fingerprint. Swapping
   the UA in a blocked client will not help and will look like the page is gone.
2. **Grep the SECTION, not the manual.** NY's DME manual is ~773,000 characters
   covering every category of durable medical equipment. A whole-file grep for
   "2 years" or "four-week" returns hits from wheelchairs and lymphedema. The SGD
   coverage-guidelines block sits around offset 418,000–436,000; locate it by
   searching for a distinctive phrase (`reasonably foreseeable`, `Length and dates
   of trial`) and slice a window before counting anything.
3. **Verify a quote exists before citing a section number.** Section numbering
   changed completely between the 2012 and current NY documents. A cite like
   "NY §10" that looked right for six years pointed at a document that had been
   retired. Match on the sentence, then record the number.

---

## 0. SOURCES

Every payer claim in this document traces to one of these. Retrieved 2026-08-25
unless noted. `cms.gov` and `emedny.org` both 403 a browser-style fetch but return
200 to plain `curl`; PDFs extract with
`gs -q -dNOPAUSE -dBATCH -sDEVICE=txtwrite -sOutputFile=out.txt in.pdf`.

**Medicare — the only source that makes something *federally* required**

- **LCD L33739, *Speech Generating Devices*.** CGS Administrators (J-B 17013,
  J-C 18003); Noridian Healthcare Solutions (J-A 16013, J-D 19003). Original
  effective 2015-10-01; revision effective 2024-10-01 (R8); no retirement date.
  <https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdId=33739>
  Verbatim criteria quoted at §4a.
- **Article A52469, *Speech Generating Devices — Policy Article*.**
  <https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleId=52469>
  Contains the SUPPLIER CLAIM rules (manufacturer / product name and number), which
  are **not** requirements on the SLP's evaluation — see §14 and §4a.

**New York Medicaid — CURRENT**

- ***Durable Medical Equipment, Prosthetics, and Orthotics: Procedure Codes and
  Coverage Guidelines.*** NYS Dept. of Health, Office of Health Insurance Programs,
  via eMedNY. Doc Control No. **DME 2026**, v1.0, effective **2026-07-01**. SGD
  section from **p. 82**; evaluation elements at **§4(g)**.
  <https://www.emedny.org/ProviderManuals/DME/PDFS/DME_Procedure_Codes.pdf>
  That URL rolls forward at each revision — pin a snapshot when quoting:
  <https://www.emedny.org/ProviderManuals/DME/archive.aspx>
  SGD language is unchanged in substance since the 2019-1 edition.

**New York Medicaid — SUPERSEDED. Do not cite as current.**

- ***Speech Generating Device And Related Accessories Guidelines***, NYS DOH OHIP,
  **August 2012**. Twelve pages, 16-section evaluation outline.
  <https://www.emedny.org/providermanuals/dme/PDFS/SGD_Coverage_Guidelines_final.10-08-12.pdf>
  **Retired effective 2019-08-01**, per NYS DOH's own notice: *"Revised guidelines
  for Speech Generating Devices were published in the latest revision of the
  Durable Medical Equipment, Prosthetics, Orthotics and Supplies Manual, effective
  August 1, 2019."*
  <https://www.emedny.org/ProviderManuals/DME/PDFS/Revised_Speech_Generating_Device_Guidelines_-_6-26-19.pdf>

  **This is the document the 2026-08-14 draft of this file was written from**, which
  is why its NY section numbers (§3, §6, §9, §10) do not exist in current policy.
  Corrected 2026-08-25. If you find a NY claim here citing a bare section number,
  it is probably still pointing at the retired outline.

**What current NY requires that this document did not list** — all [VERIFIED] against
DME 2026, retrieved and grepped 2026-08-25. Add these to the §3 spine when someone
next touches it:

- **Baseline performance.** §4(g)(iv)(3): *"Empirical data including baseline
  performance and results of trial period goals."*
- **Structured AND unstructured settings.** §4(g)(iv)(5): *"Whether communication
  occurred in both structured and unstructured settings."*
- **Multiple manufacturers, same HCPCS category.** §4(g)(iii): *"consideration of
  more than one device by multiple manufacturers within the same HCPCS category…"*
  This is a denial trigger — trialling two devices from one vendor does not satisfy it.
- **A financial-relationship attestation, in writing.** §4(i): *"A signed and dated
  attestation by the SLP that the licensed/certified medical professional (LCMP) has
  no financial relationship with the Medicaid provider or SGD manufacturer."* This is
  NY's analogue of Medicare criterion 7 — and unlike Medicare, NY names it as a
  document that must be signed and dated. (Our workbook captures this as
  `attestations.supplier_relationship`.)
- **An IEP for school-aged members.** Documentation item 3.
- **"Not fully dependent on prompting."** §1(d) — the member must demonstrate use
  *"without being fully dependent on prompting or assistance in producing the
  communication."* ASHA formally opposed this language in 2018 and did not prevail
  (<https://www.asha.org/siteassets/uploadedfiles/advocacy/comments/asha-comments-on-ny-medicaid-proposed-sgd-requirement-082718.pdf>).
  Worth knowing, because it is the criterion most likely to deny a young child.

**Trial LENGTH — no primary source sets one.** [UNSOURCED in primary.] Neither
L33739, A52469, NY DME 2026, nor MassHealth MNG-AAC states a required trial
duration. Two secondary sources say four weeks for NY specifically: PRC-Saltillo's
*"Read Me First — New York Funding Sources"* (aacfunding.com, stamped RMNY 10/24/23)
— *"Results from a four-week trial of the SGD must be documented… Start and end
dates of the trial MUST be noted"* — and the ASHA 2018 comment letter above, which
argues against the consequences of *"a 4-week trial period."* Both are secondary,
and PRC-Saltillo is an AAC vendor.

⚠️ **Do not "verify" this by grepping the NY manual for "four-week".** It occurs
there, but in the **lymphedema** section — a false positive that cost a check here
on 2026-08-25. The SGD section sets no duration.

**Massachusetts MassHealth — CURRENT. This is where the per-trial spec came from.**

- ***Guidelines for Medical Necessity Determination for Augmentative and
  Alternative Communication Devices, Including Speech-Generating Devices.***
  MassHealth (MA EOHHS / Office of Medicaid), **MNG-AAC (Rev. 3/23)**. Original
  effective 2017-03-01; policy revision effective **2023-03-09**. See also
  130 CMR 409.428. Per-device trial spec at **III.A.3.c**.
  <https://www.mass.gov/doc/guidelines-for-medical-necessity-determination-for-augmentative-and-alternative-communication-devices-including-speech-generating-devices/download>

  Found 2026-08-25 while trying to source the "MN DHS" attribution. MassHealth is
  the **only** payer located that requires a **communication partner per trial**,
  and the only one applying the full spec to *every device tried* rather than just
  the recommended one — verbatim, III.A.3.c.vi: *"Data sheets, including messages
  communicated, frequency, level of cueing, and communication partner."* The list
  this document carried was substantially MassHealth's all along, attributed to the
  wrong states.

**Federal — IDEA / school-mode (school reports only)**

- **34 CFR Part 300** — binding regulation. §300.6 defines an AT service to include
  *"a functional evaluation of the child in the child's customary environment"*;
  §300.320(a)(4) requires the IEP to state the services provided; §300.324(a)(2)(v)
  and (b)(2) require the IEP Team to **consider whether the child needs AT** at every
  development, review and revision; §300.105(b) allows school-purchased AT to go home
  where the Team says FAPE requires it. <https://www.ecfr.gov/current/title-34/part-300>
- ***Myths and Facts Surrounding Assistive Technology Devices and Services.***
  US Dept. of Education, OSEP + Office of Educational Technology, **January 2024**.
  **NON-BINDING guidance**, 28 myth/fact pairs.
  <https://sites.ed.gov/idea/files/Myths-and-Facts-Surrounding-Assistive-Technology-Devices-01-22-2024.pdf>
  Accompanying Dear Colleague Letter, 2024-01-22, which names AAC devices explicitly:
  <https://sites.ed.gov/idea/files/DCL-on-Myths-and-Facts-Surrounding-Assistive-Technology-Devices-01-22-2024.pdf>
  Checked 2026-08-25: **"brand", "trade name", "manufacturer", "product name" and
  "obligate" each appear 0 times.** See §2 — our "must not name a brand" rule was
  never federal.
- **IDEA Part B final regulations preamble, 71 FR 46540** (2006-08-14) — agency
  interpretation, non-binding. At 46665: specificity in an IEP is *"an IEP Team's
  decision"*. <https://www.govinfo.gov/content/pkg/FR-2006-08-14/pdf/06-6656.pdf>

**Field convention — NOT law, cite as convention if you cite it at all**

- The "describe by feature, not brand" practice is published by state and district
  AT programs (Hawaii DOE; Wayne RESA, MI; Boulder Valley SD, CO) and is absent from
  QIAT Indicator 3, the national quality-indicator set. At least one (Hill County
  SSA, TX) states a specific model **may** be named where the team determines only
  that model will meet the need.

**Minnesota DHS — NO SOURCE LOCATED**

- The 2026-08-14 draft attributed several requirements to "MN DHS," including the
  only appearance anywhere of a **speed/accuracy** requirement. Searched
  2026-08-25: **no issuing document, URL or date was found.** The quoted fragment
  ("explicit evaluation of each AC device or method… and information on the
  effectiveness") uses *AC device* rather than *AAC*, which reads as pre-2000s.
  Every MN DHS claim is marked **[UNSOURCED]** until someone retrieves the actual
  MHCP Provider Manual entry. Do not present them to an SLP as requirements.

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
| Device naming | **Must** name make/model + HCPCS + accessories | **Convention: describe by feature, not brand** — see the correction below. This is NOT a federal rule |
| Signatures | SLP license #, ASHA CCC #, physician | Team; no physician |

> ⚠️ **This affects the Vocal Flair card we added to the report.** Gate it to
> medical mode and describe by *feature* in school mode.
>
> **[UNSOURCED as federal law — corrected 2026-08-25.]** This row used to read
> "Must NOT name a brand — naming a product in an IEP obligates the district to
> it", stated as a rule. It is not one. Searched ED's current guidance,
> *Myths and Facts Surrounding Assistive Technology Devices and Services*
> (OSEP/OET, January 2024) — **"brand" appears 0 times**, as do "trade name",
> "manufacturer", "product name" and "obligate". None of its 28 myth/fact pairs
> concerns brand naming. Nor does 34 CFR Part 300 or the 2006 Part B preamble.
> <https://sites.ed.gov/idea/files/Myths-and-Facts-Surrounding-Assistive-Technology-Devices-01-22-2024.pdf>
>
> Federal guidance in fact runs the OTHER way. **Myth 6**, verbatim: *"MYTH:
> Specific AT decisions do not need to be included in the written IEP document.
> FACT: IDEA requires the IEP to include a statement about a child's special
> education, related services, and supplementary aids and services. If AT devices
> and services are being made available … they must be included in the IEP."*
> And the 2006 preamble (71 FR 46665) makes specificity **an IEP Team decision**,
> not something forbidden.
>
> So why keep the convention? Because the *consequence* the field fears is real,
> it just comes from a different rule: 34 CFR 300.323(d)/300.324 require the
> district to implement the IEP **as written** and forbid unilateral change. Name
> a product and the district is bound to that product. That is a good reason to
> describe by feature — and a bad reason to tell an SLP that federal law forbids
> naming one. Several states and districts publish the feature-not-brand
> convention (Hawaii DOE, Wayne RESA, Boulder Valley), and at least one is
> explicit that a specific model **may** be named where the team determines only
> that model will do. QIAT Indicator 3, the national quality-indicator set,
> contains no brand prohibition either.
>
> **Product consequence:** withholding the product card in school mode is still
> the right default. Just do not defend it as a legal requirement.

---

## 3. Section spine for the comprehensive report

★ = element explicitly required by Medicare LCD L33739.

> **Read §4a first — this list was corrected on 2026-08-17, and again on 2026-08-25.**
> The ★ markers below were assigned from ASHA/USSAAC summaries. Now that the primary
> text has been retrieved, **four** of them are not Medicare requirements — §10's
> environment/partner breakdown, §12 feature match and §13 per-trial data are
> **[VERIFIED] current NY Medicaid (DME 2026)**, and §14's manufacturer/product/HCPCS trio is
> **A52469's supplier CLAIM rule, not an evaluation element**. Two required elements
> were missing entirely. Marked inline as ★→ⓝ (other payer or other rule) and ★NEW.
>
> §14 was missed by the first pass: it was counted in "six hold" without appearing
> in either audit table. See the note above those tables in §4a.

1. Header / demographics — medical dx + onset, speech dx + onset, payer IDs, physician, SLP, eval date(s) vs report date
2. Reason for referral & evaluation methods
3. Background, medical history, medications, prior therapy, education/vocational, living environment
4. ★ Current communication status — **type, severity, language skills, cognitive ability, anticipated course**; receptive/expressive/pragmatic; intelligibility familiar vs unfamiliar
5. Cognition & literacy
6. Sensory — vision (acuity for symbol size, tracking, CVI) and hearing, **stated relative to device use**
7. Motor & positioning — postures + % of day; mounting; wheelchair integration
8. Access/selection — optimal technique; **alternatives explored with trial length, training, and reason ruled out**
8b. ★NEW Demonstrated cognitive and physical ability to effectively use **the selected device and its accessories** — criterion 1 bullet 6; distinct from the general cognition (§5) and motor (§7) sections (§4a)
9. Symbol form, language representation, vocabulary organization, rate enhancement
10. ★→ⓝ Daily functional communication needs by environment and partner; needs **current and reasonably foreseeable** — **Medicare requires only "whether daily needs could be met using other natural modes". The environment/partner split is [VERIFIED] current NY Medicaid, DME 2026 §4(g)(i): "primary communication partners; current and reasonably foreseeable communication environments." The "next 2 years" horizon this line used to carry is [SUPERSEDED] — it was 2012 NY §3, and NY deleted it in the 2019 revision; "two years"/"2 years" appears 0 times in the current SGD section (§0, §4a)**
11. ★ Non-SGD options considered and ruled out — therapy, sign, writing, boards/PECS, low-tech, **and lower-cost tech incl. software on user-owned hardware**
12. ★→ⓝ **Feature match** — required features derived from §4–10. **The phrase is absent from L33739; the mandate is "rationale for selection of a specific device and any accessories" (§4a)**
13. ★→ⓝ Systems trialed — comparison table + per-trial data (see §5). **L33739 requires only "considered and ruled out". The rigor is [VERIFIED] NY Medicaid DME 2026 §4(g)(iii)–(vi) — where the data-driven trial is a COVERAGE criterion, not just documentation — and MassHealth MNG-AAC III.A.3.c, which is where the per-trial partner/message spec actually comes from. "≥10 messages" and "speed/accuracy" are [UNSOURCED] (§0, §4a)**
14. ★→ⓝ Recommendation — device/software + accessories, **manufacturer, product name and number, HCPCS**, per-accessory justification — **the manufacturer/product/HCPCS trio is A52469's SUPPLIER CLAIM rule, not an L33739 evaluation element; the evaluation mandate is the per-accessory rationale (criterion 1 bullet 4, see §12 and §4a)**
15. ★ Functional communication goals — measurable, time-framed, **set before the trial** and achieved at completion
16. ★ Treatment/implementation plan **with a training schedule**
17. Environmental supports — caregiver capacity, training commitment, local support
18. ★NEW Upgrade/replacement rationale — **inside criterion 1, so MANDATORY whenever an upgrade is involved, not optional (§4a)**
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

> ⚠️ **Two different "criterion 7"s, do not conflate them.** LCD L33739's
> criterion 7 is the SLP financial-independence bar. The lock-down sentence
> quoted above opens "For criterion 7…" but refers to **A52469's own** seventh
> DME benefit-category requirement ("Be primarily used for the purpose of
> generating speech"). Different documents, different lists.

---

## 4a. LCD L33739 — VERBATIM, retrieved from CMS 2026-08-17

Source: `https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33739`
(HTTP 200 with a browser user-agent). **Original effective 10/01/2015; revision
effective 10/01/2024.** Contractors: CGS Administrators LLC (J-B, J-C) and
Noridian Healthcare Solutions LLC (J-A, J-D), all DME MAC.

> A speech generating device (E2500, E2502, E2504, E2506, E2508, E2510, E2511)
> is covered when all of the following criteria (1-7) are met:
>
> 1. Prior to the delivery of the SGD, the beneficiary has had a formal
>    evaluation of their cognitive and communication abilities by a
>    speech-language pathologist (SLP). The formal, written evaluation must
>    include, at a minimum, the following elements:
>    - Current communication impairment, including the type, severity, language
>      skills, cognitive ability, and anticipated course of the impairment;
>    - An assessment of whether the individual's daily communication needs could
>      be met using other natural modes of communication;
>    - A description of the functional communication goals expected to be
>      achieved and treatment options;
>    - Rationale for selection of a specific device and any accessories;
>    - Demonstration that the beneficiary possesses a treatment plan that
>      includes a training schedule for the selected device;
>    - The cognitive and physical abilities to effectively use the selected
>      device and any accessories to communicate;
>    - For a subsequent upgrade to a previously issued SGD, information regarding
>      the functional benefit to the beneficiary of the upgrade compared to the
>      initially provided SGD; and
> 2. The beneficiary's medical condition is one resulting in a severe expressive
>    speech impairment; and
> 3. The beneficiary's speaking needs cannot be met using natural communication
>    methods; and
> 4. Other forms of treatment have been considered and ruled out; and
> 5. The beneficiary's speech impairment will benefit from the device ordered; and
> 6. A copy of the SLP's written evaluation and recommendation have been forwarded
>    to the beneficiary's treating practitioner prior to ordering the device; and
> 7. The SLP performing the beneficiary evaluation may not be an employee of or
>    have a financial relationship with the supplier of the SGD.
>
> If one or more of the SGD coverage criteria 1-7 is not met, the SGD will be
> denied as not reasonable and necessary.

### What the verbatim text CHANGES about §3's ★ list

The ★ markers in §3 were assigned from the ASHA/USSAAC secondary sources. Against
the primary text, **five hold and four do not**. Corrected below; §3 is annotated
to match.

Every starred §3 item now appears in exactly one of the two tables. An earlier
revision of this section said "six hold and three do not" and listed six *rows*
in the confirmed table — but §19 occupies two of them, so only five distinct items
were actually audited. **§14 was silently counted as holding without being
checked**, and it does not hold (see below). If you add a ★ to §3, add a row here
in the same edit; the count is not self-checking.

**Confirmed ★ — traceable to a specific clause:**

| §3 item | Clause |
|---|---|
| §4 Current communication status | 1, bullet 1 — near word-for-word, including "anticipated course" |
| §11 Non-SGD options ruled out | criterion 4, plus 1 bullet 2 |
| §15 Functional communication goals | 1, bullet 3 |
| §16 Treatment plan **with training schedule** | 1, bullet 5 |
| §19 physician-forwarding statement | criterion 6 |
| §19 financial-independence statement | criterion 7 |

**Overstated ★ — required by SOMETHING, but not by L33739:**

- **§14 "manufacturer, product name and number, HCPCS."** These are **A52469's
  supplier claim-submission requirements** — "When codes **E2511, E2512, E2513,
  E2599** are billed, the claim must include all of the following information:
  Description of the item or service · Manufacturer name · Product name and
  number" — a rule
  on the *supplier's claim*, not an element of the SLP's evaluation under
  criterion 1. The only L33739 hook is criterion 1 bullet 4, "rationale for
  selection of a specific device and any accessories," which §12 already carries.
  ⚠️ **Corrected 2026-08-25.** This previously read "when codes E2500–E2599 are
  billed." That range does not appear in A52469 (0 occurrences) — the rule is
  scoped to the four codes above, i.e. the software/accessory codes, not the whole
  series. LingoLinq is **E2511**, so the rule does apply to us and nothing about
  our behaviour changes — but the scope was wrong in a section whose entire point
  is verbatim accuracy, which is exactly where an error is most costly.

  Keep recording them — the supplier needs them and the claim is denied without
  them — but they are not a Medicare requirement *on the evaluation*. This is the
  same error §12 was corrected for, and it survived the first correction pass.

- **§10 "by environment and partner… needs over next 2 years."** L33739 asks only
  for "an assessment of whether the individual's daily communication needs could
  be met using other natural modes." The environment/partner breakdown is
  **[VERIFIED] current NY Medicaid, DME 2026 §4(g)(i)** — not Medicare.

  Two corrections to what this bullet used to say. It cited "NY Medicaid §10";
  even in the retired 2012 outline this was **§3** ("Limitations of Current System
  and Communication Needs") — §10 was the systems-considered section. And it
  carried a **two-year horizon**, which is [SUPERSEDED]: that is 2012 §3 language,
  deleted by NY in the 2019 revision and replaced with "current and reasonably
  foreseeable." Verified 2026-08-25 — "two years"/"2 years" occurs 0 times in the
  current SGD section. Do not tell an SLP that NY requires a 2-year projection.
- **§12 "Feature match."** The phrase does not appear in L33739 at all. The
  requirement is "rationale for selection of a specific device and any
  accessories" — feature matching is *our method* for producing that rationale,
  not the mandate. Consistent with §6: do not call it clinically proven.
- **§13 "Systems trialed — comparison table + per-trial data."** L33739 requires
  only that other treatments were "considered and ruled out", so the rigor is not
  Medicare's. But the rest of what this bullet used to claim did not survive
  checking, and the parts split three ways:

  **[VERIFIED] current NY Medicaid** (DME 2026 §4(g)(iv), "Data driven AAC device
  trial"): trial length and dates; time-framed measurable goals and criteria;
  empirical data **including baseline performance**; environments trialed;
  **whether communication occurred in both structured and unstructured settings**;
  sampling of multiple messages with frequency, type and level of cueing; **number
  of messages expressed in a time period**; communicative intents and functions.
  Also §4(g)(iii): more than one device by **multiple manufacturers within the same
  HCPCS category**, and §4(g)(vi) a **cost comparison** across them.

  Note NY raised the stakes in 2019: the data-driven trial is now a **coverage
  criterion**, not merely a documentation item — §1(g) requires skills
  "demonstrated repeatedly over time, beyond a single instance or evaluation
  session."

  **[UNSOURCED] — our convention, not a payer mandate:** the "≥10 distinct
  messages" threshold and "≥1 environment outside school, ideally 3". Neither
  appears in the 2012 or current NY text (0 occurrences), nor in L33739.

  **[UNSOURCED] — attribution not verified:** "speed/accuracy". It appears in no
  Medicare or NY document (0 occurrences in both) and rests entirely on the MN DHS
  attribution we could not locate (§0). It is the weakest load-bearing claim in
  this file.

**MISSING from §3 — required and we did not list them:**

- **1, bullet 6: "the cognitive and physical abilities to effectively use the
  selected device and any accessories."** A demonstration tied to the *selected
  device*, which is not the same as the general cognition/motor sections.
- **1, bullet 7: upgrade justification.** §3 lists this as §18 "conditional" and
  left it unstarred. It is inside criterion 1, so when an upgrade is involved it
  is **mandatory, not optional**.

Net: the report generator must be able to emit both, or a submission that looks
complete against §3 is still short of criterion 1.

---

## 5. Trial documentation (the section most often thin, most often denied)

NY Medicaid §10 requires, for each less-costly alternative: **trial length,
education/training provided, and the specific reason it was ruled out**, plus
data collected on the trial device.

⚠️ **That sentence is [SUPERSEDED].** It paraphrases the retired 2012 NY guidelines
(§10 and §6). "education/training provided" occurs **0 times** in the current NY
manual. The [UNSOURCED] MN DHS quotation that used to follow it — "explicit
evaluation of each AC device or method… and information on the effectiveness,"
with **speed and accuracy** data — has no locatable issuing document (§0), and
speed/accuracy appears in no Medicare or NY text.

**[VERIFIED] current NY per-trial requirements** (DME 2026 §4(g)(iv)) — capture
these, they are what NY actually asks for:

- trial length **and dates**, and time the device was accessed
- time-framed measurable goals set for the trial, with criteria for measurement
- empirical data including **baseline performance** and results against those goals
- environments trialed (home, school, community — NY sets **no numeric minimum**)
- whether communication occurred in both **structured and unstructured** settings
- how the device was accessed
- sampling of multiple messages: frequency, type, and **level of cueing required**
- **number of messages expressed in a time period**
- communicative intents and functions expressed

plus §4(g)(iii) more than one device by **multiple manufacturers within the same
HCPCS category**, and §4(g)(vi) a **cost comparison** across them.

**[VERIFIED] MassHealth adds two things NY does not** (MNG-AAC III.A.3.c) — and
this is where our per-trial list actually came from. MassHealth applies the spec to
**every device tried**, not just the recommended one, and III.A.3.c.vi requires
verbatim: *"Data sheets, including messages communicated, frequency, level of
cueing, and **communication partner**."* It is the only payer located that requires
a partner **per trial**.

**[UNSOURCED] — ours, not a payer's.** These are reasonable clinical practice and
we should keep doing them, but do not present them to an SLP as required:
device + language system + accessories · **≥1 environment outside school, ideally
3** · **≥10 distinct medically relevant messages** tagged by
function/partner/environment · operational skills · intrinsic factors (initiation,
persistence, breakdown repair) · cost-effectiveness across no-cost / low-cost /
tablet options.

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
4. ~~**CMS LCD L33739 criteria 1–7 verbatim** — cms.gov 403'd; corroborated via
   ASHA and USSAAC. Verify against CMS directly before encoding.~~
   **CLOSED 2026-08-17 — retrieved verbatim from CMS. See §4a.** The earlier 403
   was a **user-agent block, not an access restriction**: the same URL returns
   HTTP 200 with an ordinary browser UA. Anything else in this document blocked
   "because cms.gov 403s" should be retried the same way before being recorded as
   unavailable.
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


---

## 12. Provenance findings, 2026-08-25 — where our rules actually came from

Sourcing pass run because we have no SLP on staff and every requirement in this
file needed a citable origin. Method and traps: §0a. Each item below records who
verified it, because that distinction is the point.

### 12.1 The ">=10 messages" rule is a competitor's worksheet [VERIFIED]

The per-trial rule this file attributed to **NY Medicaid and MN DHS** is neither.
It is from a funding template published by **AAC Funding, which is the funding arm
of PRC-Saltillo** (Prentke Romich + Saltillo) — a competing AAC device
manufacturer. Verified verbatim from the retrieved PDF:

> "Provide a minimum of 10 different medically relevant messages the client
> demonstrated, including the information outlined in chart below."

> "Environments in which the SGD was used. At least one needs to be outside the
> school setting **if possible** (and 3 different settings if possible)."

<https://aacfunding.com/assets/uploads/Addendum_Sample_for_Recommending_Purchase_following_Device_Trial.pdf>

Confirmed **absent** from every payer document retrieved: L33739, A52469, NY 2012,
NY current, MassHealth MNG-AAC, MN DHS, North Dakota DHHS, and ASHA. Note the
vendor's own hedge — *"if possible"* — which we had hardened into a requirement.

**Important refinement — the FIELDS are payer-required; only the FLOOR is not.**
Current NY explicitly requires the message data be reported, under 4(g)(iv):

> "8) Sampling of multiple messages communicated including the frequency, type
> (e.g. verbal, physical, gesture), and level of cueing required.
> 9) **Number of messages expressed in a time period** including the type and level
> of cueing required.
> 10) Communicative intents and functions expressed."

So NY wants the count, the functions, the cueing level and the environments
**reported** — it simply sets **no minimum**. That is the defensible framing, and it
means our capture fields are well-founded even though ">=10" is not. Report the
number; do not assert a threshold.

**What payers DO put numbers on** — duration and alternatives, never messages:

| Payer | Published number |
|---|---|
| Oklahoma OHCA | "At least three different devices/systems must be tried and discussed" |
| North Dakota HHS | "at least three dedicated speech generating devices, by more than one manufacturer" |
| Superior HealthPlan (TX Medicaid MCO) | trial period ">= 30 days" |
| MassHealth (130 CMR 409.428) | "A trial-use period of **not more than** two months" |

Note MassHealth's is a **ceiling**, not a floor — the opposite of how a minimum
reads. Do not collapse these into "payers require a trial of N."

Keep the capture fields; they are clinically sensible and they satisfy the
data-driven-trial language payers do use. But attribute them as **our convention
informed by a vendor template**, never as a payer mandate. ASHA is directly on
point: vendor templates *"do not take the place of a comprehensive AAC
evaluation."*

### 12.2 A real published number, which we did not have [VERIFIED]

**North Dakota HHS**, DME Manual, Speech Generating Device (eff. March 2007, rev.
December 2025):

> "Assessment of the member on **at least three dedicated speech generating
> devices, by more than one manufacturer**, and document why the requested devices
> are more appropriate than the other devices."

<https://www.hhs.nd.gov/sites/default/files/documents/DME/policy-speech-generating-device-exclusion.pdf>

So the published threshold in this space is **three devices across more than one
manufacturer** — not ten messages. NY's §4(g)(iii) multi-manufacturer rule is the
same idea. ASHA corroborates the shape while keeping it payer-attributed: *"A payer
**may** require that an SLP consider multiple SGDs… not from the same manufacturer
or product line."*

### 12.3 Face-to-face encounter + Written Order Prior to Delivery — MISSING [VERIFIED]

The most consequential gap found, because it denies a claim that satisfies every
other requirement in this document. From A52469, verbatim:

> "Final Rule 1713 (84 Fed. Reg Vol 217) requires a **face-to-face encounter and a
> Written Order Prior to Delivery (WOPD)** for specified HCPCS codes… Claims for
> the specified items… that do not meet the face-to-face encounter and WOPD
> requirements specified in the LCD-related Standard Documentation Requirements
> Article (**A55426**) will be denied as not reasonable and necessary. **If the
> WOPD is not obtained prior to delivery, payment will not be made for that item
> even if a WOPD is subsequently obtained** by the supplier."

**E2511 is on the Final Rule 1713 code list**, so this binds us. Neither the §3
spine nor the workbook mentions it anywhere.

One correction to a widely-repeated claim, including on ASHA's own Medicare SGD
page: the requirement is **not in the LCD**. Grepped `l33739.txt` — `face-to-face`
**0**, `Written Order Prior` **0**. It lives in A52469 (6 hits) and A55426 (26).
Cite the articles, not the LCD.

### 12.4 MN DHS is now sourced — and it does not say what we said [VERIFIED, one caveat]

Previously `[UNSOURCED]`. The document is **MHCP Provider Manual → Rehabilitative
Services → "Augmentative Communication Devices," MN DHS, revised August 10, 2023**,
<https://www.dhs.state.mn.us/dhs16_156515/>. Statutory authority: Minn. Stat.
256B.0625 subd. 31/31a; Minn. R. 9505.5010–9505.5030. Companion form: DHS-4535.

| What we claimed for MN | Verdict |
|---|---|
| Explicit evaluation of each device tried + effectiveness | **SUPPORTED**, verbatim |
| Environments | **SUPPORTED** — school, home, community, vocational, work, social |
| Trial dates | **SUPPORTED** |
| Speed and accuracy | **SUPPORTED, but mis-scoped** — see below |
| Communication partners | **NOT FOUND** — "partner" appears once, in site navigation |
| >=10 distinct messages | **NOT FOUND** — no numeric threshold anywhere |
| 2-year horizon | **NOT FOUND** |

The speed/accuracy scope caveat matters: MN's text is *"Detailed description of the
member's ability to use the **proposed** device, including speed and accuracy"* —
written about the recommended device, **not** as a per-trial metric captured for
every device tried, which is how this file used it. (DHS-4535 itself contains zero
occurrences of "speed" or "accura*".)

Also worth knowing: the **statute contains no evaluation requirements at all**.
256B.0625 subd. 31a is coverage and pricing only. Cite the manual, never the statute.

✅ **Proxy caveat RESOLVED 2026-08-25.** An earlier pass could only reach MN through
a public CORS proxy (dhs.state.mn.us sits behind Radware bot protection) and this
section carried a warning to re-pull before relying on it. A **direct primary** was
then located and retrieved successfully — HTTP 200, a real 29-page PDF, no proxy:

> MHCP Provider Manual, Rehabilitative Services, **Chapter 17**, MN DHS
> <https://www.dhs.state.mn.us/main/groups/manuals/documents/pub/dhs_id_009046~12.pdf>

Both MN quotes are confirmed against it verbatim:

> "An explicit evaluation of each augmentative communication device or method of
> communication tried by the recipient and information on the effectiveness of each
> device."

> "A detailed description of the recipient's ability to use the **proposed** device,
> including **speed and accuracy**."

`communication partner` = **0** in the direct PDF, so the partner requirement is
confirmed *not* MN's against a primary source rather than a proxied one.

⚠️ One more grep trap, same family as §0a's. Searching this PDF for the literal
string `speed and accuracy` returns **NOT FOUND**, while searching `speed` and
printing the surrounding text shows the phrase plainly. The extracted text carries
a line break or non-breaking space between the words. **Normalise whitespace before
matching a multi-word phrase** (`' '.join(text.split())`), or a real quote will read
as absent.

### 12.4a How the misattribution happened — the contamination vector [VERIFIED]

Worth recording, because it explains the whole failure and it will happen again to
whoever writes the next version of this file.

**Tobii Dynavox** — an AAC device manufacturer — publishes a PDF whose header reads:

> "MINNESOTA MEDICAL ASSISTANCE CRITERIA FOR AUTHORIZATION — **Reprinted from
> Minnesota Medicaid Provider Manual Chapter 17** — Updated 5/2020"

<https://download.mytobiidynavox.com/Funding%20Documents/MN%20MA%20Criteria%20for%20Authorization.pdf>

It presents as a reprint of state policy. Genuine MN bullets sit directly adjacent
to **vendor commentary**, distinguished only by a leading `**` that is easy to miss
and trivially lost on copy-paste. Retrieved and verified 2026-08-25:

> "\*\*Device use trialed in **various environments with various partners** are
> **preferred, but not always necessary**, and the client's situation is taken into
> account."

> "For children, they can trial **snap+core** on an iPad…"

`snap+core` is a Tobii Dynavox product. So a document that looks like a state
manual recommends the publisher's own software by name.

Two things follow, and both describe errors this file actually made:

1. **The environments-and-partners requirement we attributed to MN DHS is the
   vendor's gloss, not the state's** — the state text lists only situational
   contexts (school, home, community, vocational, work, social) and never uses
   "communication partner" at all.
2. **The vendor's own sentence says "preferred, but not always necessary."** We
   promoted a vendor's soft preference into a state mandate — the same hardening
   that happened to PRC-Saltillo's "if possible" in §12.1.

**Rule going forward: never cite a payer requirement from a device manufacturer's
"reprint."** Both misattributions in this file came through vendor documents that
looked authoritative. Retrieve the payer's own document, from the payer's own
domain, or mark the claim `[UNSOURCED]`.

### 12.5 ASHA — the caveat we dropped changes the meaning [VERIFIED]

The 13 "Typical Components" are cited correctly on count and substance, but the
lead-in sentence this file omitted is the one that governs them:

> "Many components of the comprehensive assessment may already be documented in an
> individual's records (i.e., medical or school records). **The components listed
> below may be completed if not addressed in these records.**"

ASHA says *may*, conditioned on the existing record. Presenting the 13 as a
mandatory checklist is contradicted by ASHA's own sentence. Also note the Practice
Portal page is **undated** — ASHA's own recommended citation is `(n.d.)`. A dated,
citable alternative exists and this file should prefer it: **ASHA (2004), Preferred
Practice Patterns for the Profession of Speech-Language Pathology, §26 AAC
Assessment**, doi:10.1044/policy.PP2004-00191 — actual ASHA *policy*, with a
`Documentation` heading.

**What ASHA does mandate, and it backs our §19:** SLPs *"**must disclose** any
financial relationships that they have with device manufacturers and **must
certify** that their recommendation… is not due to any financial incentive."*

**Two claims this file makes that ASHA supports harder than we knew:**
- *"Medicare does not require a trial or rental period"* — grepped L33739: `rental`
  **0**; `trial` **1**, and that one is "clinical trial information" in boilerplate
  about evidence, not a device trial. This claim is solid.
- *"Feature matching is not empirically validated"* — the Feature-Matching block is
  the one substantive section on ASHA's page carrying **zero citations** while
  everything around it is cited, and the chart it links sits under a heading
  stating *"inclusion… does not imply endorsement from ASHA."* Cite ASHA for what
  feature matching *is*; never for it being evidence-based.

### 12.6 "ASHA CCC #" — not Medicare's rule, but Molina's [VERIFIED]

Medicare's statutory definition, 42 U.S.C. 1395x(ll)(4)(A), requires a master's or
doctoral degree and **state licensure** — not the CCC. L33739 contains `ASHA` **0**
times and `certificate of clinical` **0** times. Current NY requires *"A licensed
Speech Language Pathologist (SLP) experienced in AAC service delivery."* The CCC
requirement appears only in **vendor** material.

⚠️ **Corrected 2026-08-25, same day — the claim above is too strong as written.**
"Not required by any payer" is right for **Medicare** and wrong in general. Two
counter-examples, both verified verbatim:

- **Molina Clinical Policy 445** requires it outright: *"A speech evaluation is
  conducted by a speech language pathologist who is licensed in the state where the
  services are being performed **and who is certified by the American
  Speech-Language-Hearing Association**."*
- **42 CFR 440.110(c)(2)**, the *Medicaid* definition, lists the CCC as **one of
  three** qualifying paths (the others being equivalent education + work experience,
  or completing the academic program while acquiring supervised experience).

The precise statement: Medicare routes to 42 CFR 484.115(n), which requires a
master's/doctoral degree **plus state licensure** and never mentions the CCC; some
Medicaid and MCO policies do require or accept it. In every case it is a **provider
-qualification** rule, not a report field — but a report that omits it can still
strand an SLP against Molina.

**So keep the field.** The original conclusion (make it optional) survives for the
right reason: it is not universally required, not that no one requires it. Do not
present it as mandatory, and do not remove it.

This touches shipped code: `asha_ccc` is collected in
[eval_workbook.js:78](app/frontend/app/utils/eval_workbook.js#L78). It should be
**optional**, not presented as a payer requirement. Not changed here — flagged.

### 12.7 School mode: right citation, three wrong characterisations [VERIFIED]

**34 CFR 300.6(a)** is real but is a **definition, not a mandate** — it defines what
the term "assistive technology service" *includes*. The operative duty is
§ 300.105(a), which runs to the public agency. It is also singular — *"the child's
customary **environment**"* — and the phrase appears nowhere in § 300.304,
§ 300.320, or § 300.324.

Two school-mode requirements this file omits entirely, both from OSEP's January 2024
guidance and both real:

- **Parental consent.** *"If an IEP Team determines that an AT evaluation is needed,
  **consent must be obtained from the parent** prior to conducting the evaluation."*
- **Language of assessment.** § 300.304(c)(1)(ii) requires assessments be *"provided
  and administered in the child's native language or other mode of communication"* —
  directly on point for an AAC evaluation.

On goals, this file is **correct on both halves**: § 300.320(a)(2)(i) requires
*"measurable annual goals"* and (a)(3)(i) requires describing *how* progress will be
measured; the words "percent" and "trial" appear nowhere in § 300.320. The 2006
preamble (71 FR 46540 at 46662–63) reinforces it: *"The Act does not require goals…
to have outcomes and measures on a specific assessment tool."*

The brand-naming correction is at §2 and in
[eval-full-report.js](app/frontend/app/components/eval-full-report.js#L113).

### 12.9 "Feature match": no payer names it — 23 documents checked [VERIFIED]

The commercial-payer gap is **closed**. The literal string `feature match` /
`feature matching` appears **zero times** across 23 retrieved payer and regulatory
documents: Medicare (L33739, A52469), ten commercial policies, and eleven
Medicaid/MCO policies — Aetna CPB 0437, Cigna 0049, Anthem CG-DME-07, Molina 445,
BCBS NC/TX/SC, Premera, Kaiser NCAL, UHC Community Plan AZ, CareSource OH, Superior
HealthPlan TX, Oklahoma OHCA, Colorado HCPF, WA HCA (including its own 14-page SLP
evaluation **form**, HCA 13-0127), AHCCCS, and 130 CMR 409.428.

**What payers say instead.** Five copy Medicare's sentence nearly verbatim.
Spot-checked directly against Aetna CPB 0437 (147 hits for "speech", so extraction
is sound; `feature.?match` = **0**):

> "…Rationale for selection of a specific device and accessories; and A copy of the
> SLP's written evaluation and recommendation have been forwarded…"

**The concept survives; only the vocabulary differs.** UHC Community Plan AZ
requires that *"the recommended device or software **matches the cognitive and
physical capabilities** of the member"*; CareSource OH requires an itemised feature
checklist (symbols, encoding, access techniques, keyboard organisation, outputs,
portability); Colorado HCPF requires the SLP determine *"the AACD **features**
necessary"* and trial *"a **minimum of three (3) devices**"* — another entry for the
numeric table above.

**The sharpest evidence is ASHA's own behaviour.** ASHA names feature matching
three times in the clinical Practice Portal, including as a section heading, then
**drops the term from both of its payer-facing documents** — the Medicare SGD page,
and the *Speech-Language Pathology Medical Review Guidelines*, which ASHA writes
**for payers**. Verified directly: **512** occurrences of "speech" in that PDF,
**0** of feature matching. ASHA does not treat it as a payer requirement either.

**Its origin is weaker than the field's usage implies:** Shane & Costello (1994) is
a **conference mini-seminar**, not a peer-reviewed publication, and ASHA's own
Practice Portal reference list does not cite it despite using the term as a
heading. Gosnell, Costello & Shane (2011) — the usual modern citation — describes
itself as offering *"a clinical framework"* and explicitly disclaims being a
comprehensive review; *Perspectives* was not peer-reviewed until 2017.
Independently reinforces §6.

**The defensible sentence**, for anyone writing this claim again:

> Feature matching is a clinical best-practice term originating in a 1994 ASHA
> conference mini-seminar and codified in ASHA's Practice Portal. No payer policy
> reviewed — Medicare, ten commercial, eleven Medicaid/MCO — uses the term. Payers
> instead require the "rationale for selection of a specific device and any
> accessories," which is the documentation feature matching produces.

Residual holes, which are real: **UnitedHealthcare's commercial SGD policy** could
not be read (the Oxford PDF 404s; that library was retired 2026-01-01) — a top-3
payer with no direct read. MassHealth's medical-necessity *guidelines* page, AZ
DES/DDD 310-PP and Mercy Care AZ all 403'd. TX TMPPM, CA Medi-Cal, PA DHS, WI
ForwardHealth and OR OHA were never checked. **Unread is not negative.**

#### 12.9a The term payers actually use: **LCEEA** [VERIFIED]

A separate sweep of ASHA, five vendor sites and the academic chain reached the same
verdict independently, and supplied the piece §12.9 was missing — **what the payer
test is actually called.**

**Least Costly Equally Effective Alternative (LCEEA).** This is the standard feature
matching exists to satisfy, and it is the vocabulary to write in. A representative
coverage policy (Fallon Health) states it as:

> "…not more costly than an alternative that is at least as likely to produce
> equivalent therapeutic results… **Documentation must show that all least costly
> alternatives have been considered and ruled out** before funding of an SGD will be
> authorized."

That is the same idea as NY's 18 NYCRR 513.4(d) and Medicare's "rationale for
selection," and it is what §2's least-costly-alternative row should point at.

**Not one of five AAC vendors claims a payer requires feature matching.** Three use
the term (Forbes AAC heavily, Talk To Me Technologies, PRC-Saltillo); two do not use
it **at all** — Tobii Dynavox (all 29 funding/eval PDFs clean, including three state
Medicaid evaluation templates) and Lingraphica (466 pages, zero hits). The single
vendor page that places feature matching beside a payer test names that test as
**LCEEA**, and sources the feature-matching link to a **disability-benefits
attorney**, not to a coverage policy. Given vendors' commercial interest in
maximising the paperwork burden's apparent authority, their collective silence here
is meaningful.

**A third ASHA artifact lacks the term**, alongside the two in §12.9: ASHA's own SGD
Evaluation Template. Its footers are worth knowing — it is authored by *University
of Michigan*, derived from *"AAC-RERC website… Information obtained on 6/6/08"*, and
self-disclaims: *"Information included in these templates does not represent
official ASHA policy."*

**The citation chain is short and self-referential.** Shane & Costello (1994) is
unrefereed, has no published proceedings, no DOI, and **no retrievable text** — it
cannot be read today by anyone. Every modern use is a citation-to-a-citation. Two of
the three authors of the 2011 paper that anchors the term (Costello, Shane) *are the
two people who gave the 1994 mini-seminar*. And *Perspectives on AAC* is an ASHA
Special Interest Group periodical — editorially reviewed, **not** the peer-reviewed
journal *Augmentative and Alternative Communication*, and not peer-reviewed at all
until 2017.

None of this makes feature matching bad clinical practice — it is a sensible method,
and §6 already says the honest thing. It does mean the evidentiary base is thinner
than the field's confidence in it, and that **"required by payers" is not a claim
anyone can support.** Which edition of Beukelman & Mirenda first uses the literal
term is **[UNSOURCED]** — do not assert one without checking a copy.

### 12.10 Primary language is a COVERAGE CRITERION — and our spine has no field for it [VERIFIED]

The most actionable omission found, and the one closest to home for a product that
ships in multiple locales. Two payers make the user's language a condition of
coverage, both verified verbatim:

> **Molina Clinical Policy 445**, criterion 5: *"A SGD is **available in the
> Member's primary language** and is being requested as a dedicated device…"*

> **Cigna Coverage Policy 0049** (eff. 2026-01-15): *"A speech evaluation, conducted
> by a speech-language pathologist, has documented the severity of the individual's
> disability, **specific to their primary language**."*

ASHA agrees on the clinical side — *"The assessment should be conducted in the
language(s) needed by the AAC user"* — and warns that *"if the AAC system does not
support all of the individual's language(s), they may be unable to communicate in
the home, and carryover will be limited."* Its SGD template carries a header field,
**"Primary languages spoken:"**. IDEA independently requires assessment *"in the
child's native language or other mode of communication"* (§ 300.304(c)(1)(ii)).

**The §3 spine has no language field anywhere.** A report built from it can satisfy
Medicare completely and be **denied by Molina or Cigna**. This is the second
denial-causing gap in this section, alongside F2F/WOPD (§12.3), and unlike that one
it is trivially cheap to close: one field, captured once.

### 12.11 Where our spine came from: an orphaned 2004 protocol [VERIFIED]

The keystone provenance finding. Our §3 spine's medical half is not something we
composed — it descends, section for section, from one document:

> **"Medicare Funding of AAC Technology — Assessment/Application Protocol"**,
> Medicare Implementation Team (Lewis Golinker Esq., David Beukelman, Sarah
> Blackstone, Frank DeRuyter, Melanie Fried-Oken and others), hosted by the
> **AAC-RERC** (a consortium including Penn State, Nebraska-Lincoln, Duke,
> Children's Hospital Boston, OHSU, SUNY Buffalo). Footer: **"Updated 11/20/04."**

Its eight sections are our spine: I Demographic · II Current Communication
Impairment · III Daily Communication Needs · IV Functional Communication Goals ·
V Rationale for Device Selection · VI Treatment Plan · VII Functional Benefit of
Upgrade · VIII SLP Assurance of Financial Independence and Signature.

**Three consequences, and each closes a question left open above.**

**1. This is where `asha_ccc` came from.** §VIII's field list, retrieved verbatim
from the archived page:

> "Evaluating SLP name · **ASHA Certification #** · State License # · Disclaimer
> statement"

So the field is not invented and not a vendor's — but its source is a 2004
volunteer-panel protocol, which is a much weaker warrant than "a payer requires
it." Combined with §12.6 (Molina does require the credential; Medicare wants state
licensure), the resolution stands: **keep the field, make it optional.**

**2. The protocol is orphaned and predates the current LCD.** `aac-rerc.psu.edu`
now 301s to a host that 404s every page; it survives only in the Internet Archive.
It is dated **2004** and built on the **RMRP** — the instrument **superseded by LCD
L33739 in October 2015**. That is the same superseded RMRP the vendor templates in
§12.1 cite. So *two independent lineages* in this file — the vendor per-trial rules
and our own section spine — both trace to policy retired over a decade ago. Golinker
himself now points readers to the live LCD instead.

**3. It explains the §2 medical/school fork better than §2 currently does.** The
sharpest divergence between the two traditions is **low-tech backup**, and the two
sources give opposite instructions. AAC-RERC, because Medicare pays only if nothing
cheaper suffices, requires you to **rule low-tech out**:

> "The report should state, 'The patient's daily functional communication needs
> cannot be met using natural communication methods or low-tech/no-tech AAC
> techniques because of ______ (be specific).' … Show explicitly that other forms of
> treatment have been considered and ruled out."

WATI (Wisconsin's AT initiative, the school-side authority) requires the opposite:

> "Even when a student has a 'high tech' communication device/system, **a low-tech
> back-up system should always be in place.** … When a student's device is sent to
> the company for repairs, it may be unavailable for weeks."

Both are right for their payer. This is a genuine fork, not a style difference, and
§2 should carry it: **medical mode rules low-tech out; school mode plans for it.**
Note AAC-RERC's own wording — *"in addition to, or instead of low-tech strategies"* —
leaves room for coexistence, so the medical framing is "insufficient alone," not
"must not exist."

**Two smaller corrections from the same sweep:**

- **SETT is "Environments," plural — but only since 2005.** Zabala's original 1995
  paper (ERIC ED381962) uses singular section headings, *"The Environment"*; the 2005
  revision states *"SETT is an acronym for Student, **Environments**, Tasks and
  Tools."* Cite the 2005 form. Zabala is explicit that *"SETT is a FRAMEWORK, not a
  protocol requiring a specific set of implementation practices for validity"* — so
  it cannot be cited as a required report format.
- **Partner training has a real mandate, just not an American one.** RCSLT Guideline
  14: *"**Ensure that partner training forms part of any AAC intervention plan.**"*
  WATI makes it a required cell of its AAC Decision Making Guide. AAC-RERC does
  **not** require a partner-training section — which is why our medical spine lacks
  one.

### 12.12 Still open

- ~~Commercial payers unchecked~~ — **closed by §12.9**: 23 documents checked,
  `"feature match"` NOT FOUND in any. Residual holes named there: **UHC commercial**
  (404, a top-3 payer), MassHealth guidelines, AZ 310-PP, Mercy Care AZ, and five
  states never checked (TX, CA, PA, WI, OR). Unread ≠ negative.
- **No primary-language field in the spine** (§12.10) — a coverage criterion for
  Molina and Cigna. Cheapest denial-causing gap here to close.
- **MN via browser** — see the proxy caveat at 12.4.
- **The F2F/WOPD gap** (12.3) is unrepresented in the spine and the workbook. It is
  the only gap here that costs a real user a real denial.
- **`asha_ccc`** (12.6, 12.11) is still presented as a requirement in the workbook.
  Resolution is settled — keep it, make it optional — but the code is unchanged.
- **§2 does not carry the low-tech fork** (12.11): medical mode must rule low-tech
  out, school mode must plan for it. Opposite instructions, both correct.
- **Our spine descends from a 2004 protocol built on the superseded RMRP** (12.11).
  Nothing in it is *wrong* on inspection, but it has never been reconciled against
  L33739 section by section. That reconciliation is the real follow-up.

