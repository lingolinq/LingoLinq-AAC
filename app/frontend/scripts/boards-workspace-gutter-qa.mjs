/**
 * Boards page: SIDE-BY-SIDE on a wide screen reclaims 64px of workspace gutter per side.
 *
 * The base `.md-workspace` rule centres the box with `margin: 40px auto`, so the visible
 * left/right margin is the leftover viewport gutter and the lever is `max-width`
 * (1200px -> 1328px). This measures the RENDERED gutters rather than reading the
 * stylesheet, and uses TOP-DOWN at the same viewport as the control.
 *
 *   0. precondition — at this width the workspace is actually cap-limited, not
 *      viewport-limited, or the delta could not appear at all
 *   1. side-by-side gutters are 64px smaller per side
 *   2. switching back to top-down restores them (the rule is layout-scoped)
 *   3. at a NARROW width the two layouts are identical (the min() self-limits, so
 *      nothing regressed for smaller screens)
 *
 * Usage:
 *   nvm use 22 && node scripts/boards-workspace-gutter-qa.mjs \
 *     --user marcus_williams_slp --pass 'demo2025!' [--headed]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const WIDE = parseInt(OPTS.arg('--wide', '1920'), 10);
const NARROW = parseInt(OPTS.arg('--narrow', '1000'), 10);
const EXPECTED = 64;
const TOL = 1.5;

const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };

const MEASURE = () => {
  const el = document.querySelector('#content.boards-page .md-workspace')
          || document.querySelector('.md-workspace');
  if (!el) { return null; }
  const r = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const folders = document.querySelector('#content.boards-page .ub-boards-page__folders-section');
  const boards = document.querySelector('#content.boards-page .ub-boards-page__boards-summary-section');
  const fr = folders ? folders.getBoundingClientRect() : null;
  const br = boards ? boards.getBoundingClientRect() : null;
  return {
    layout: document.body.getAttribute('data-boards-layout'),
    vw,
    foldersW: fr ? Math.round(fr.width * 100) / 100 : null,
    heights: (() => {
      const g = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
      const fs = g('.ub-boards-page__folders-section');
      const bs = g('.ub-boards-page__boards-summary-section');
      const fb = g('.ub-boards-page__folders-body');
      const strip = g('.ub-boards-page__folder-list') || g('.ub-boards-page__folder-context');
      return {
        folders: fs ? Math.round(fs.height) : null,
        boards: bs ? Math.round(bs.height) : null,
        // how much empty card sits under the visible panel
        deadBand: (fb && strip) ? Math.round(fb.bottom - strip.bottom) : null
      };
    })(),
    boardsW: br ? Math.round(br.width * 100) / 100 : null,
    sideBySide: !!(fr && br && Math.abs(fr.top - br.top) < 40 && fr.right <= br.left + 1),
    left: Math.round(r.left * 100) / 100,
    right: Math.round((vw - r.right) * 100) / 100,
    width: Math.round(r.width * 100) / 100,
    maxWidth: getComputedStyle(el).maxWidth
  };
};

async function chooseLayout(page, which) {
  const btns = await page.$$('.ub-boards-page__layout-toggle-btn');
  if (btns.length < 2) { throw new Error(`layout toggle not present (${btns.length} buttons)`); }
  await btns[which === 'side-by-side' ? 0 : 1].click();
  await new Promise((r) => setTimeout(r, 800));
}

async function at(page, width, layout) {
  await page.setViewport({ width, height: 1000 });
  await new Promise((r) => setTimeout(r, 400));
  await chooseLayout(page, layout);
  return page.evaluate(MEASURE);
}

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/boards`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.ub-boards-page__layout-toggle-btn', { timeout: 45000 });

    /* EXPAND THE FOLDERS PANEL. Check 9 measures `.ub-boards-page__folders-body` and
       `.ub-boards-page__folder-list`, both of which live inside `{{#if this.foldersExpanded}}`.
       That now defaults to COLLAPSED and changes only on the user's toggle — the auto-expand
       on entering side-by-side was removed on 2026-08-26 so the panel stays where the user
       left it. Puppeteer gets a fresh profile per run, so localStorage is empty and the panel
       is always closed on arrival; without this, check 9 measured nothing and failed on every
       run, and check 8's height-parity assertion passed on an EMPTY stretched box. */
    const foldersExpanded = await page.evaluate(() => {
      const t = document.querySelector('.ub-boards-page__folders-toggle');
      return t ? t.getAttribute('aria-expanded') : null;
    });
    if (foldersExpanded === 'false') {
      await page.click('.ub-boards-page__folders-toggle');
      await new Promise((r) => setTimeout(r, 600));
    } else if (foldersExpanded === null) {
      console.log('  NOTE: folders toggle not found — checks 8 and 9 will not have a panel to measure.');
    }

    // ---- WIDE ----
    const topWide = await at(page, WIDE, 'top-down');
    if (!topWide) { throw new Error('.md-workspace not found'); }
    if (topWide.left < 24) {
      fail('0. precondition — workspace is cap-limited at this width',
        `left gutter is only ${topWide.left}px at vw=${topWide.vw}; the box is viewport-limited, ` +
        'so a max-width change could not show up. Re-run with a larger --wide.');
    } else {
      pass('0. precondition — workspace is cap-limited at this width',
        `top-down at vw=${topWide.vw}: width=${topWide.width}, gutters ${topWide.left}/${topWide.right}, ` +
        `max-width=${topWide.maxWidth}`);

      const sideWide = await at(page, WIDE, 'side-by-side');
      const dLeft = topWide.left - sideWide.left;
      const dRight = topWide.right - sideWide.right;
      const ok = Math.abs(dLeft - EXPECTED) <= TOL && Math.abs(dRight - EXPECTED) <= TOL;
      if (ok) {
        pass('1. side-by-side reclaims 64px per side',
          `side-by-side width=${sideWide.width} (was ${topWide.width}, +${sideWide.width - topWide.width}), ` +
          `gutters ${sideWide.left}/${sideWide.right} — reduced by ${dLeft}/${dRight}px`);
      } else {
        fail('1. side-by-side reclaims 64px per side',
          `expected -${EXPECTED}px per side, measured -${dLeft}/-${dRight}. ` +
          `top-down ${topWide.left}/${topWide.right} vs side-by-side ${sideWide.left}/${sideWide.right}`);
      }

      const backWide = await at(page, WIDE, 'top-down');
      if (Math.abs(backWide.left - topWide.left) <= TOL) {
        pass('2. top-down is unchanged (control bites)',
          `back to gutters ${backWide.left}/${backWide.right}, width ${backWide.width} — ` +
          'the widening is scoped to the side-by-side layout');
      } else {
        fail('2. top-down is unchanged (control bites)',
          `top-down now ${backWide.left}, was ${topWide.left} — the rule leaked`);
      }
    }

    // ---- column split at full screen: folders 1/3, boards 2/3 ----
    const sideCols = await at(page, WIDE, 'side-by-side');
    if (!sideCols.sideBySide || !sideCols.foldersW || !sideCols.boardsW) {
      fail('4. full-screen split is 1/3 folders : 2/3 boards',
        `columns not side by side at vw=${sideCols.vw} (folders=${sideCols.foldersW}, boards=${sideCols.boardsW}) — ` +
        'the ratio could not be measured');
    } else {
      // 1fr:2fr across a 16px gap => folders = (total - gap)/3
      const total = sideCols.foldersW + sideCols.boardsW;
      const ratio = sideCols.boardsW / sideCols.foldersW;
      if (Math.abs(ratio - 2) <= 0.06) {
        pass('4. full-screen split is 1/3 folders : 2/3 boards',
          `folders=${sideCols.foldersW}px boards=${sideCols.boardsW}px of ${Math.round(total)}px ` +
          `=> boards/folders = ${ratio.toFixed(3)} (2.000 target); folders is ` +
          `${((sideCols.foldersW / total) * 100).toFixed(1)}% of the pair`);
      } else {
        fail('4. full-screen split is 1/3 folders : 2/3 boards',
          `boards/folders = ${ratio.toFixed(3)}, expected ~2.000 ` +
          `(folders=${sideCols.foldersW}, boards=${sideCols.boardsW})`);
      }
    }

    /* The SAME 1/3 : 2/3 split below 1025px (2026-08-20, requested). This used to assert
       a 3.000 quarter column here — the ratio was deliberately different at narrow
       widths. It is now held steady across every width side-by-side exists at, so the
       proportion the user chose stays recognisable instead of the column reading as a
       different component on a smaller screen. */
    const midCols = await at(page, 900, 'side-by-side');
    if (midCols.sideBySide && midCols.foldersW && midCols.boardsW) {
      const midRatio = midCols.boardsW / midCols.foldersW;
      if (Math.abs(midRatio - 2) <= 0.12) {
        pass('5. below 1025px keeps the SAME split as full screen',
          `at vw=${midCols.vw} boards/folders = ${midRatio.toFixed(3)} (2.000 target) — ` +
          `folders is ${(100 * midCols.foldersW / (midCols.foldersW + midCols.boardsW)).toFixed(1)}% ` +
          'of the pair, matching full screen');
      } else {
        fail('5. below 1025px keeps the SAME split as full screen',
          `at vw=${midCols.vw} boards/folders = ${midRatio.toFixed(3)}, expected ~2.000`);
      }
    } else {
      fail('5. below 1025px keeps the SAME split as full screen',
        `columns not side by side at vw=${midCols.vw} — could not measure`);
    }


    // ---- folders column stretches to the boards column's height ----
    const hSide = await at(page, WIDE, 'side-by-side');
    const h = hSide.heights;
    if (!h || !h.folders || !h.boards) {
      fail('8. folders column matches the boards column height', 'could not measure both sections');
    } else if (Math.abs(h.folders - h.boards) <= 2) {
      pass('8. folders column matches the boards column height',
        `folders=${h.folders}px boards=${h.boards}px at vw=${hSide.vw}`);
    } else {
      fail('8. folders column matches the boards column height',
        `folders=${h.folders}px vs boards=${h.boards}px (delta ${h.boards - h.folders}px)`);
    }

    // the height must reach the VISIBLE panel, not just the outer box — this is the
    // failure the `align-items: start` comment in app.scss warns about
    if (h && h.deadBand !== null) {
      if (h.deadBand <= 30) {
        pass('9. the card fills, rather than floating above dead space',
          `only ${h.deadBand}px between the panel's bottom and the card's inner bottom ` +
          '(its own bottom padding) — the stretch reached the panel');
      } else {
        fail('9. the card fills, rather than floating above dead space',
          `${h.deadBand}px of empty card under the panel — the outer box stretched but the ` +
          'inner panel did not follow');
      }
    } else {
      fail('9. the card fills, rather than floating above dead space', 'could not measure the panel');
    }

    // control: top-down must NOT be stretched
    const hTop = (await at(page, WIDE, 'top-down')).heights;
    if (hTop && hTop.folders && hTop.boards && hTop.folders < hTop.boards - 20) {
      pass('10. top-down folders keeps its natural height (control bites)',
        `folders=${hTop.folders}px vs boards=${hTop.boards}px — the stretch is scoped to ` +
        'side-by-side and did not leak into the stacked layout');
    } else {
      fail('10. top-down folders keeps its natural height (control bites)',
        `folders=${hTop && hTop.folders}px boards=${hTop && hTop.boards}px — expected folders to stay short`);
    }

    // ---- NARROW: both layouts must agree (min() self-limits) ----
    const topNarrow = await at(page, NARROW, 'top-down');
    const sideNarrow = await at(page, NARROW, 'side-by-side');
    if (Math.abs(topNarrow.width - sideNarrow.width) <= TOL) {
      pass('3. narrow widths unaffected',
        `at vw=${topNarrow.vw} both layouts render the workspace at ${topNarrow.width}px — ` +
        'the min() term still wins below the cap, so smaller screens are untouched');
    } else {
      fail('3. narrow widths unaffected',
        `top-down ${topNarrow.width} vs side-by-side ${sideNarrow.width} at vw=${topNarrow.vw}`);
    }
  } catch (e) {
    fail('run', e.message);
  } finally {
    const bad = results.filter((r) => !r.ok);
    console.log('\n' + '='.repeat(72));
    console.log(`${results.length - bad.length} passed, ${bad.length} failed`);
    console.log('='.repeat(72) + '\n');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
  }
})();
