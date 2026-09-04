# Marketing collateral

Customer-facing sheets. Each PDF keeps its HTML source alongside it so it can be
regenerated rather than re-designed.

| File | What it is |
|------|------------|
| `LingoLinq-QuickEval-Spec-Sheet.pdf` | Two-page Quick Eval sheet for SLPs — page 1 is how the grid recommendation is selected, page 2 is a sample report. |
| `quick-eval-spec-sheet.html` | Source for the above. Self-contained: logo and all styles are inlined, no external requests. |

## Regenerating the PDF

The sheet is sized to the design (1192 × 1908 px), not to Letter — it is a tall
one-pager and will not fit US Letter without either shrinking the type or
splitting page 1 across two sheets.

```bash
cd app/frontend   # needs the `playwright` package, already a devDependency
node - <<'EOF'
import('playwright').then(async ({ chromium }) => {
  const SRC = '../../docs/marketing/quick-eval-spec-sheet.html';
  const OUT = '../../docs/marketing/LingoLinq-QuickEval-Spec-Sheet.pdf';
  const b = await chromium.launch();
  const p = await b.newPage({ colorScheme: 'light', viewport: { width: 1240, height: 1400 } });
  await p.goto('file://' + require('path').resolve(SRC));
  await p.waitForTimeout(500);
  const m = await p.evaluate(() => {
    const s = document.querySelector('.sheet').getBoundingClientRect();
    const t = document.querySelector('.shot').getBoundingClientRect();
    return { h: Math.max(Math.ceil(s.height), Math.ceil(t.height)), w: Math.ceil(s.width) };
  });
  await p.pdf({ path: OUT, printBackground: true,
    width: (m.w + 52) + 'px', height: (m.h + 52) + 'px',
    margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  await b.close();
});
EOF
```

`printBackground: true` is required — without it every solid colour field (the
navy hero, the stat strip, the step cards) exports blank.

## Gotcha: no diagonal gradients on dark fills

Chromium exports a diagonal gradient as a PDF **axial shading**. Quartz — the
renderer behind macOS Preview — decomposes an axial shading into bands, and the
band boundary shows as a white hairline wherever it crosses a dark fill. It looked
like a cross drawn through the "Save eval" button.

Ghostscript renders shadings differently and shows nothing, so ImageMagick and
`pdftoppm`-style checks will **not** catch this. To reproduce a Preview-specific
artifact, render through Quartz:

```bash
qlmanage -t -s 2400 -o /tmp/out some.pdf   # Quick Look uses the same engine as Preview
```

The sheet therefore uses a flat `#505D72` on that button (the gradient's midpoint,
indistinguishable at button size) instead of the app's `linear-gradient(135deg, …)`.
The app's own `.evq-btn--primary` in `_eval_quick.scss` is unchanged — the artifact
only appears on PDF export.

## Content accuracy

Every figure on page 1 comes from the implementation, not from copy: the four
intake fields, the five grid bands (24/40/60/84/112) and the four DAGG
competencies are read from `lib/eval_recommend.rb` and `lib/eval_goals_grid.rb`.
The page-2 goal texts are verbatim from the goal templates. There are deliberately
**no ROI or time-saving statistics** — none are substantiated.

Page 2 is labelled **"Sample data"** and uses a fictional learner. Never replace it
with a real evaluation.
