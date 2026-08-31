/**
 * Reports the LABEL fit of every tile on the categorised board's controls row.
 *
 * `utils/label_fit.js` is shrink-only by design, so a label that already fits is left at
 * whatever the responsive CSS rule gives it. On a tile the stylesheet has widened — Time
 * and the Keys folder above 1024px — that leaves the text small inside a large button with
 * room to spare, which is invisible in a layout dump. This prints, per button: the label,
 * the font size actually in use, whether label_fit set it, the label box, and how much of
 * that box the text is using.
 *
 * Usage:
 *   node scripts/controls-label-fit-qa.mjs --user <u> --pass <p> --board <slug> \
 *     [--widths 2280,1280] [--no-scroll]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', null);
const WIDTHS = (OPTS.arg('--widths', '2280')).split(',').map(Number);
const SCROLL = !process.argv.includes('--no-scroll');
/* Which category tiles to report. Defaults to the controls row; `--keys all` reports every
   category, which is how you find out WHICH button a one-button category is holding. */
const KEYS_ARG = OPTS.arg('--keys', 'time,keyboard_extra,yes,social,no_not,predictions');
const KEYS = (KEYS_ARG === 'all') ? null : KEYS_ARG.split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DUMP = () => {
  const out = [];
  document.querySelectorAll('.md-board-detail-grid__group').forEach((g) => {
    /* Where the band row's height actually goes. The label can only grow into room the
       CARD has, and the card only gets what the group leaves it after its header, its own
       padding, and the cell padding — so a "make the text bigger" question is really a
       question about this breakdown. */
    if(g.className.indexOf('--time') >= 0) {
      const gh = g.querySelector('.md-board-detail-grid__group-header');
      const gb = g.querySelector('.md-board-detail-grid__group-body');
      const cell = g.querySelector('.md-board-detail-grid__cell');
      const cs = getComputedStyle(g);
      out.push({ breakdown: true,
        group: Math.round(g.getBoundingClientRect().height),
        groupPad: cs.paddingTop + '/' + cs.paddingBottom,
        header: gh ? Math.round(gh.getBoundingClientRect().height) : 0,
        body: gb ? Math.round(gb.getBoundingClientRect().height) : 0,
        bodyPad: gb ? getComputedStyle(gb).paddingTop + '/' + getComputedStyle(gb).paddingBottom : '-',
        cell: cell ? Math.round(cell.getBoundingClientRect().height) : 0,
        cellPad: cell ? getComputedStyle(cell).paddingTop + '/' + getComputedStyle(cell).paddingBottom : '-' });
    }
    const key = [...g.classList].map((c) => c.replace('md-board-detail-grid__group--', ''))
      .find((c) => c.indexOf('md-board-detail') === -1) || '(none)';
    g.querySelectorAll('.md-board-detail-symbol-card').forEach((card) => {
      const lab = card.querySelector('.md-board-detail-symbol-card__label');
      if (!lab) { return; }
      const cs = getComputedStyle(lab);
      const r = lab.getBoundingClientRect();
      out.push({
        key,
        text: (lab.textContent || '').trim().slice(0, 32),
        font: Math.round(parseFloat(cs.fontSize) * 10) / 10,
        inline: lab.style.fontSize || '-',
        boxW: Math.round(r.width), boxH: Math.round(r.height),
        // how tall the text actually is vs the 3-line box it is allowed
        usedH: lab.scrollHeight,
        maxH: Math.round(parseFloat(cs.maxHeight) || 0),
        cardW: Math.round(card.getBoundingClientRect().width),
        /* How many LINE BOXES the text actually occupies, and how wide each is — a
           height in px cannot tell "one long line" from "two short ones", and where the
           break falls is the thing being judged. */
        lines: (function() {
          try {
            const rng = document.createRange();
            rng.selectNodeContents(lab);
            const rects = [...rng.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
            const tops = [];
            rects.forEach((r) => {
              const t = Math.round(r.top);
              if(!tops.some((x) => Math.abs(x - t) < 4)) { tops.push(t); }
            });
            return tops.length;
          } catch(e) { return -1; }
        })(),
        lineClamp: cs.webkitLineClamp,
        wordBreak: cs.wordBreak + '/' + cs.overflowWrap,
        /* What the card is made of vertically — the label can only grow into room the
           card actually has, and the controls row's height is fixed by the grid. */
        cardH: Math.round(card.getBoundingClientRect().height),
        imgH: (function() {
          const img = card.querySelector('.md-board-detail-symbol-card__image, .md-board-detail-symbol-card__image-holder, img');
          return img ? Math.round(img.getBoundingClientRect().height) : 0;
        })(),
        /* Natural single-line width of the text at the size in use, so the wrap point is
           a measured number rather than a guess. */
        natW: (function() {
          try {
            const c = document.createElement('canvas').getContext('2d');
            c.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
            return Math.round(c.measureText((lab.textContent || '').trim()).width);
          } catch(e) { return -1; }
        })()
      });
    });
  });
  return out;
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(OPTS.BASE + '/' + OPTS.USER + '/board-detail/' + BOARD,
      { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
    await sleep(2000);

    /* Set the variant EXPLICITLY. These probes write the user's `vertical_scroll`
       preference, so a script that only reads inherits whatever the last one left behind —
       a `--no-scroll` control run leaves it false and everything after it silently measures
       the wrong variant. (The non-scrolling body is `display: contents`, so its boxes do
       not even look wrong; they just are.) */
    const boardId = await page.evaluate(() =>
      document.querySelector('.md-board-detail-grid').getAttribute('data-id'));
    await page.evaluate(async (id, scroll) => {
      const u = window.appState.get('referenced_user') || window.appState.get('currentUser');
      const p = Object.assign({}, u.get('preferences'));
      const prev = p.board_category_grouping || {};
      const entry = { enabled: true, order: prev.order || [],
        show_category_names: true, vertical_scroll: scroll };
      p.board_category_grouping = Object.assign({}, prev, entry,
        { boards: Object.assign({}, prev.boards, { [id]: entry }) });
      u.set('preferences', p);
      if (!u.get('preferences.device')) { u.set('preferences.device', {}); }
      u.set('preferences.device.updated', true);
      await u.save();
    }, boardId, SCROLL);
    await sleep(3000);
    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 900 });
      await sleep(1800);
      const rows = await page.evaluate(DUMP);
      console.log('\n=== ' + BOARD + ' @ ' + w + 'px ===');
      rows.filter((r) => r.breakdown).forEach((r) => {
        console.log('  [time tile] group=' + r.group + ' (pad ' + r.groupPad + ')  header=' + r.header +
          '  body=' + r.body + ' (pad ' + r.bodyPad + ')  cell=' + r.cell + ' (pad ' + r.cellPad + ')');
      });
      rows.filter((r) => !r.breakdown && (KEYS === null || KEYS.indexOf(r.key) >= 0))
        .forEach((r) => {
          console.log('  ' + r.key.padEnd(15) + ' card=' + String(r.cardW).padStart(4) +
            '  font=' + String(r.font).padStart(5) + '  inline=' + r.inline.padEnd(8) +
            '  box=' + r.boxW + 'x' + r.boxH + ' used=' + r.usedH + ' max=' + r.maxH +
            '  lines=' + r.lines + '/' + r.lineClamp +
            '  card=' + r.cardW + 'x' + r.cardH + ' img=' + r.imgH + ' natW=' + r.natW +
            '   "' + r.text + '"');
        });
    }
  } finally { await browser.close(); }
})();
