/**
 * Create Board (new page): the Core Words switch reaches the request.
 *
 * `create-board-new.js` hard-coded `include_core_words: true` in the
 * generate_labels payload. The Rails prompt builder swaps its whole vocabulary
 * instruction on that flag (lib/ai_board_generator.rb:96) and appends it AFTER the
 * user's description, so a topic-only request ("animals, no core vocabulary") still
 * came back full of I / want / go / more / help. The old generate-board MODAL has
 * the checkbox; the page never had one.
 *
 * The check that matters is the PAYLOAD, not the pixels — a toggle that flips
 * `aria-checked` but still sends `true` is the exact bug being fixed. So the probe
 * intercepts POST /api/v1/boards/generate_labels, reads `include_core_words` off the
 * body, and ABORTS the request: no model spend, no rate limit, and the assertion is
 * deterministic.
 *
 *   1. AI mode renders the switch, default ON, with the "checked" hint copy
 *   2. regular Create Board does NOT render it
 *   3. toggling flips aria-checked and swaps the hint to the "unchecked" copy
 *   4. default state sends include_core_words: true
 *   5. toggled off, it sends include_core_words: false   <- the bug
 *
 * Usage:
 *   node scripts/create-board-core-words-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATE = () => {
  const q = (s) => document.querySelector(s);
  const vis = (el) => !!(el && el.getClientRects().length > 0);
  const sw = q('.nb-ai-generate__core-words .nb-toggle__switch');
  return {
    aiBlock: vis(q('.nb-ai-generate')),
    aiBlockInDom: !!q('.nb-ai-generate'),
    rowInDom: !!q('.nb-ai-generate__core-words'),
    descField: vis(q('#new_board_description')),
    aiBadge: vis(q('.nb-ai-sparkle-badge')),
    sections: [...document.querySelectorAll('section, .nb-section')].map((e) => String(e.className).split(' ')[0]).slice(0, 8),
    row: vis(q('.nb-ai-generate__core-words')),
    label: ((q('.nb-ai-generate__core-words .nb-toggle-row__question') || {}).textContent || '').trim() || null,
    checked: sw ? sw.getAttribute('aria-checked') : null,
    role: sw ? sw.getAttribute('role') : null,
    hint: ((q('#new_board_core_words_hint') || {}).textContent || '').trim(),
    generateBtn: vis(q('.nb-ai-generate__btn'))
  };
};

const clickSel = async (page, sel) => {
  const h = await page.$(sel);
  if (!h) { return false; }
  const b = await h.boundingBox();
  if (!b) { return false; }
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  return true;
};

/* The EU AI Act Art.50 disclosure is a BLOCK-mode gate on first AI use
   (create-board-new.js#generate_labels_with_ai -> article50Gate.presentBlockingGate).
   If it appears, the request never fires until it is acknowledged. */
const clearArticle50 = async (page) => {
  await sleep(1200);
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll('.modal-content button, .md-modal button, .la-modal button')]
      .find((b) => b.getClientRects().length > 0 &&
        /continue|accept|acknowledge|got it|ok|understand/i.test((b.textContent || '').trim()));
    if (btn) { btn.click(); return true; }
    return false;
  });
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  let captured = null;
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/api\/v\d+\/boards\/generate_labels/.test(req.url())) {
        try { captured = JSON.parse(req.postData() || '{}'); } catch (e) { captured = { _unparsed: req.postData() }; }
        // Abort rather than continue: we only need the payload, and letting it
        // through would spend real model calls on every run.
        try { req.abort(); } catch (e) { /* handled */ }
        return;
      }
      try { req.continue(); } catch (e) { /* handled */ }
    });

    await page.goto(`${OPTS.BASE}/create-board-new`, { waitUntil: 'domcontentloaded' });
    await sleep(6000);

    /* The STANDALONE page opens a create chooser (`show_create_chooser`,
       create-board-new.hbs:43) — the `.nb-generate-ai-btn` entry only exists in the
       MODAL variant, behind `{{#unless this.standalone}}`. So AI mode is entered
       here via the chooser's "Generate with AI" option. */
    const chooserAi = await clickSel(page, '.nb-create-chooser__btn--ai');
    /* `choose_ai` runs the AI access gate first. When the account has not opted in
       (`boardGenerationEntry` -> 'needs_opt_in', which is any account whose
       `preferences.ai_board_generation` is not explicitly true) the app hides the
       chooser and opens the enable-ai-features modal; AI mode is only entered after
       its primary button is pressed. That is the real user path, so drive it. */
    await sleep(2000);
    const optedIn = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.md-modal-btn--primary')]
        .find((b) => b.getClientRects().length > 0 && /enable ai board generation/i.test((b.textContent || '').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (optedIn) { console.log('   (completed the enable-AI-features opt-in modal)'); await sleep(3000); }
    if (!chooserAi) {
      const diag = await page.evaluate(() => ({
        chooser: !!document.querySelector('.nb-create-chooser'),
        options: [...document.querySelectorAll('.nb-create-chooser__btn')].map((b) => b.className)
      }));
      fail('precondition — AI mode reachable', `"Generate with AI" not in the chooser: ${JSON.stringify(diag)}`);
      throw new Error('no ai mode');
    }
    await sleep(3500);

    let s = await page.evaluate(STATE);
    if (s.row && s.checked === 'true' && s.role === 'switch' && s.generateBtn) {
      pass('1. AI mode renders the switch, default ON', `label "${s.label}", role=switch, aria-checked=true, above the Generate button`);
    } else {
      fail('1. AI mode renders the switch, default ON', JSON.stringify(s));
    }
    const hintOn = s.hint;

    /* 3. Toggling flips state AND swaps the hint copy. */
    await clickSel(page, '.nb-ai-generate__core-words .nb-toggle__switch');
    await sleep(1200);
    let off = await page.evaluate(STATE);
    if (off.checked === 'false' && off.hint && off.hint !== hintOn) {
      pass('3. toggling flips the switch and swaps the hint copy',
        `aria-checked false; hint changed to "${off.hint.slice(0, 58)}…"`);
    } else {
      fail('3. toggling flips the switch and swaps the hint copy', JSON.stringify({ hintOn: hintOn.slice(0, 40), off }));
    }

    /* Back ON for the default-payload check. */
    await clickSel(page, '.nb-ai-generate__core-words .nb-toggle__switch');
    await sleep(1000);

    /* A description is required before Generate will fire. */
    await page.evaluate(() => {
      const t = document.querySelector('#new_board_description');
      if (t) {
        t.value = 'animals, no core vocabulary';
        t.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await sleep(1500);

    /* 4. Default ON -> payload true */
    captured = null;
    await clickSel(page, '.nb-ai-generate__btn');
    await clearArticle50(page);
    await sleep(4000);
    if (captured && captured.include_core_words === true) {
      pass('4. default state sends include_core_words: true',
        `payload prompt="${String(captured.prompt).slice(0, 32)}…" rows=${captured.rows} columns=${captured.columns}`);
    } else {
      fail('4. default state sends include_core_words: true', `captured: ${JSON.stringify(captured)}`);
    }

    /* 5. Toggled OFF -> payload false. This is the bug. */
    await sleep(1500);
    await clickSel(page, '.nb-ai-generate__core-words .nb-toggle__switch');
    await sleep(1200);
    off = await page.evaluate(STATE);
    captured = null;
    await clickSel(page, '.nb-ai-generate__btn');
    await clearArticle50(page);
    await sleep(4000);
    if (captured && captured.include_core_words === false) {
      pass('5. toggled OFF sends include_core_words: false',
        `aria-checked=${off.checked}; payload include_core_words=false — the topic-only prompt is now reachable`);
    } else {
      fail('5. toggled OFF sends include_core_words: false', `aria-checked=${off.checked}; captured: ${JSON.stringify(captured)}`);
    }
    /* 2. Regular Create Board must NOT show it. Asserted on the real regular FORM,
       not on the chooser screen — leaving the chooser up would make "absent" true
       for the wrong reason. Route: "Other Create Board Methods" reopens the chooser,
       then "Create My Own Board" lands on the regular form. */
    await sleep(1000);
    const reopened = await clickSel(page, '.nb-other-methods-btn');
    if (!reopened) {
      fail('2. regular Create Board does not render the Core Words switch', 'could not reopen the create chooser');
    } else {
      await sleep(1500);
      const own = await clickSel(page, '.nb-create-chooser__btn--own');
      await sleep(2500);
      const reg = await page.evaluate(() => {
        const q = (x) => document.querySelector(x);
        const vis = (el) => !!(el && el.getClientRects().length > 0);
        return {
          chooserGone: !q('.nb-create-chooser'),
          nameField: vis(q('#new_board_name')),
          row: vis(q('.nb-ai-generate__core-words')),
          aiBlock: vis(q('.nb-ai-generate'))
        };
      });
      if (own && reg.chooserGone && reg.nameField && !reg.row && !reg.aiBlock) {
        pass('2. regular Create Board does not render the Core Words switch',
          'on the real regular form (chooser closed, Name field visible): no toggle row, no .nb-ai-generate');
      } else {
        fail('2. regular Create Board does not render the Core Words switch', JSON.stringify(reg));
      }
    }
  } catch (e) {
    if (!/no ai mode/.test(e.message)) {
      console.log('\nERROR ' + e.message);
      results.push({ n: 'probe completed', ok: false });
    }
  } finally {
    await browser.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})();
