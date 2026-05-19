# Findings & Remediation: Imported (CoughDrop/competitor) boards lose skin‑tone, preferred‑symbols, and transparent backgrounds

Status: investigation complete, remediation proposed (not yet implemented)
Scope: backend (converters, `ButtonImage`, workers, OpenSymbols integration) + a one‑time data backfill
Audience: backend/platform team

> ## 📌 2026‑05‑18 forensic conclusion (git + DB evidence) — read this first
>
> A full git‑history + live‑DB forensic pass settled two **independent**
> problems that were being conflated as "skin tone broke":
>
> ### 1. White box behind symbols — a CSS regression, now FIXED
> - **Cause:** commit **`18a3ad032`** (2026‑05‑04, Melissa O, PR #238
>   "sample speak mode board for landing page") deleted, as collateral
>   in a landing‑page PR, the two rules
>   `.symbol_background_clear .md-board-detail-symbol-card__image img { mix-blend-mode: multiply; }`
>   and the classic twin `.symbol_background_clear .button img.symbol { … }`
>   from `app/frontend/app/styles/app.scss`. `multiply` is what made the
>   white‑baked background of symbol assets transparent over the colored
>   Fitzgerald card. The rule was **introduced 2026‑04‑05 (`1ceed4bd1`)**,
>   so the working window was **2026‑04‑05 → 2026‑05‑04**.
> - **Scope:** `18a3ad032` is in `traci/styling/styling-updates` **and**
>   `origin/staging` (both broke 2026‑05‑04). It is **NOT** in
>   `origin/main` or `origin/fix/vocab-and-button-image-staging` (still
>   working there, ~line 6837). This is why staging "worked at one point
>   then stopped" with the same boards.
> - **Fix applied (this branch, uncommitted):** both `mix-blend-mode:
>   multiply` rules restored verbatim from `origin/main`, each before its
>   surviving `[src$="square.svg"] { mix-blend-mode: normal }` override.
>   `583315b1c` (2026‑05‑17, holder `background: transparent`) was a
>   partial fix that did not restore the `img` blend. **Note:** staging
>   stays broken until this lands there or `18a3ad032`'s deletion is
>   undone — coordinate so PR #238's CSS deletion isn't re‑introduced.
>
> ### 2. Skin tone not applied — NOT a code regression; data/import
> - The frontend skin pipeline (`is_skinned_url`, `skinned_url`,
>   `skin_image_map`, `which_skinner` in `board.js`; `personalize_url`
>   in `image.js`; `_make_btn`/`_rebuild_on_pref_change` in
>   `board-detail.js`) is **byte‑identical across HEAD, origin/main,
>   origin/staging, the fix/*-staging branches**, introduced 2022
>   (`b3a891582`) and never behaviorally changed. **No skin‑tone code
>   regression exists on any branch.**
> - Skin tone is applied **only** by client‑side URL rewriting: it fires
>   only when the served URL is a server‑generated `*.varianted-skin.*`
>   (or twemoji `-var…UNI`) URL. `ButtonImage#check_for_variants`
>   (`button_image.rb:221‑247`) only produces that when
>   `url =~ /\/libraries\//`.
> - **DB evidence (live, this fork):** the seeded boards come from
>   `rake openaac:import_vocabularies` (`lib/tasks/openaac.rake`, added
>   2026‑02‑09 `b25161c91`) importing `.obz` files — **not** `db/seeds.rb`.
>   `communikate-home` (`1_2848`): all 18 ButtonImages **created
>   2026‑03‑12 23:17 UTC**, every one plain
>   `lingolinq-uploads.s3…/images/…`, `library=nil`, `external_id=nil`,
>   no `varianted-skin`, `checked_for_variants=nil`. `core-112-feel`
>   (`1_197`): all 98 ButtonImages **created 2026‑03‑12 21:36 UTC**,
>   identical plain profile. **No older/orphaned `/libraries/` rows for
>   these lineages exist** — there is no DB record of a prior good state
>   a re‑seed overwrote. They were **born plain and never skinnable on
>   this fork's DB.**
> - **Why plain:** OBZ bundles images as zip entries; the `obf` gem
>   base64‑embeds them and the converter
>   (`lib/converters/lingo_linq.rb:340‑368`) does `item.delete('url')`
>   then re‑uploads as a plain S3 file, discarding the original
>   `/libraries/` URL + `external_id`. This block is **byte‑identical to
>   the original pre‑rename CoughDrop converter**
>   (`git show b25161c91~1:lib/converters/cough_drop.rb`); the 2026‑02
>   commits were pure file renames. So this is **original CoughDrop /
>   obf‑gem behavior, not a LingoLinq regression** — upstream CoughDrop
>   importing the same `.obz` the same way would also lose skin tone.
> - Skin tone **does** still work on this fork for images inserted via
>   the in‑app OpenSymbols picker: the live DB has **97 `/libraries/`
>   images and 31 working `varianted-skin` URLs** (e.g.
>   `…/libraries/arasaac/I.png.varianted-skin.png`). It is broken **only
>   for OBZ‑imported boards**, always was.
> - **"It worked with these boards at one point" =** seen on CoughDrop's
>   hosted service (native `/libraries/`‑backed images; the reference
>   screenshot was literally `app.mycoughdrop.com`), and/or on this fork
>   for picker‑inserted symbols — never for these OBZ‑imported board
>   keys on this fork's DB.
> - **The only real fix** is the import‑path enhancement (R1/R2 below):
>   the converter must preserve the OBF `images[]` original library
>   `url`/`external_id`/`library_alternates` (skip the base64 re‑upload
>   when the URL is `/libraries/`‑resolvable) so `check_for_variants`
>   can produce skinnable URLs, plus a one‑time backfill of the seeded
>   boards. **Not a frontend/CSS change.**
>
> Net: the white‑box fix (CSS) and skin‑tone (backend import) are
> separate. The CSS regression is fixed on this branch; skin tone for
> OBZ‑imported boards requires the backend converter/backfill work.

> ## ⚠️ Re-evaluation update (verified, no assumptions) — read this first
>
> A second, assumption-free pass against the live DB + runtime found the
> **dominant user-visible symptom is NOT the skin-tone/OBF code path** this
> doc originally centered on. Proven facts:
>
> - The seeded boards' `ButtonImage` records have `settings['url']` = **nil**,
>   `checked_for_variants` = **nil**; `bi.url` resolves to the **raw private**
>   `https://lingolinq-uploads.s3.amazonaws.com/<full_filename>` key.
> - `json_api/image.rb:12` serves `image.best_url`, so the browser loads
>   `<img src="…lingolinq-uploads.s3.amazonaws.com/…">` **cross-origin**.
> - `curl` of that exact URL returns **HTTP 403 Forbidden, Content-Type:
>   application/xml** (`<Error><Code>AccessDenied`). Chrome therefore
>   CORB-blocks every such response → the **538 CORB issues**, and the
>   symbols **fail to load entirely** (not "render white via CSS holder" as
>   §1–§2 below imply).
> - `Uploader.fronted_url` only rewrites to a CDN when `ENV['UPLOADS_S3_CDN']`
>   is set; the normal upload path sets `acl: 'public-read'`
>   ([uploader.rb:159](../lib/uploader.rb#L159)). These objects 403 anonymously
>   → they are **not public-read** (bad ACL) **or do not exist in the bucket
>   this environment points at** (DB seeded/copied without the S3 assets).
> - No non-library `lingolinq-uploads` image with a populated `settings['url']`
>   exists in the recent records — consistent with "dev DB references assets
>   that aren't accessible in dev."
>
> **Implication:** the primary problem is an **S3 object accessibility /
> data-seeding / environment** issue, not a converter or front-end code
> defect. The OBF-namespace + skin-variant analysis below is still correct
> **for the skin-tone & preferred-symbols sub-problem**, but fixing it will
> NOT make these symbols load or clear CORB — that requires the image bytes
> to be publicly retrievable (correct ACL, or correct bucket/CDN, or the
> assets actually present in this environment).
>
> **Hard verification blocker:** S3 object existence/ACL could not be
> confirmed from this environment — no usable AWS credentials (1Password not
> signed in; the plaintext key in `.env.op.local` is rejected
> `InvalidAccessKeyId`). Determining the exact remediation (re-ACL vs
> re-upload vs re-seed vs point dev at a populated bucket vs set
> `UPLOADS_S3_CDN`) requires S3 access or seeding details from the team.
> Implementing R1/R2 below now would (a) not fix the reported symptom and
> (b) rest on unverified assumptions — explicitly out of scope until the
> S3/seeding question is answered.
>
> **Two separable problems, ranked by user impact:**
> 1. **(Primary, unverifiable here)** Seeded images 403 → broken symbols +
>    CORB. Infra/data, AWS-side. Needs team/S3 access.
> 2. **(Secondary, code, verifiable)** Even with bytes accessible, skin-tone
>    & preferred-symbols stay broken for foreign imports — that is the
>    converter/variant story below (R1/R2/R3), and is the only part fixable
>    purely in this repo.

---

## 1. Symptom

On boards imported from CoughDrop (e.g. the seeded **CommuniKate** boards — "built with CoughDrop"):

- The **Colored / Colored‑Soft** symbol background shows a white box behind each
  symbol instead of the button's Fitzgerald colour.
- **Skin‑tone** preference has no effect on those symbols.
- **Preferred‑symbols** (swap symbol library) has no effect.

This is **not** a CSS bug and **not** specific to the new board‑detail page —
board‑alt has the same underlying data and only masks it with a fixed opaque
`#e8f5f4` image band (`.board .button .img_holder { background:#e8f5f4 !important }`).

## 2. Evidence (verified this investigation)

**The imported images have no library/variant metadata.** For
`marcus_williams_slp/communikate-more-action-words` (BoardContent‑backed;
`b.buttons` → 20 buttons, all with real `image_id`s), the resolved
`ButtonImage` records have:

```
library = nil      external_id = nil      protected = nil
settings keys = [pending, license, data_uri, content_type, width, height,
                 pending_url, full_filename (, rasterized for the svg)]
# no `skin`, no `variants`, no `alternates`, no `checked_for_variants`
url = https://lingolinq-uploads.s3.amazonaws.com/images/...   # plain upload, NOT a library CDN, NOT *.varianted-skin.*
```

Contrast — properly library‑sourced images sampled from the same DB
(`d18vdu4p71yql0.cloudfront.net/libraries/arasaac/…`, `…/mulberry/…`) are
transparent and variant‑capable (ARASAAC PNG corner alpha = 0; Mulberry SVG
background `fill:none`). So transparency is a property of *library‑sourced*
assets; the CommuniKate uploads are bare copies.

## 3. Root causes

### 3a. Skin‑tone is a server‑generated URL, never carried in OBF/OBZ
Skin tone is applied purely by URL rewriting on the client:
`Image.personalize_url` → `LingoLinq.Board.skinned_url`
([app/frontend/app/models/board.js#L1759](../app/frontend/app/models/board.js#L1759)).
It only rewrites the URL when `is_skinned_url()` is true — i.e. the `url`
already ends in `.varianted-skin.{png|svg}` (or is a twemoji `-var…UNI` URL).
Otherwise it returns the URL unchanged and **skin tone silently does nothing**.

That `*.varianted-skin.*` URL is manufactured **server‑side** by
`ButtonImage#check_for_variants`
([app/models/button_image.rb#L221](../app/models/button_image.rb#L221)), which
analyses the image for skin regions and writes raster variant files into *this
platform's* storage. OBF/OBZ only carries one base `url`/`data` + `license` per
image. So skin variants are **never imported from anyone** (true even
CoughDrop→CoughDrop) — the importing server must regenerate them, which only
reliably succeeds for images recognised as library/OpenSymbols symbols.

### 3b. The fork renamed the OBF extension namespace with no compat reader
OBF's *standard* image object is only `id, url/data/path, width, height,
content_type, license`. Everything else — `protected`, `protected_source`,
`external_id`, `library`, `alternates` — is a platform **extension**
(`ext_<platform>_…` per the OBF spec). CoughDrop emits `ext_coughdrop_*`.
LingoLinq's converter reads/writes **only `ext_lingolinq_*`**
([lib/converters/lingo_linq.rb](../lib/converters/lingo_linq.rb) — e.g.
`item.key?('ext_lingolinq_protected')`, `ext_lingolinq_protected_source`,
`ext_lingolinq_unskinned_url`; no `ext_coughdrop_*` anywhere, only a fallback
to the bare standard field). So a CoughDrop export's extension metadata is
silently dropped on import even though the runtime engine is forked from
CoughDrop.

### 3c. `external_id`/`library`/`alternates` are not standard OBF
Even with 3b fixed, these are platform‑local. Cross‑platform they are lost, so
preferred‑symbols (`alternates.find(a.library == preferred_symbols)`,
[image.js#L100](../app/frontend/app/models/image.js#L100)) and library
re‑fetch/variant regeneration have nothing to work from.

### 3d. Copy is fine; import is the only lossy path
Board **copy** uses `relinking.rb` → BoardContent **copy‑by‑reference**
(`copy_and_relink`), reusing the original `ButtonImage` records — all
attributes preserved. Copy never degrades images (it also can't repair a bad
original). The defect is import‑only.

## 4. Attribute contract — what a `ButtonImage` needs for every preference

| Attribute | Enables | Notes |
|---|---|---|
| `url` as `*.varianted-skin.{ext}` (or twemoji `-var…UNI`) | **Skin tone** | Server‑generated via `check_for_variants`; the linchpin |
| `alternates` / `library_alternates` (`[{library,url}]`) | **Preferred symbols** | |
| `library` + `external_id` | Library re‑fetch, OpenSymbols usage, variant regen | |
| `protected` / `protected_source` (+ `fallback`) | Premium sets (PCS/SymbolStix/LessonPix) + graceful degrade | |
| `license` | Attribution / compliance | |
| `hc` | High Contrast (skip double filter) | |
| `content_type`, `width`/`height`, SVG raster | Layout, rasterisation, variant gen | |
| Asset bytes transparent (no baked white) | **Colored / Colored‑Soft bg** | Property of library‑sourced assets |

## 5. Remediation (layered, by impact/risk)

### R1 — Importer namespace compatibility shim *(quick win, low risk, converter‑local)*
In `lib/converters/lingo_linq.rb`, alias foreign extension namespaces to the
internal params before `process()`: `ext_coughdrop_protected` → `protected`,
`ext_coughdrop_protected_source` → `protected_source`, etc., then fall back to
the bare standard OBF field. Generalise to a small alias table for other known
platforms. CoughDrop is AGPL (same licence as us) — read their OBF exporter
directly for the exact keys (and reuse their symbol‑matching logic).
Recovers protected‑source gating, licensing/attribution, unskinned‑url hints.

### R2 — Post‑import symbol re‑matching / enrichment *(core fix; restores skin‑tone, preferred‑symbols, transparency)*
Async (slow‑queue), idempotent, fallback‑preserving job: for every imported
`ButtonImage` lacking `library`/`external_id`, re‑resolve the symbol against
OpenSymbols (+ other libraries) using button label + OBF `license.source_url`/
author + filename (reuse `Uploader.find_images` / `default_images` / the
OpenSymbols API by label).
- Confident match → set `external_id`, `library`, `protected_source`,
  `license`, `alternates`/`library_alternates`; swap `url` to the library's
  canonical transparent asset (keep the imported asset as `fallback`);
  schedule `check_for_variants` → `*.varianted-skin.*` URL → **skin tone +
  preferred‑symbols + transparency all work**.
- Low/no‑confidence → keep imported asset, accept "no skin tone for this one"
  (data limitation, not a bug), optionally flag for manual review.
Run the same job as a **one‑time backfill** over already‑imported boards
(CommuniKate set, etc.) — idempotent, confidence‑thresholded.

### R3 — Guarantee variant generation is scheduled on import
Confirm `after_create :assert_raster` + a scheduled `check_for_variants` fire
for every imported image, not only library‑matched ones, so any
skin‑detectable upload still gets variants where possible.

### R4 — White‑background fallback *(optional, lowest priority)*
R2 covers the common case (matched library assets are transparent). For
unmatchable opaque‑white assets, an optional server step (corner flood‑fill →
alpha) could strip near‑white at import — lossy/risky, make it opt‑in.
Otherwise accept + document.

## 6. Recommended sequencing

1. **R1** — ship now (small, safe; recovers protected/license/source).
2. **R2** — build the enrichment job + one‑time backfill (the real remediation).
3. **R3** — verify/confirm scheduling.
4. **R4** — optional, only if R2 can't match.

## 7. Open questions for the team

- Confidence threshold + UX for low‑confidence matches (auto vs. manual review)?
- Backfill blast radius — how many existing boards/images are affected; run
  windowed on the slow queue?
- Licensing: when we swap an imported asset for an OpenSymbols equivalent, is
  the original attribution still required (keep both in `license`)?
- Storage cost of regenerated raster skin variants for backfilled images.

---
*Generated from a code investigation session; all file:line references valid
as of this commit. Verify against current code before implementing.*
