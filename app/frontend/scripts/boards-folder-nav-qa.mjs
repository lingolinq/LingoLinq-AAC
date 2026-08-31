/**
 * Boards page: folder drill-in is a real navigation.
 *
 * Drilling into a folder used to be invisible controller state — no URL change, so the
 * browser Back button walked out of the page instead of closing the folder view, and the
 * only way back was a small breadcrumb above the folder title. Now `mineTagFolderDrillIn`
 * is bound to a `?folder=` query param, and the view carries a large Back control.
 *
 *   1. opening a folder puts it in the URL
 *   2. a large Back control is visible beside the folder name
 *   3. that control closes the folder view and clears the param
 *   4. the BROWSER Back button closes the folder view (and stays on the boards page)
 *   5. Forward re-opens it — i.e. it is real history, not a one-way hack
 *
 * Usage:
 *   nvm use 22 && node scripts/boards-folder-nav-qa.mjs \
 *     --user marcus_williams_slp --pass 'demo2025!' [--headed]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };

const SNAP = () => {
  const back = document.querySelector('.ub-boards-page__folder-context-back');
  const r = back ? back.getBoundingClientRect() : null;
  const name = document.querySelector('.ub-boards-page__folder-context-name-text');
  return {
    url: location.pathname + location.search,
    drilledIn: !!document.querySelector('.ub-boards-page__folder-context'),
    folderName: name ? name.textContent.trim() : null,
    backVisible: !!(back && r && r.width > 0),
    backSize: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    // "to the right of the folder name"
    backTag: back ? back.tagName : null,
    backColor: back ? getComputedStyle(back).color : null,
    // top of the card, and horizontally centred within it
    backAtCardTop: (() => {
      const card = document.querySelector('.ub-boards-page__folder-context');
      const row = document.querySelector('.ub-boards-page__folder-context-toprow');
      if (!card || !r || !row) { return false; }
      return r.top - card.getBoundingClientRect().top < 60 && row === card.firstElementChild;
    })(),
    actionsRow: (() => {
      const card = document.querySelector('.ub-boards-page__folder-context');
      const act = document.querySelector('.ub-boards-page__folder-context-actions');
      if (!card || !act) { return null; }
      const cr = card.getBoundingClientRect(), ar = act.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(card).paddingRight) || 0;
      return {
        // flush to the card's CONTENT edge => inset equals the card's own right padding
        rightInset: Math.round(cr.right - ar.right),
        cardPadRight: Math.round(pad),
        gridColumn: getComputedStyle(act).gridColumnStart
      };
    })(),
    swapped: (() => {
      const menu = document.querySelector('.ub-boards-page__folder-context-boards-menu');
      const del  = document.querySelector('.ub-boards-page__folder-context-actions');
      const row  = document.querySelector('.ub-boards-page__folder-context-toprow');
      const card = document.querySelector('.ub-boards-page__folder-context');
      if (!menu || !del || !row || !card || !r) { return null; }
      const mr = menu.getBoundingClientRect(), dr = del.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      return {
        deleteInTopRow: del.parentElement === row,
        menuInCard: menu.parentElement === card,
        deleteOverlapWithLink: Math.round(Math.min(dr.bottom, r.bottom) - Math.max(dr.top, r.top)),
        deleteAfterLinkGap: Math.round(dr.left - r.right),
        menuBelowDelete: Math.round(mr.top - dr.bottom),
        deleteRightInset: Math.round(cr.right - dr.right),
        menuRightInset: Math.round(cr.right - mr.right)
      };
    })(),
    // must SHARE the breadcrumb's row, not sit above it
    sameRowAsBreadcrumb: (() => {
      const bc = document.querySelector('.ub-boards-page__folder-context-breadcrumb');
      if (!bc || !r) { return null; }
      const b = bc.getBoundingClientRect();
      const overlap = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      return { overlap: Math.round(overlap), breadcrumbLeftOfLink: Math.round(r.left - b.right) };
    })(),
    backCentred: (() => {
      const card = document.querySelector('.ub-boards-page__folder-context');
      if (!card || !r) { return null; }
      const c = card.getBoundingClientRect();
      return Math.round(Math.abs(((r.left + r.right) / 2) - ((c.left + c.right) / 2)));
    })(),
    folderListVisible: !!document.querySelector('.ub-boards-page__folder-list'),
    layoutAttr: document.body.getAttribute('data-boards-layout'),
    sideBySide: (() => {
      const f = document.querySelector('.ub-boards-page__folders-section');
      const b = document.querySelector('.ub-boards-page__boards-summary-section');
      if (!f || !b) { return false; }
      const fr = f.getBoundingClientRect(), br = b.getBoundingClientRect();
      return Math.abs(fr.top - br.top) < 40 && fr.right <= br.left + 1;
    })()
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);
    await page.setViewport({ width: 1920, height: 1000 });
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/boards`, { waitUntil: 'networkidle2' });

    /* EXPAND THE FOLDERS PANEL FIRST. Every selector this probe drives lives inside
       `{{#if this.foldersExpanded}}` (available-boards-section.hbs), and that now defaults
       to COLLAPSED and only ever changes when the user toggles it — the viewport/layout
       auto-expand that used to open it on entering side-by-side was removed on 2026-08-26
       (the panel stays where the user left it, and a state change that skipped the stored
       preference was what let this component and controllers/user/index drift apart).
       Puppeteer gets a fresh profile per run via qa-helpers#launch, so localStorage is
       always empty and the panel is always closed on arrival. Without this the wait below
       times out at 45s and the probe exits 1 on every run, having tested nothing.
       Same pattern as folders-caret-qa.mjs. */
    const foldersExpanded = await page.evaluate(() => {
      const t = document.querySelector('.ub-boards-page__folders-toggle');
      return t ? t.getAttribute('aria-expanded') : null;
    });
    if (foldersExpanded === null) {
      throw new Error('folders toggle not found — is the Folders panel rendered on this account?');
    }
    if (foldersExpanded === 'false') {
      await page.click('.ub-boards-page__folders-toggle');
      await new Promise((r) => setTimeout(r, 600));
    }

    await page.waitForSelector('.ub-boards-page__folder-row', { timeout: 45000 });

    const before = await page.evaluate(SNAP);
    if (before.drilledIn) { throw new Error('already inside a folder before the test started'); }

    // 1. open a folder
    (await page.$$('.ub-boards-page__folder-row'))[0].click
      ? await (await page.$$('.ub-boards-page__folder-row'))[0].click()
      : null;
    await new Promise((r) => setTimeout(r, 1500));
    const opened = await page.evaluate(SNAP);

    if (opened.drilledIn && /[?&]folder=/.test(opened.url)) {
      pass('1. opening a folder puts it in the URL',
        `now at "${opened.url}" showing folder "${opened.folderName}"`);
    } else {
      fail('1. opening a folder puts it in the URL',
        `drilledIn=${opened.drilledIn} url="${opened.url}"`);
    }

    // 2. the large Back control
    const isLink = opened.backTag === 'A';
    const sr = opened.sameRowAsBreadcrumb;
    // vertical overlap means they occupy the same band; a positive gap means the
    // breadcrumb ends before the link starts, i.e. side by side rather than stacked
    const sharesRow = !!(sr && sr.overlap > 8 && sr.breadcrumbLeftOfLink > 0);
    if (sharesRow) {
      pass('2b. Back link shares the breadcrumb row (not above it)',
        `${sr.overlap}px vertical overlap with the breadcrumb, which ends ` +
        `${sr.breadcrumbLeftOfLink}px to its left`);
    } else {
      fail('2b. Back link shares the breadcrumb row (not above it)',
        `overlap=${sr && sr.overlap}px gap=${sr && sr.breadcrumbLeftOfLink}px — expected them side by side`);
    }
    const centred = opened.backCentred !== null && opened.backCentred <= 2;
    // #1A7B7A === rgb(26, 123, 122) — the AA verdigris token
    const verdigris = /rgb\(\s*26,\s*123,\s*122\s*\)/.test(opened.backColor || '');
    if (opened.backVisible && isLink && opened.backAtCardTop && centred && verdigris && opened.backSize.h >= 44) {
      pass('2. a centred verdigris Back LINK sits at the top of the folder card',
        `<${opened.backTag}> ${opened.backSize.w}x${opened.backSize.h}px, first child of the ` +
        `card, off-centre by ${opened.backCentred}px, colour ${opened.backColor} (AA verdigris)`);
    } else {
      fail('2. a centred verdigris Back LINK sits at the top of the folder card',
        `tag=${opened.backTag} visible=${opened.backVisible} atTop=${opened.backAtCardTop} ` +
        `offCentre=${opened.backCentred}px colour=${opened.backColor} size=${JSON.stringify(opened.backSize)}`);
    }

    const sw = opened.swapped;
    const ar = opened.actionsRow;

    if (sw && sw.deleteInTopRow && sw.deleteOverlapWithLink > 8 && sw.deleteAfterLinkGap > 0) {
      pass('2c. Delete occupies the top row, right of the exit link',
        `in the top row, ${sw.deleteOverlapWithLink}px vertical overlap with the exit link, ` +
        `${sw.deleteAfterLinkGap}px to its right`);
    } else {
      fail('2c. Delete occupies the top row, right of the exit link',
        `inTopRow=${sw && sw.deleteInTopRow} overlap=${sw && sw.deleteOverlapWithLink}px ` +
        `gap=${sw && sw.deleteAfterLinkGap}px`);
    }

    if (sw && sw.menuInCard && sw.menuBelowDelete > 0) {
      pass('2e. "Boards in this folder" sits below it, on the identity row',
        `out of the top row and ${sw.menuBelowDelete}px beneath Delete — the two swapped`);
    } else {
      fail('2e. "Boards in this folder" sits below it, on the identity row',
        `inCard=${sw && sw.menuInCard} belowDeleteBy=${sw && sw.menuBelowDelete}px`);
    }

    const pad = ar && ar.cardPadRight;
    if (sw && pad != null && Math.abs(sw.deleteRightInset - pad) <= 2 &&
        Math.abs(sw.menuRightInset - pad) <= 2) {
      pass('2d. both right-hand controls stay flush to the card edge',
        `Delete ${sw.deleteRightInset}px and the dropdown ${sw.menuRightInset}px, ` +
        `against a ${pad}px card padding`);
    } else {
      fail('2d. both right-hand controls stay flush to the card edge',
        `delete=${sw && sw.deleteRightInset}px menu=${sw && sw.menuRightInset}px cardPadding=${pad}px`);
    }

    // 4. BROWSER Back (checked before the in-page control so the history entry is fresh)
    await page.goBack();
    await new Promise((r) => setTimeout(r, 1800));
    const backed = await page.evaluate(SNAP);
    if (!backed.drilledIn && !/[?&]folder=/.test(backed.url) && /\/boards$/.test(backed.url)) {
      pass('4. the BROWSER Back button closes the folder view',
        `back to "${backed.url}", folder view gone, still on the boards page ` +
        `(folder list visible: ${backed.folderListVisible})`);
    } else {
      fail('4. the BROWSER Back button closes the folder view',
        `url="${backed.url}" drilledIn=${backed.drilledIn}`);
    }

    // 5. Forward re-opens — proves a real history entry
    await page.goForward();
    await new Promise((r) => setTimeout(r, 1800));
    const fwd = await page.evaluate(SNAP);
    if (fwd.drilledIn && /[?&]folder=/.test(fwd.url)) {
      pass('5. Forward re-opens the folder (real history entry)',
        `forward returned to "${fwd.url}" showing "${fwd.folderName}"`);
    } else {
      fail('5. Forward re-opens the folder (real history entry)',
        `url="${fwd.url}" drilledIn=${fwd.drilledIn}`);
    }

    // 3. the in-page control still works
    const btn = await page.$('.ub-boards-page__folder-context-back');
    if (!btn) {
      fail('3. the Back control closes the folder view', 'control not found after Forward');
    } else {
      await btn.click();
      await new Promise((r) => setTimeout(r, 1500));
      const closed = await page.evaluate(SNAP);
      if (!closed.drilledIn && !/[?&]folder=/.test(closed.url)) {
        pass('3. the Back control closes the folder view',
          `clicked it; now at "${closed.url}" with the folder list back`);
      } else {
        fail('3. the Back control closes the folder view',
          `url="${closed.url}" drilledIn=${closed.drilledIn}`);
      }
    }
    /* ---- leaving a folder must return the user to SIDE-BY-SIDE ----
       The layout lives as `data-boards-layout` on <body>, written by
       <BoardsLayoutToggle>, which sits above the boards body and is NOT remounted by
       the `?folder=` transition. The side-by-side grid rule is gated on
       `:has(> folders-section):has(> boards-summary-section)`, so it goes inert while
       drilled in (only the folder view is present) and re-arms when both children come
       back. Guarded here because it is a cross-feature interaction — a future change to
       either the toggle's lifecycle or that `:has()` gate could silently break it. */
    await page.setViewport({ width: 1920, height: 1000 });
    await new Promise((r) => setTimeout(r, 400));
    const toggles = await page.$$('.ub-boards-page__layout-toggle-btn');
    if (toggles.length < 2) {
      fail('6. leaving a folder returns to side-by-side', 'layout toggle not available');
    } else {
      await toggles[0].click();
      await new Promise((r) => setTimeout(r, 1200));
      const inSbs = await page.evaluate(SNAP);
      if (!inSbs.sideBySide) {
        fail('6. leaving a folder returns to side-by-side',
          'could not establish side-by-side before the test — nothing below would mean anything');
      } else {
        // exit via the BROWSER back button
        await (await page.$$('.ub-boards-page__folder-row'))[0].click();
        await new Promise((r) => setTimeout(r, 1500));
        await page.goBack();
        await new Promise((r) => setTimeout(r, 1800));
        const afterBack = await page.evaluate(SNAP);

        // exit via the in-page link
        await (await page.$$('.ub-boards-page__folder-row'))[0].click();
        await new Promise((r) => setTimeout(r, 1500));
        const l = await page.$('.ub-boards-page__folder-context-back');
        if (l) { await l.click(); }
        await new Promise((r) => setTimeout(r, 1800));
        const afterLink = await page.evaluate(SNAP);

        if (afterBack.sideBySide && !afterBack.drilledIn && afterLink.sideBySide && !afterLink.drilledIn) {
          pass('6. leaving a folder returns to side-by-side (both exits)',
            `browser Back -> side-by-side restored (layout="${afterBack.layoutAttr}"); ` +
            `Back link -> side-by-side restored (layout="${afterLink.layoutAttr}")`);
        } else {
          fail('6. leaving a folder returns to side-by-side (both exits)',
            `afterBrowserBack sideBySide=${afterBack.sideBySide} drilledIn=${afterBack.drilledIn}; ` +
            `afterLink sideBySide=${afterLink.sideBySide} drilledIn=${afterLink.drilledIn}`);
        }
      }
    }

    /* Same, but arriving INSIDE the folder from a cold load (refresh, or a shared
       `?folder=` link) — there the toggle mounts with the folder already open, so the
       restore depends on the stored preference rather than on in-session state. */
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/boards?folder=${encodeURIComponent(opened.folderName)}`,
      { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2500));
    const cold = await page.evaluate(SNAP);
    const coldLink = await page.$('.ub-boards-page__folder-context-back');
    if (!cold.drilledIn || !coldLink) {
      fail('7. cold load into a folder still exits to side-by-side',
        `cold load did not open the folder (drilledIn=${cold.drilledIn})`);
    } else {
      await coldLink.click();
      await new Promise((r) => setTimeout(r, 2000));
      const out = await page.evaluate(SNAP);
      if (out.sideBySide && !out.drilledIn) {
        pass('7. cold load into a folder still exits to side-by-side',
          `loaded straight into "${cold.folderName}", exited to side-by-side ` +
          `(layout="${out.layoutAttr}")`);
      } else {
        fail('7. cold load into a folder still exits to side-by-side',
          `sideBySide=${out.sideBySide} drilledIn=${out.drilledIn} layout="${out.layoutAttr}"`);
      }
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
