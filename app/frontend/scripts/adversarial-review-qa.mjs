/**
 * Click-tests for the adversarial-review fixes that were only verified statically.
 *
 * Covers H4, H5, H3, M2, M9 from
 * docs/task-management/2026-08-13-branch-vs-staging-adversarial-review.md.
 * Each check drives the REAL user flow against the dev stack; none of them assert
 * on source, because every one of these fixes already passed inspection and the
 * open question is whether the flow actually works.
 *
 * PUPPETEER, not Playwright: `puppeteer ^24.42.0` is what this repo commits.
 * Node 22 is required (sass/testem die with ERR_REQUIRE_ESM on 16).
 *
 *   node scripts/adversarial-review-qa.mjs --only h4 --user sarah_chen_slp --pass 'demo2025!'
 *   node scripts/adversarial-review-qa.mjs                # runs every check
 *
 * A check that cannot establish its PRECONDITION reports SKIP with the reason,
 * never PASS. "The data to exercise this does not exist" is a real result and is
 * the opposite of a green tick.
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const ONLY = OPTS.arg('--only', '').toLowerCase();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`\n[${status}] ${id} — ${detail}\n`);
}

/*
 * A real mouse click at the element's centre, dispatched through CDP, so the
 * TOPMOST element at that point receives it. `el.click()` would bypass hit
 * testing entirely, which is precisely the defect H4 is about — it would pass
 * against the pre-fix code.
 */
async function clickForReal(page, selector) {
  const el = await page.$(selector);
  if (!el) { throw new Error('clickForReal: no element for ' + selector); }
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }));
  await sleep(150);
  await el.click();
}

/** What actually sits on top at this element's centre point. */
async function hitTest(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) { return { found: false }; }
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    if (!top) { return { found: true, covered: true, topDesc: '(nothing — offscreen?)' }; }
    const desc = (n) => n.tagName.toLowerCase() +
      (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '');
    return {
      found: true,
      rect: { x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height) },
      // reachable when the topmost node IS the element or lives inside it
      reachable: el === top || el.contains(top),
      topDesc: desc(top),
      // the chain from the hit node up, so a covering scrim names itself
      chain: (() => { const out = []; let n = top; while (n && out.length < 6) { out.push(desc(n)); n = n.parentElement; } return out; })()
    };
  }, selector);
}

async function zIndexOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) { return null; }
    return getComputedStyle(el).zIndex;
  }, selector);
}

/* ------------------------------------------------------------------ H4 ---- */
/*
 * `.bp-options` scrim vs the `premium-required` modal its own "Create New Board"
 * opens. Pre-fix the scrim was z-index 5900 and buried the dialog: invisible,
 * unclickable, and since check_for_needing_purchase()'s promise only settles when
 * the dialog is dismissed, an unrecoverable hang for an expired or modeling-only
 * supporter.
 *
 * TRIGGER: no seeded account is expired or modeling-only (all three SLPs are
 * `org_sponsored_supporter`), so the gate is armed in-page by setting
 * `modeling_session` on the session user — a plain settable property that
 * `user.modeling_only` reads first (app/frontend/app/models/user.js:414), and the
 * same property app-state.js:2205 itself writes from the session. The account
 * state is only the TRIGGER; the defect under test is the stacking and the
 * unblock, both fully client-side.
 */
async function checkH4(page) {
  const id = 'H4 (bp-options scrim buries premium-required)';
  await page.goto(OPTS.BASE + '/board-picker?user_id=1_7', { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(6000);

  const overlay = await page.$('.bp-options');
  if (!overlay) {
    return record(id, 'SKIP', 'the .bp-options overlay never rendered — precondition not met (is user_id=1_7 still supervised?)');
  }

  const armed = await page.evaluate(() => {
    const su = window.LingoLinq.appState.get('sessionUser');
    if (!su) { return { ok: false, why: 'no sessionUser' }; }
    su.set('modeling_session', true);
    return { ok: !!su.get('modeling_only'), why: 'modeling_only=' + su.get('modeling_only') };
  });
  if (!armed.ok) {
    return record(id, 'SKIP', 'could not arm the purchase gate: ' + armed.why);
  }

  const zScrim = await zIndexOf(page, '.bp-options');
  await clickForReal(page, '.bp-options__btn--create');

  const appeared = await page
    .waitForSelector('.md-premium-required-header', { visible: true, timeout: 15000 })
    .catch(() => null);
  if (!appeared) {
    return record(id, 'FAIL', 'clicking "Create New Board" as a modeling-only supporter never rendered the premium-required dialog');
  }

  const zModal = await zIndexOf(page, '.modal');
  const zBackdrop = await zIndexOf(page, '.modal-backdrop');
  const hit = await hitTest(page, '.la-modal-close');
  const scrimStillUp = await page.$('.bp-options');

  if (!hit.reachable) {
    return record(id, 'FAIL',
      `premium-required rendered but its close button is COVERED by ${hit.topDesc} ` +
      `(scrim z=${zScrim}, modal z=${zModal}, backdrop z=${zBackdrop}); chain=${JSON.stringify(hit.chain)}`);
  }

  /*
   * NEGATIVE CONTROL, in place and without git: put the scrim back at its
   * pre-fix 5900 while the dialog is open and re-run the same hit test. If it
   * still reports reachable, the check is not measuring anything.
   */
  const negative = await page.evaluate(() => {
    const scrim = document.querySelector('.bp-options');
    const prev = scrim.style.zIndex;
    scrim.style.zIndex = '5900';
    const el = document.querySelector('.la-modal-close');
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const covered = !(el === top || el.contains(top));
    const topDesc = top ? top.tagName.toLowerCase() + '.' + String(top.className || '').trim().split(/\s+/).join('.') : '(none)';
    scrim.style.zIndex = prev;
    return { covered, topDesc };
  });
  if (!negative.covered) {
    return record(id, 'FAIL',
      'NEGATIVE CONTROL DID NOT BITE: with the scrim forced back to its pre-fix 5900 the close ' +
      `button is still reachable (top element: ${negative.topDesc}). This check proves nothing — fix the check.`);
  }

  // The unblock: dismiss it with a real click and confirm the promise settled.
  // `create_new_board` runs .then(go, go), so a settled promise — resolve OR
  // reject — must land on create-board-new. A hang leaves us on /board-picker.
  await clickForReal(page, '.la-modal-close');
  const moved = await page
    .waitForFunction(() => /create-board|create_board/.test(window.location.pathname), { timeout: 20000 })
    .catch(() => null);
  const urlNow = page.url();
  const modalGone = !(await page.$('.md-premium-required-header'));

  if (!modalGone) {
    return record(id, 'FAIL', 'the dialog did not close on a real click of .la-modal-close — still on ' + urlNow);
  }
  if (!moved) {
    return record(id, 'FAIL',
      'dialog dismissed but check_for_needing_purchase() never settled — still on ' + urlNow +
      ' (this is the pre-fix hang, surviving the z-index change)');
  }

  record(id, 'PASS',
    `dialog painted above the scrim (scrim z=${zScrim}, backdrop z=${zBackdrop}, modal z=${zModal}), ` +
    `its close button was reachable to a real mouse click (top element at the point: ${hit.topDesc}), ` +
    `the overlay was ${scrimStillUp ? 'still up behind it' : 'gone'}, and dismissing it unblocked the flow → ${urlNow}. ` +
    `Negative control bit: forcing the scrim back to 5900 re-covered the button with ${negative.topDesc}.`);
}

/* ------------------------------------------------------------------ M2 ---- */
/*
 * Reports summary must not show the PREVIOUS period's numbers, nor the "No
 * communication activity yet" empty state, while a new period is loading.
 * `onPeriodChange` mutates `usage_stats.filter` in place, so the period control
 * flips instantly; the fix gates both branches on `status`
 * (controllers/user/stats.js:88-90 and templates/user/stats.hbs:203).
 *
 * The in-flight window is normally too short to sample honestly, so
 * `/stats/daily` is HELD for a fixed interval and the DOM polled throughout.
 * A sampler that never observes `loading` proves nothing, so that is a FAIL.
 */
async function checkM2(page, userName) {
  const id = 'M2 (previous period\'s numbers survive into the next load)';
  const HOLD_MS = 4000;

  let holding = false;
  const dailyReqs = [];
  await page.setRequestInterception(true);
  const onReq = async (req) => {
    if (/\/api\/v1\/users\/[^/]+\/stats\/daily/.test(req.url())) {
      dailyReqs.push({ url: req.url().slice(0, 160), held: holding });
      if (holding) { await sleep(HOLD_MS); }
    }
    try { await req.continue(); } catch { /* already handled */ }
  };
  page.on('request', onReq);

  try {
    await page.goto(OPTS.BASE + '/' + userName + '/stats', { waitUntil: 'networkidle2', timeout: 90000 });

    const loaded = await page
      .waitForFunction(() => document.querySelectorAll('.report-kpi__value').length > 0, { timeout: 60000 })
      .catch(() => null);
    if (!loaded) {
      return record(id, 'SKIP', `no report data rendered for ${userName} — cannot test the transition out of a populated period`);
    }
    const before = await page.evaluate(() => ({
      kpis: [...document.querySelectorAll('.report-kpi__value')].map((n) => n.textContent.trim()),
      range: (document.querySelector('.communication-report__date-range') || {}).textContent,
      period: (document.querySelector('.md-stats-period-select__label') || {}).textContent
    }));

    // Sample the DOM continuously across the switch.
    await page.evaluate(() => {
      window.__m2 = [];
      window.__m2Timer = setInterval(() => {
        const msg = document.querySelector('.md-stats-load-status__message');
        window.__m2.push({
          t: performance.now(),
          statusBlock: !!document.querySelector('.md-stats-load-status'),
          msgText: msg ? msg.textContent.trim().slice(0, 40) : null,
          loading: !!(msg && /Loading/i.test(msg.textContent)),
          kpis: [...document.querySelectorAll('.report-kpi__value')].map((n) => n.textContent.trim()),
          empty: !!document.querySelector('.communication-report__empty'),
          highlight: !!document.querySelector('.progress-highlight')
        });
      }, 40);
    });

    holding = true;
    await clickForReal(page, '.md-stats-period-select__trigger');
    await page.waitForSelector('.md-stats-period-select__option', { visible: true, timeout: 10000 });
    /*
     * Only a real PERIOD reloads the report. "Custom Filter" (`id: 'custom'`,
     * components/stats/data-filter.js:35) just reveals a date picker and fires
     * no request, and a "Snapshot - …" entry is a saved range rather than a
     * period switch. Picking either makes the check silently observe nothing.
     */
    /*
     * `aria-selected` is unreliable here: it is `is-equal this.selection item.id`
     * and `usage_stats.filter` is UNSET on a default load (controllers/user/stats.js:296
     * treats absent and 'last_2_months' as the same thing), so no option is marked
     * selected while "Last 2 Months" is what's on screen. Compare against the
     * trigger's own label instead — that is what the user sees.
     */
    const picked = await page.evaluate(() => {
      const current = (document.querySelector('.md-stats-period-select__label') || {}).textContent || '';
      const opts = [...document.querySelectorAll('.md-stats-period-select__option')].filter((o) => {
        const t = o.textContent.trim();
        return !o.disabled &&
          o.getAttribute('aria-selected') !== 'true' &&
          t !== current.trim() &&
          !/custom/i.test(t) &&
          !/^snapshot/i.test(t);
      });
      if (!opts.length) { return null; }
      const name = opts[0].textContent.trim();
      opts[0].click();
      return name;
    });
    if (!picked) {
      return record(id, 'SKIP', 'no alternative period was selectable in the period menu');
    }

    await sleep(HOLD_MS + 4000);
    await page.waitForFunction(
      () => { const m = document.querySelector('.md-stats-load-status__message'); return !m || !/Loading/i.test(m.textContent); },
      { timeout: 60000 }
    ).catch(() => null);
    holding = false;

    const samples = await page.evaluate(() => { clearInterval(window.__m2Timer); return window.__m2; });
    const loadingSamples = samples.filter((s) => s.loading);
    if (loadingSamples.length < 5) {
      return record(id, 'FAIL',
        `the sampler only caught ${loadingSamples.length} in-flight frames even with /stats/daily held for ${HOLD_MS}ms — ` +
        'the check did not observe the window it exists to observe, so it proves nothing. ' +
        `DIAG: picked="${picked}", totalSamples=${samples.length}, ` +
        `statusBlockFrames=${samples.filter((s) => s.statusBlock).length}, ` +
        `distinctMsgs=${JSON.stringify([...new Set(samples.map((s) => s.msgText))].slice(0, 5))}, ` +
        `dailyRequests=${JSON.stringify(dailyReqs)}`);
    }

    const staleNumbers = loadingSamples.filter((s) => s.kpis.length > 0);
    const emptyDuringLoad = loadingSamples.filter((s) => s.empty);

    if (staleNumbers.length || emptyDuringLoad.length) {
      const worst = staleNumbers[0] || emptyDuringLoad[0];
      return record(id, 'FAIL',
        `during the ${loadingSamples.length}-frame load window: ` +
        `${staleNumbers.length} frames still showed KPI numbers` +
        (staleNumbers.length ? ` (first: ${JSON.stringify(worst.kpis)}, previous period was ${JSON.stringify(before.kpis)})` : '') +
        `, ${emptyDuringLoad.length} frames showed "No communication activity yet"`);
    }

    const after = await page.evaluate(() => ({
      kpis: [...document.querySelectorAll('.report-kpi__value')].map((n) => n.textContent.trim()),
      empty: !!document.querySelector('.communication-report__empty'),
      period: (document.querySelector('.md-stats-period-select__label') || {}).textContent
    }));

    record(id, 'PASS',
      `switched "${before.period}" → "${picked}"; across ${loadingSamples.length} sampled in-flight frames ` +
      `(/stats/daily held ${HOLD_MS}ms) the KPI block was absent in every frame and the empty state never appeared — ` +
      `only the Loading line. Before: ${JSON.stringify(before.kpis)}; after: ${JSON.stringify(after.kpis)}` +
      (after.empty ? ' (new period legitimately resolved to the empty state)' : ''));
  } finally {
    page.off('request', onReq);
    await page.setRequestInterception(false).catch(() => {});
  }
}

/* ------------------------------------------------------------ caseload ---- */

const rowTrigger = (userName) => `button.md-caseload__list-trigger[aria-controls="caseload-panel-${userName}"]`;

async function openCaseload(page) {
  await page.goto(OPTS.BASE + '/caseload', { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForSelector('.md-caseload__list-trigger', { timeout: 45000 });
  await sleep(2500);
}

/** Badge currently rendered in the open panel, scoped away from the unrelated
 *  `.md-caseload__badge-progress` widget lower in the same card. */
async function readBadge(page) {
  return page.evaluate(() => {
    const sec = document.querySelector('.md-caseload__bottom-row--badge');
    const card = sec && sec.closest('.md-caseload__card');
    const nameEl = sec && sec.querySelector('.md-caseload__badge-name');
    return {
      panel: card ? card.id : null,
      badgeName: nameEl ? nameEl.textContent.trim() : null,
      caption: (sec && sec.querySelector('.md-caseload__badge-explain-lead') || {}).textContent || null,
      emptyState: !!(sec && sec.querySelector('.md-caseload__goal-empty-title')),
      activeRow: (document.querySelector('.md-caseload__list-row--active .md-caseload__list-name') || {}).textContent || null
    };
  });
}

/* H5: click row A, then row B inside A's request window. B's badge must be the
 * one captioned under B, and A's LATE response must not overwrite it. */
async function checkH5(page) {
  const id = 'H5 (badge race captions one communicator with another\'s badge)';
  const A = OPTS.arg('--race-a', 'aiden_parker');
  const B = OPTS.arg('--race-b', 'bella_martinez');
  const A_ID = OPTS.arg('--race-a-id', '1_7');
  const HOLD_MS = 3000;

  const timeline = [];
  let aBody = null;
  await page.setRequestInterception(true);
  const onReq = async (req) => {
    const url = req.url();
    // index query only (`/badges?...`), never the `/badges/<id>` detail load
    if (/\/api\/v1\/badges\?/.test(url) && url.includes('user_id=' + A_ID)) {
      timeline.push({ ev: 'A_query_held', t: Date.now() });
      await sleep(HOLD_MS);
    }
    try { await req.continue(); } catch { /* already handled */ }
  };
  const onRes = async (res) => {
    const url = res.url();
    if (/\/api\/v1\/badges\?/.test(url)) {
      const who = url.includes('user_id=' + A_ID) ? 'A' : 'B';
      timeline.push({ ev: who + '_response', t: Date.now(), status: res.status() });
      if (who === 'A') { aBody = await res.text().catch(() => null); }
    }
  };
  page.on('request', onReq);
  page.on('response', onRes);

  try {
    // A COLD page load is mandatory: `_badgesForUser` caches per id on the
    // controller, which is a singleton that survives route exit, so a second
    // attempt in the same page has no request left to delay.
    await openCaseload(page);

    const haveRows = await page.evaluate((a, b) => ({
      a: !!document.querySelector(`button.md-caseload__list-trigger[aria-controls="caseload-panel-${a}"]`),
      b: !!document.querySelector(`button.md-caseload__list-trigger[aria-controls="caseload-panel-${b}"]`)
    }), A, B);
    if (!haveRows.a || !haveRows.b) {
      return record(id, 'SKIP', `caseload rows not found (${A}=${haveRows.a}, ${B}=${haveRows.b})`);
    }

    const t0 = Date.now();
    await clickForReal(page, rowTrigger(A));
    await sleep(500);
    await clickForReal(page, rowTrigger(B));
    timeline.push({ ev: 'B_clicked', t: Date.now() });

    // Settle past A's held response so a late clobber would have landed.
    await sleep(HOLD_MS + 3000);
    const seen = await readBadge(page);

    const expectB = 'Seed Badge for ' + B;
    const expectA = 'Seed Badge for ' + A;
    const aLate = timeline.find((e) => e.ev === 'A_response');
    const bResp = timeline.find((e) => e.ev === 'B_response');
    const raceReal = !!(aLate && bResp && aLate.t > bResp.t);

    if (!raceReal) {
      return record(id, 'FAIL',
        'the race window was never created — A\'s response did not land after B\'s, so nothing was tested. ' +
        `timeline=${JSON.stringify(timeline.map((e) => ({ ...e, t: e.t - t0 })))}`);
    }
    if (!aBody || !aBody.includes(expectA)) {
      return record(id, 'FAIL',
        'A\'s late response did not actually carry A\'s badge, so there was nothing that could have clobbered B. ' +
        `bodyHasA=${!!(aBody && aBody.includes(expectA))}`);
    }
    if (seen.badgeName !== expectB || seen.panel !== 'caseload-panel-' + B) {
      return record(id, 'FAIL',
        `cross-communicator attribution: panel=${seen.panel} activeRow=${(seen.activeRow || '').trim()} ` +
        `but badge shown = "${seen.badgeName}" (expected "${expectB}"${seen.badgeName === expectA ? ' — this is A\'s badge under B\'s name, the exact H5 defect' : ''})`);
    }

    record(id, 'PASS',
      `clicked ${A} then ${B} ${500}ms later with ${A}'s badge query held ${HOLD_MS}ms. ` +
      `${A}'s response landed ${aLate.t - bResp.t}ms AFTER ${B}'s and did carry "${expectA}", ` +
      `yet the panel settled as ${seen.panel} showing "${seen.badgeName}" — the stale guard discarded the late write. ` +
      `Caption: ${seen.caption ? JSON.stringify(seen.caption.trim().slice(0, 70)) : 'not rendered'}`);
  } finally {
    page.off('request', onReq);
    page.off('response', onRes);
    await page.setRequestInterception(false).catch(() => {});
  }
}

/* M9: every communicator's badge must resolve, past the old caseload-wide cap of 10. */
async function checkM9(page) {
  const id = 'M9 (caseload badges capped at 10 for the whole caseload)';
  const names = OPTS.arg('--m9-users',
    'aiden_parker,bella_martinez,charlie_kim,daisy_johnson,ethan_brown,fiona_davis,gabriel_wilson,oliver_harris,penelope_scott,quinn_taylor,ruby_adams,sam_mitchell,tessa_campbell').split(',');

  const reqs = [];
  const bad = [];
  const onReq = (r) => { if (/\/api\/v1\/badges\?/.test(r.url())) { reqs.push(r.url()); } };
  const onRes = (r) => { if (/\/api\/v1\/badges/.test(r.url()) && r.status() >= 400) { bad.push(r.status() + ' ' + r.url().slice(0, 120)); } };
  page.on('request', onReq);
  page.on('response', onRes);

  try {
    await openCaseload(page);
    const results = [];
    for (const n of names) {
      if (!(await page.$(rowTrigger(n)))) { results.push({ user: n, badgeName: null, note: 'row not present' }); continue; }
      await clickForReal(page, rowTrigger(n));
      await page.waitForFunction(
        () => !!document.querySelector('.md-caseload__bottom-row--badge'),
        { timeout: 20000 }
      ).catch(() => {});
      await sleep(900);
      const seen = await readBadge(page);
      results.push({ user: n, badgeName: seen.badgeName, empty: seen.emptyState, panel: seen.panel });
      await clickForReal(page, rowTrigger(n)); // collapse before the next row
      await sleep(350);
    }

    const wrong = results.filter((r) => r.badgeName !== 'Seed Badge for ' + r.user);
    const withRecent = reqs.filter((u) => /[?&]recent=/.test(u));

    if (wrong.length) {
      return record(id, 'FAIL',
        `${wrong.length}/${results.length} communicators did not resolve their own badge: ` +
        JSON.stringify(wrong) + (bad.length ? ` | non-200s: ${JSON.stringify(bad)}` : ''));
    }
    if (withRecent.length) {
      return record(id, 'FAIL', `${withRecent.length} badge queries still used the capped \`recent\` branch: ${JSON.stringify(withRecent.slice(0, 3))}`);
    }

    record(id, 'PASS',
      `all ${results.length} communicators resolved their OWN badge (well past the old caseload-wide cap of 10). ` +
      `${reqs.length} per-user badge queries fired, none using \`recent\`` +
      (bad.length ? `. NOTE non-200 badge responses: ${JSON.stringify(bad)}` : '. No non-200 badge responses.'));
  } finally {
    page.off('request', onReq);
    page.off('response', onRes);
  }
}

/* ------------------------------------------------------------------ H3 ---- */
/*
 * "Pick this Board" → copy → land on the new home board. The fix routed the
 * `as_home` copy through `saveHomeBoard` (utils/home_board.js), which READS BACK
 * what the server stored and rejects when it disagrees — `user.rb:2932-2941`
 * deletes the preference and still returns a clean 200 when the board cannot be
 * resolved, which the old unconfirmed `user.save().then(finalize(true))` reported
 * as success. The register verified this at the API layer only.
 *
 * Asserts the outcome the USER cares about: no error, a home board actually
 * stored, and the stored board really is the one that was picked (by parent key).
 */
async function checkH3(page, { caseName, targetId, targetName, forSelf }) {
  const id = `H3 case ${caseName} (home-board copy reports success without confirming the write)`;
  const CATEGORY = OPTS.arg('--h3-category', 'Functional Communication');
  const EXPECT_PARENT = OPTS.arg('--h3-parent-key', 'lingolinq/sequoia-15');

  const url = OPTS.BASE + '/board-picker' + (forSelf ? '' : '?user_id=' + targetId);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(6000);

  if (await page.$('.bp-options__btn--browse')) {
    await clickForReal(page, '.bp-options__btn--browse');
    await sleep(2500);
  }

  const cat = await page.evaluate((want) => {
    const c = [...document.querySelectorAll('.md-home-boards-picker__category')]
      .find((n) => n.textContent.trim().replace(/\s+/g, ' ').includes(want));
    if (!c) { return null; }
    c.click();
    return c.textContent.trim().replace(/\s+/g, ' ');
  }, CATEGORY);
  if (!cat) { return record(id, 'SKIP', `category "${CATEGORY}" not offered in the picker`); }
  await sleep(3500);

  const card = await page.$('.md-home-boards-picker__board [role="button"]');
  if (!card) { return record(id, 'SKIP', `no board cards under "${CATEGORY}"`); }
  const pickedLabel = await page.evaluate((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60), card);
  await card.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await sleep(200);
  await card.click();

  const preview = await page.waitForSelector('.md-board-details-modal', { visible: true, timeout: 30000 }).catch(() => null);
  if (!preview) { return record(id, 'SKIP', `clicking the "${pickedLabel}" card never opened the board preview`); }
  await sleep(1200);

  const pickBtn = await page.$('.md-board-preview__action--primary');
  if (!pickBtn) { return record(id, 'SKIP', '"Pick this Board" is absent from the preview (tour_board_picker_active not set?)'); }

  /*
   * Record every URL the app passes through, plus the values
   * `_finishPickForHome` branches on (board-preview-overlay.js:349), so a landing
   * URL that disagrees with the code reading can be diagnosed instead of guessed at.
   */
  await page.evaluate(() => {
    window.__nav = [window.location.pathname];
    window.__navTimer = setInterval(() => {
      const p = window.location.pathname;
      if (window.__nav[window.__nav.length - 1] !== p) { window.__nav.push(p); }
    }, 120);
  });

  await clickForReal(page, '.md-board-preview__action--primary');

  // The copy runs server-side; watch for either terminal state.
  const outcome = await page.waitForFunction(() => {
    const err = document.querySelector('.ll-toast--error');
    if (err) { return { kind: 'error', text: err.textContent.trim().slice(0, 160) }; }
    if (!/board-picker/.test(window.location.pathname)) { return { kind: 'moved', to: window.location.pathname }; }
    return false;
  }, { timeout: 180000, polling: 300 }).then((h) => h.jsonValue()).catch(() => null);

  if (!outcome) {
    return record(id, 'FAIL', `the copy never reached a terminal state within 180s — still on ${page.url()}`);
  }
  if (outcome.kind === 'error') {
    return record(id, 'FAIL', `the pick failed with a user-visible error: "${outcome.text}"`);
  }

  await sleep(4000);
  const nav = await page.evaluate(() => {
    clearInterval(window.__navTimer);
    var app = window.LingoLinq.appState;
    return {
      trail: window.__nav,
      finalPath: window.location.pathname,
      setupUserId: app.get('setup_user.id') || null,
      currentUserId: app.get('currentUser.id') || null,
      sessionUserId: app.get('sessionUser.id') || null,
      pendingSpeakTour: app.get('board_detail_tour_pending_speak') || null
    };
  });

  const stored = await page.evaluate(async (uid, parentKey) => {
    try {
      const u = await window.LingoLinq.store.findRecord('user', uid, { reload: true });
      const hb = u.get('preferences.home_board');
      if (!hb || !hb.id) { return { ok: false, home: hb || null }; }
      const b = await window.LingoLinq.store.findRecord('board', hb.id, { reload: true });
      return {
        ok: true,
        home: { id: hb.id, key: hb.key },
        boardKey: b.get('key'),
        parentKey: b.get('parent_board_key'),
        matchesPick: b.get('parent_board_key') === parentKey || b.get('key') === parentKey
      };
    } catch (e) { return { ok: false, threw: String(e).slice(0, 160) }; }
  }, targetId, EXPECT_PARENT);

  if (!stored.ok) {
    return record(id, 'FAIL',
      `landed on ${outcome.to} reporting success, but ${targetName} has NO home board stored ` +
      `(${JSON.stringify(stored)}) — exactly the unconfirmed-write the fix exists to catch`);
  }
  if (!stored.matchesPick) {
    return record(id, 'FAIL',
      `a home board was stored (${stored.home.key}) but it is not a copy of the picked board: ` +
      `parent_board_key=${stored.parentKey}, expected ${EXPECT_PARENT}`);
  }

  record(id, 'PASS',
    `picked "${pickedLabel}" for ${targetName} → landed on ${outcome.to}; ` +
    `home board stored as ${stored.home.key} (id ${stored.home.id}), whose parent_board_key is ` +
    `${stored.parentKey} — i.e. the board actually picked, confirmed by re-reading the user from the server. ` +
    `NAV ${JSON.stringify(nav)}`);
}

/** Re-read the target user from the SERVER and confirm the stored home board is
 *  really a copy of the board that was picked. Shared by every H3 case. */
async function readBackHomeBoard(page, targetId, expectParent) {
  return page.evaluate(async (uid, parentKey) => {
    try {
      const u = await window.LingoLinq.store.findRecord('user', uid, { reload: true });
      const hb = u.get('preferences.home_board');
      if (!hb || !hb.id) { return { ok: false, home: hb || null }; }
      const b = await window.LingoLinq.store.findRecord('board', hb.id, { reload: true });
      return {
        ok: true,
        home: { id: hb.id, key: hb.key },
        boardKey: b.get('key'),
        parentKey: b.get('parent_board_key'),
        matchesPick: b.get('parent_board_key') === parentKey || b.get('key') === parentKey
      };
    } catch (e) { return { ok: false, threw: String(e).slice(0, 160) }; }
  }, targetId, expectParent);
}

/*
 * H3 case (c) — the ORG-BOARD branch (edit_manager.js:2546-2582).
 *
 * This branch is NOT reachable from the board picker: the org home board is
 * private (`public=false`) and appears in no picker category, and the picker in
 * this layout renders no search box. The real entry point is
 * board-detail → "Set as Home Board" → set-as-home modal → "Make a New Copy",
 * which calls copy_board(board, 'links_copy_as_home', user) — the same decision
 * string, so the same org branch (components/set-as-home.js:180-187).
 *
 * Confirms the two guards the fix added did not break the working case: the
 * `if(org && org.id)` deref guard (:2557) and the stored-id presence check (:2578).
 */
async function checkH3c(page) {
  const id = 'H3 case c (org-board communicator)';
  const ORG_BOARD = OPTS.arg('--org-board', 'sarah_chen_slp/demo_district_home');
  const TARGET = OPTS.arg('--org-target', 'bella_martinez');
  const TARGET_ID = OPTS.arg('--org-target-id', '1_8');

  await page.goto(OPTS.BASE + '/' + ORG_BOARD, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(7000);

  let entry = await page.$('button[data-bd-action="set_as_home"]');
  if (!entry) {
    /*
     * `set_as_home` lives inside `.md-board-edit-panel`, which board-detail keeps
     * collapsed behind the `toggle_panels` action — the only panel affordance the
     * page exposes at load.
     */
    const opened = await page.evaluate(() => {
      const t = document.querySelector('[data-bd-action="toggle_panels"]');
      if (t) { t.click(); return true; }
      return false;
    });
    if (opened) { await sleep(2500); entry = await page.$('button[data-bd-action="set_as_home"]'); }
  }
  if (!entry) {
    /*
     * The board-detail edit panel only renders under `edit_mode`
     * (templates/user/board-detail.hbs:121), and the index route is speak mode.
     * The application chrome carries the same action independently
     * (templates/application.hbs:475 and :595, action `setAsHome`), so fall back
     * to that — it opens the identical set-as-home modal.
     */
    const viaChrome = await page.evaluate(() => {
      const n = [...document.querySelectorAll('button, a')]
        .find((e) => /^\s*Set as Home\s*$/i.test(e.textContent.replace(/\s+/g, ' ')));
      if (n) { n.click(); return true; }
      return false;
    });
    if (viaChrome) {
      await sleep(2500);
      if (await page.$('.user_select, .md-modal-btn--primary')) { entry = true; }
    }
  }
  if (!entry) {
    const diag = await page.evaluate(() => ({
      url: window.location.pathname,
      hasPanel: !!document.querySelector('.md-board-edit-panel'),
      actions: [...document.querySelectorAll('[data-bd-action]')].map((n) => n.getAttribute('data-bd-action')).slice(0, 15)
    }));
    return record(id, 'SKIP', `"Set as Home Board" not reachable on ${ORG_BOARD}: ${JSON.stringify(diag)}`);
  }

  // The chrome fallback above already opened the modal; only the panel row needs a click.
  if (entry !== true) { await clickForReal(page, 'button[data-bd-action="set_as_home"]'); }
  const modal = await page.waitForSelector('.user_select, .md-modal-btn--primary', { visible: true, timeout: 20000 }).catch(() => null);
  if (!modal) { return record(id, 'SKIP', 'the set-as-home modal never opened'); }
  await sleep(1500);

  // Choose the org communicator, not the board's owner.
  const chose = await page.evaluate((name) => {
    const btn = [...document.querySelectorAll('button.user_select')].find((b) => b.textContent.includes(name));
    if (!btn || btn.disabled) { return false; }
    btn.click();
    return true;
  }, TARGET);
  if (!chose) {
    const avail = await page.evaluate(() => [...document.querySelectorAll('button.user_select')].map((b) => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)));
    return record(id, 'SKIP', `${TARGET} was not selectable in the set-as-home user list: ${JSON.stringify(avail.slice(0, 12))}`);
  }
  await sleep(1500);

  const copied = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.md-modal-btn--primary')]
      .find((b) => /make a new copy|make my own copy/i.test(b.textContent));
    if (!btn || btn.disabled) { return false; }
    btn.click();
    return true;
  });
  if (!copied) {
    const btns = await page.evaluate(() => [...document.querySelectorAll('.md-modal-btn')].map((b) => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)));
    return record(id, 'SKIP', `no "Make a New Copy" button (selected user may own the board): ${JSON.stringify(btns)}`);
  }

  const outcome = await page.waitForFunction(() => {
    const err = document.querySelector('.ll-toast--error, .md-modal-status--error');
    if (err) { return { kind: 'error', text: err.textContent.trim().slice(0, 160) }; }
    if (!document.querySelector('.md-modal-btn--primary')) { return { kind: 'closed', to: window.location.pathname }; }
    return false;
  }, { timeout: 180000, polling: 400 }).then((h) => h.jsonValue()).catch(() => null);

  if (!outcome) { return record(id, 'FAIL', `the org copy never reached a terminal state within 180s (still on ${page.url()})`); }
  if (outcome.kind === 'error') { return record(id, 'FAIL', `org-board copy surfaced an error: "${outcome.text}"`); }

  await sleep(5000);
  const stored = await readBackHomeBoard(page, TARGET_ID, ORG_BOARD);
  if (!stored.ok) {
    return record(id, 'FAIL', `org branch reported success but ${TARGET} has no home board stored: ${JSON.stringify(stored)}`);
  }
  if (!stored.matchesPick) {
    return record(id, 'FAIL',
      `${TARGET}'s home board is ${stored.home.key} (parent ${stored.parentKey}), not derived from the org board ${ORG_BOARD}`);
  }
  record(id, 'PASS',
    `org-board copy for ${TARGET} completed (${outcome.kind}); home board stored as ${stored.home.key} ` +
    `(id ${stored.home.id}), parent_board_key=${stored.parentKey} — the org branch's new guards did not break the working case`);
}

/* --------------------------------------------- modeling-only badge access -- */
/*
 * Does M9's per-user badge query REGRESS a modeling-only supporter?
 *
 * Before M9 the caseload issued ONE `{user_id: <supporter>, recent: 1}` query.
 * That branch (badges_controller.rb:11-16) expands to `user.supervisees` and
 * returns their badges with NO per-supervisee permission check — the supporter is
 * asking about themselves, so `allowed?(user,'view_detailed')` at :6 always passed.
 * After M9 the query is per-communicator, so :6 now evaluates against the
 * COMMUNICATOR — and ca629dda9 removed `view_detailed` from modeling-only links.
 *
 * Requires a supporter who is modeling-only linked AND NOT an org manager for that
 * communicator: the manager grant in user.rb is not modeling-gated, so an org
 * manager keeps `view_detailed` and never reaches this path.
 *
 * Control row (a normal link) and subject row (the modeling-only link) are read in
 * the same session, so a failure cannot be blamed on the page or the login.
 */
async function checkModelingBadge(page) {
  const id = 'M9 follow-up (modeling-only link vs the new per-user badge query)';
  const CONTROL = OPTS.arg('--control-user', 'oliver_harris');
  const SUBJECT = OPTS.arg('--subject-user', 'tessa_campbell');
  const SUBJECT_ID = OPTS.arg('--subject-id', '1_26');

  const badgeCalls = [];
  const onRes = (r) => {
    const u = r.url();
    if (/\/api\/v1\/badges/.test(u)) { badgeCalls.push({ url: u.slice(u.indexOf('/api')), status: r.status() }); }
  };
  page.on('response', onRes);

  try {
    await openCaseload(page);

    const readRow = async (name) => {
      if (!(await page.$(rowTrigger(name)))) { return { user: name, missing: true }; }
      await clickForReal(page, rowTrigger(name));
      // Settle: the badge block is REMOVED while badgeLoading is true, so wait for
      // it to come back rather than sampling a hole.
      const back = await page.waitForFunction(
        () => !!document.querySelector('.md-caseload__bottom-row--badge'),
        { timeout: 25000 }
      ).catch(() => null);
      await sleep(1200);
      const seen = await page.evaluate(() => {
        const sec = document.querySelector('.md-caseload__bottom-row--badge');
        const card = sec && sec.closest('.md-caseload__card');
        return {
          panel: card ? card.id : null,
          badgeName: (sec && sec.querySelector('.md-caseload__badge-name') || {}).textContent || null,
          emptyTitle: (sec && sec.querySelector('.md-caseload__goal-empty-title') || {}).textContent || null,
          modelingHint: (sec && sec.querySelector('.md-caseload__goal-hint') || {}).textContent || null,
          addGoalBtn: !!(sec && sec.querySelector('.md-caseload__goal-empty-add'))
        };
      });
      const out = { user: name, stuckLoading: !back, ...seen };
      await clickForReal(page, rowTrigger(name));
      await sleep(400);
      return out;
    };

    const control = await readRow(CONTROL);
    const before = badgeCalls.length;
    const subject = await readRow(SUBJECT);
    const subjectCalls = badgeCalls.slice(before);

    if (control.missing || subject.missing) {
      return record(id, 'SKIP', `rows missing from this caseload: ${JSON.stringify({ control, subject })}`);
    }
    if (control.badgeName !== 'Seed Badge for ' + CONTROL) {
      return record(id, 'SKIP',
        `the CONTROL row did not resolve its badge (${JSON.stringify(control)}) — the subject result would not be interpretable`);
    }

    const denied = subjectCalls.filter((c) => c.status >= 400 && c.url.includes('user_id=' + SUBJECT_ID));

    if (subject.stuckLoading) {
      return record(id, 'FAIL',
        `REGRESSION: the modeling-only row never finished loading — the badge block never returned. calls=${JSON.stringify(subjectCalls)}`);
    }
    if (subject.badgeName && subject.badgeName !== 'Seed Badge for ' + SUBJECT) {
      return record(id, 'FAIL',
        `REGRESSION: the modeling-only row rendered someone else's badge: "${subject.badgeName}"`);
    }

    /*
     * What did the PRE-M9 path return for this same modeling-only link? The
     * `recent` branch (badges_controller.rb:11-16) expands `user.supervisees` and
     * applies NO per-supervisee permission check, so if the subject's badge comes
     * back here, M9's per-user query closed a real cross-link exposure — and the
     * dashboard (components/dashboard/authenticated-view.js:639) still issues
     * exactly this query.
     */
    const legacy = await page.evaluate(async (subjectName) => {
      try {
        const me = window.LingoLinq.appState.get('sessionUser.id');
        const rows = await window.LingoLinq.store.query('badge', { user_id: me, recent: 1 });
        // Ember Data 5.3 dropped `toArray()` on query results; a `rows.toArray ? … : []`
        // guard would silently report "no leak" from a broken read.
        const list = Array.from(rows || []);
        const how = 'Array.from len=' + list.length + ' (toArray=' + (typeof rows.toArray) + ', length=' + rows.length + ')';
        const names = list.map((b) => (b && b.get ? b.get('name') : String(b)));
        return { ok: true, how, count: names.length, leaksSubject: names.some((n) => (n || '').includes(subjectName)), names };
      } catch (e) { return { ok: false, err: String(e).slice(0, 140) }; }
    }, SUBJECT);

    record(id, 'INFO',
      `control ${CONTROL} (normal link): badge "${(control.badgeName || '').trim()}". ` +
      `subject ${SUBJECT} (modeling-only link): ` +
      `badge=${subject.badgeName ? JSON.stringify(subject.badgeName.trim()) : 'none'}, ` +
      `emptyTitle=${subject.emptyTitle ? JSON.stringify(subject.emptyTitle.trim()) : 'none'}, ` +
      `modelingHint=${subject.modelingHint ? JSON.stringify(subject.modelingHint.trim()) : 'NOT RENDERED'}, ` +
      `addGoalButton=${subject.addGoalBtn}, ` +
      `badgeCalls=${JSON.stringify(subjectCalls)}. ` +
      `UI did not hang and did not misattribute. ` +
      `LEGACY \`recent\` branch (still used by the dashboard): ${legacy.ok
        ? `${legacy.count} badges [${legacy.how}], leaks the modeling-only subject = ${legacy.leaksSubject} — ${JSON.stringify(legacy.names)}`
        : `query failed: ${legacy.err}`}`);
  } finally {
    page.off('response', onRes);
  }
}

/* ------------------------------------------------------- picker inventory -- */
/*
 * Diagnostic, not an assertion: dumps the categories and board cards the picker
 * actually offers, so an H3 run can choose a SMALL board (a `links_copy_as_home`
 * copies the whole downstream set — Vocal Flair 84 is ~98 boards) and so we can
 * see whether a private org home board is reachable through the UI at all.
 */
async function checkPickerInventory(page) {
  const id = 'picker-inventory (diagnostic)';
  await page.goto(OPTS.BASE + '/board-picker?user_id=' + OPTS.arg('--target-id', '1_8'), { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(6000);
  if (await page.$('.bp-options__btn--browse')) {
    await clickForReal(page, '.bp-options__btn--browse');
    await sleep(2500);
  }

  const cats = await page.evaluate(() =>
    [...document.querySelectorAll('.md-home-boards-picker__category')].map((c) => c.textContent.trim().replace(/\s+/g, ' ')));

  const perCat = [];
  for (let i = 0; i < cats.length; i++) {
    await page.evaluate((idx) => document.querySelectorAll('.md-home-boards-picker__category')[idx].click(), i);
    await sleep(3000);
    const boards = await page.evaluate(() =>
      [...document.querySelectorAll('.md-home-boards-picker__board [role="button"]')]
        .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)));
    perCat.push({ category: cats[i], count: boards.length, boards: boards.slice(0, 12) });
  }

  const search = await page.evaluate(() => !!document.querySelector('#board-picker-search-q'));
  record(id, 'INFO', JSON.stringify({ categories: cats, perCat, hasSearchBox: search }, null, 1));
}

const CHECKS = {
  h4: checkH4,
  h5: checkH5,
  m9: checkM9,
  // Supervisor picks for a communicator who owns no copy.
  h3a: (page) => checkH3(page, { caseName: 'a (supervisor picks for a communicator)', targetId: '1_8', targetName: 'bella_martinez', forSelf: false }),
  // Communicator picks their own, with no existing copy of that board.
  // Parameterised: once a communicator owns a copy of the picked board the flow
  // takes the reuse-existing branch instead, so a re-run needs a fresh subject.
  h3b: (page) => checkH3(page, {
    caseName: 'b (communicator with no existing copy)',
    targetId: OPTS.arg('--self-id', '1_7'),
    targetName: OPTS.arg('--self-name', 'aiden_parker'),
    forSelf: true
  }),
  h3c: checkH3c,
  modelingbadge: checkModelingBadge,
  pickerinv: checkPickerInventory,
  m2: (page) => checkM2(page, OPTS.arg('--stats-user', OPTS.USER))
};

(async () => {
  const { browser, page } = await launch(OPTS);
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') { consoleErrors.push(m.text().slice(0, 200)); } });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + String(e).slice(0, 200)));

  try {
    await login(page, OPTS);
    const names = ONLY ? ONLY.split(',') : Object.keys(CHECKS);
    for (const n of names) {
      const fn = CHECKS[n.trim()];
      if (!fn) { console.log('no such check: ' + n); continue; }
      try { await fn(page); } catch (e) { record(n, 'ERROR', String(e && e.message || e)); }
    }
  } finally {
    console.log('\n================ SUMMARY ================');
    for (const r of results) { console.log(`${r.status.padEnd(5)} ${r.id}`); }
    if (consoleErrors.length) {
      console.log('\nconsole errors (deduped):');
      for (const e of [...new Set(consoleErrors)].slice(0, 10)) { console.log('  ' + e); }
    }
    await browser.close();
  }
})();
