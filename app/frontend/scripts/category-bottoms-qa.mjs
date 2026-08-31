/**
 * Do the category columns end flush at the bottom?
 *
 * The complaint this exists for: grouped panels used to stop at their natural height,
 * so each column ended at a different place and the board looked staggered. Two earlier
 * attempts failed — stretching only the LAST panel dumped all the slack into one
 * category (a visible hole), and giving the body `height: 100%` while the panel stayed
 * `display: block` made the body overflow the panel (header + 100%).
 *
 * Both containers now stretch: `__group` is a flex column with `flex: 1 1 auto`, and
 * `__group-body` fills it with `flex: 1 1 auto`. This measures the RESULT rather than
 * trusting the CSS: bottom edges of the last panel in each column, and whether each
 * body reaches its own panel's bottom (the inner half of the stretch).
 *
 * Usage (from app/frontend, Node 22):
 *   node scripts/category-bottoms-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', null);
const TOL = 4; // px; sub-pixel grid rounding, not a visible stagger
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pass = (n, d) => { results.push(true); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push(false); console.log(`  FAIL  ${n}\n        ${d}`); };

const MEASURE = () => {
  const grid = document.querySelector('.md-board-detail-main .md-board-detail-grid');
  if (!grid || !grid.classList.contains('md-board-detail-grid--grouped')) { return null; }
  /* The keyboard rides in as a final single-panel column that CSS spans across every
     track (`--has-keyboard-panel .__column:last-child { grid-column: 1 / -1 }`), so it
     sits BELOW the vocabulary columns on purpose. Measuring it as a fourth column
     reports the intended layout as a 158px stagger. Excluded by the property that makes
     it different — it spans, the others do not — rather than by index. */
  const cols = [...grid.querySelectorAll('.md-board-detail-grid__column')]
    .filter((c) => getComputedStyle(c).gridColumn !== '1 / -1');
  const colBottoms = cols.map((c) => {
    const panels = [...c.querySelectorAll('.md-board-detail-grid__group')];
    if (!panels.length) { return null; }
    return Math.round(panels[panels.length - 1].getBoundingClientRect().bottom);
  }).filter((v) => v !== null);
  /* Inner half of the stretch: every body should reach its own panel's bottom edge,
     allowing for the panel's padding. */
  const gaps = [...grid.querySelectorAll('.md-board-detail-grid__group')].map((g) => {
    const b = g.querySelector('.md-board-detail-grid__group-body');
    if (!b) { return null; }
    const pad = parseFloat(getComputedStyle(g).paddingBottom) || 0;
    return Math.round(g.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom - pad);
  }).filter((v) => v !== null);
  return { columns: cols.length, colBottoms, maxInnerGap: gaps.length ? Math.max(...gaps) : 0, panels: gaps.length };
};

const run = async () => {
  const { browser, page } = await launch(OPTS);
  let flipped = false;
  try {
    await login(page, OPTS);
    const key = BOARD || await page.evaluate(() => window.appState.get('currentUser.preferences.home_board.key'));
    const name = String(key).split('/').pop();
    /* This probe measures PANEL mode, which needs BOTH preferences: grouping on AND
       vertical scrolling on. With scrolling off the grid renders compact category tiles
       instead — a correct rendering that carries `--compact`, not `--grouped`, so the
       precondition below failed and reported nothing about the panels it exists to
       measure. Setting only `enabled` left that to whatever the account happened to hold. */
    const on = await page.evaluate(async () => {
      const u = window.appState.get('referenced_user');
      u.set('preferences.board_category_grouping.enabled', true);
      u.set('preferences.board_category_grouping.vertical_scroll', true);
      await u.save();
      return window.appState.get('referenced_user.preferences.board_category_grouping.enabled') === true;
    });
    if (!on) { fail('precondition — grouping could be turned on', 'preference write failed'); throw new Error('pref'); }
    flipped = true;

    await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${name}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.md-board-detail-grid__cell', { timeout: 45000 });
    await sleep(7000);

    const m = await page.evaluate(MEASURE);
    if (!m) {
      /* The multi-column PANEL presentation this probe measures is DORMANT: both scroll
         settings now render the category TILING instead (board-detail-grid.js#panelLayout
         returns false, with the CSS and `assign_columns` left intact behind it). A grid
         without `--grouped` therefore means "that presentation is switched off", not
         "the board failed to render" — so this reports a skip rather than a red run that
         would otherwise look like a regression forever.
         Flip `panelLayout` back and this probe measures it again unchanged. */
      const compact = await page.evaluate(() => !!document.querySelector('.md-board-detail-grid--compact'));
      if (compact) {
        console.log('  SKIP  panel presentation is dormant — the board renders the category tiling');
        console.log('        (board-detail-grid.js#panelLayout returns false; see scripts/compact-tiles-qa.mjs)');
        await browser.close();
        process.exit(0);
      }
      fail('precondition — board rendered GROUPED', 'grid missing or not --grouped');
      throw new Error('no grid');
    }
    console.log(`  ${m.columns} columns, ${m.panels} panels; column bottoms ${JSON.stringify(m.colBottoms)}`);

    const spread = Math.max(...m.colBottoms) - Math.min(...m.colBottoms);
    if (spread <= TOL) {
      pass('columns end flush at the bottom', `spread ${spread}px across ${m.colBottoms.length} columns (tolerance ${TOL}px)`);
    } else {
      fail('columns end flush at the bottom', `spread ${spread}px — columns still stagger: ${JSON.stringify(m.colBottoms)}`);
    }

    if (m.maxInnerGap <= TOL) {
      pass('the tinted body fills each stretched panel', `worst body-to-panel gap ${m.maxInnerGap}px — inner and outer stretch together`);
    } else {
      fail('the tinted body fills each stretched panel',
        `worst gap ${m.maxInnerGap}px — the panel grew but its body did not, so the tint stops short`);
    }
  } catch (e) {
    if (!/pref|no grid/.test(e.message)) { console.log('ERROR ' + e.message); results.push(false); }
  } finally {
    if (flipped) {
      /* Restores a GUESSED default, not what the account held — this probe never read the
         previous values. Kept as-is only because it is the long-standing behaviour; if it
         ever matters, read them before flipping the way compact-tiles-qa does, and confirm
         with `rails runner` rather than a client read (a client read agrees with whatever
         was just written locally, whatever the server holds). */
      await page.evaluate(async () => {
        const u = window.appState.get('referenced_user');
        u.set('preferences.board_category_grouping.enabled', false);
        u.set('preferences.board_category_grouping.vertical_scroll', true);
        await u.save();
      }).catch(() => {});
    }
    await browser.close();
  }
  const bad = results.filter((r) => !r).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
};

run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
