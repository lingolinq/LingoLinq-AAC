/**
 * Does the Speak control say everything the sentence bar SHOWS?
 *
 * board-detail keeps its own `sentence_parts` (what the bar renders) and the app keeps
 * `app_state.button_list` (the real utterance). Phrase Builder pushes to the first only —
 * deliberately: the mirror at board-detail.js:932 is documented add-only, and local-only
 * sources "carry no raw_index". `_speak_current_sentence` then branches: if button_list has
 * anything speakable it calls `utterance.vocalize_list`, else it falls back to TTS of
 * `sentence_speak_text`. The comment there says the fallback is "for phrase-builder-only
 * chips" — so the ALL-phrase-builder case is handled. This tests the MIXED case: one real
 * board button plus one phrase-builder word.
 *
 * Observes `speecher.speak_text` / `speak_audio` — what is actually said — rather than any
 * computed property, so the answer does not depend on which list is believed to be right.
 *
 * Usage:
 *   node scripts/phrase-builder-speak-qa.mjs --user <u> --pass <p> --board <slug>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const READ = () => ({
  bar: [...document.querySelectorAll('.md-board-detail-sentence-bar__chip')]
    .map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim()).join(' | '),
  button_list: (window.appState.get('button_list') || []).map((b) => b.label).join(' | ')
});

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${BOARD}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
    await sleep(3000);

    /* Spy on stashes.log BEFORE anything is picked — installing it later (as the first
       attempt did) reports "(none)" simply because nothing happened in between, which reads
       like missing logging. */
    await page.evaluate(() => {
      window.__logged = [];
      const st = window.stashes;
      const orig = st.log.bind(st);
      st.log = function(ev) {
        if (ev && ev.label) {
          try { window.__logged.push(ev.label + '@board:' + JSON.stringify((ev.board || {}).id)); }
          catch (e) { window.__logged.push('(unserializable)'); }
        }
        return orig(ev);
      };
      try { window.utterance.clear(); } catch (e) { /* already empty */ }
    });
    await sleep(700);

    // 1. a REAL board button — goes through activate_button, so it lands in button_list
    const tapped = await page.evaluate(() => {
      /* A PLAIN WORD, chosen by label. Taking "the first non-empty card" picked `people`,
         which is a FOLDER — it navigated to a sub-board instead of adding anything, and
         every later step then ran against the wrong screen. */
      const words = ['want', 'like', 'eat', 'drink', 'play', 'go'];
      const cards = [...document.querySelectorAll('.md-board-detail-symbol-card')];
      const card = cards.find((c) => words.indexOf((c.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()) >= 0);
      if (!card) { return null; }
      card.click();
      return (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    });
    await sleep(1500);
    let s = await page.evaluate(READ);
    console.log(`1. tapped board button "${tapped}"`);
    console.log(`   bar=[${s.bar}]   button_list=[${s.button_list}]`);

    // 2. a PHRASE BUILDER word
    await page.evaluate(() => {
      [...document.querySelectorAll('[data-bd-action="nav_select"]')]
        .find((b) => b.getAttribute('data-bd-arg') === 'phrase-builder').click();
    });
    await sleep(1500);
    const box = await page.$('#bd-phrase-builder-search');
    await box.type('good');
    await sleep(2500);
    const picked = await page.evaluate(() => {
      const btn = document.querySelector('.md-board-detail-phrase-builder__sentence-chip--match, .md-board-detail-phrase-builder__chip');
      if (!btn) {
        /* Report what the panel IS showing rather than a bare null — the first run searched
           a word that is not on this board and the null read like a broken selector. */
        const panel = document.querySelector('.md-board-detail-phrase-builder');
        return { none: true, panel: panel ? (panel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140) : '(no panel)' };
      }
      btn.click();
      return { label: (btn.textContent || '').replace(/\s+/g, ' ').trim() };
    });
    await sleep(1200);
    s = await page.evaluate(READ);
    if (picked.none) { console.log(`2. NO phrase-builder result to pick. Panel: "${picked.panel}"`); }
    else { console.log(`2. picked phrase-builder word "${picked.label}"`); }
    console.log(`   stashes.log so far: ${(await page.evaluate(() => window.__logged || [])).join('  ') || '(none)'}`);
    console.log(`   bar=[${s.bar}]   button_list=[${s.button_list}]`);

    // 3. SPEAK, watching what actually comes out
    await page.evaluate(() => {
      window.__spoken = [];
      const sp = window.speecher;
      ['speak_text', 'speak_audio'].forEach((fn) => {
        if (typeof sp[fn] !== 'function') { return; }
        const orig = sp[fn].bind(sp);
        sp[fn] = function(...args) {
          window.__spoken.push(fn + '(' + String(args[0]).slice(0, 40) + ')');
          return orig(...args);
        };
      });
      /* WHICH BRANCH ran, not just what came out. vocalize_list batches its TTS into a
         single speak_text when no button carries a sound, so the two paths are
         indistinguishable from the speech calls alone — the control looked identical to the
         fallback until this was added. */
      const ut = window.utterance;
      const orig_vl = ut.vocalize_list.bind(ut);
      ut.vocalize_list = function(...args) {
        window.__spoken.push('>>vocalize_list');
        return orig_vl(...args);
      };
    });
    await page.evaluate(() => {
      document.querySelector('[data-bd-action="speak_sentence"]').click();
    });
    await sleep(3500);
    const spoken = await page.evaluate(() => window.__spoken || []);
    console.log('3. pressed Speak');
    console.log(`   spoken: ${spoken.length ? spoken.join('  ') : '(nothing captured)'}`);
    console.log(`   bar still shows: [${(await page.evaluate(READ)).bar}]`);

    /* CONTROL: a bar of only REAL board buttons must still take the vocalize_list path, or
       the fix would have traded a silent word for silent button SOUNDS. vocalize_list speaks
       button by button, so it shows as several calls; the text fallback shows as one call
       carrying the whole sentence. */
    /* Back to the symbol board first — the Phrase Builder view REPLACES the grid, so the
       symbol cards are not in the DOM while it is open and the control silently set up
       nothing. */
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[data-bd-action="nav_select"]')]
        .find((b) => b.getAttribute('data-bd-arg') === 'symbol-board');
      if (btn) { btn.click(); }
    });
    await sleep(2000);
    await page.evaluate(() => { window.__spoken = []; try { window.utterance.clear(); } catch (e) { /* empty */ } });
    await sleep(800);
    const tapped2 = await page.evaluate(() => {
      const words = ['want', 'like', 'eat', 'drink', 'play', 'go'];
      const cards = [...document.querySelectorAll('.md-board-detail-symbol-card')];
      const hits = cards.filter((c) => words.indexOf((c.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()) >= 0).slice(0, 2);
      hits.forEach((c) => c.click());
      return hits.map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim()).join(' | ');
    });
    await sleep(2000);
    await page.evaluate(() => { window.__spoken = []; document.querySelector('[data-bd-action="speak_sentence"]').click(); });
    await sleep(3500);
    const s2 = await page.evaluate(READ);
    const spoken2 = await page.evaluate(() => window.__spoken || []);
    /* 5. A word from a LINKED SUB-BOARD, not on this board — the case that decides whether
          routing through activateButton is compatible with the cross-board search. Also
          spies on stashes.log, because "it is now usage-logged" is a claim, not a given. */
    /* FRESH PAGE for the cross-board case. The walk is async and re-runs on every entry to
       the view; on a second entry within the same session it had not finished before the
       search ran, and reported "No matches" for a word that IS in the set. The app logs
       "[PHRASE] walk complete" — wait for that rather than for a wall-clock guess. */
    let walk_done = false;
    page.on('console', (m) => { if ((m.text() || '').indexOf('walk complete') >= 0) { walk_done = true; } });
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
    await sleep(2500);
    await page.evaluate(() => {
      window.__logged = [];
      const st = window.stashes;
      const orig = st.log.bind(st);
      st.log = function(ev) {
        if (ev && ev.label) { window.__logged.push(ev.label + '@board:' + JSON.stringify((ev.board || {}).id)); }
        return orig(ev);
      };
      try { window.utterance.clear(); } catch (e) { /* empty */ }
      [...document.querySelectorAll('[data-bd-action="nav_select"]')]
        .find((b) => b.getAttribute('data-bd-arg') === 'phrase-builder').click();
    });
    for (let i = 0; i < 60 && !walk_done; i++) { await sleep(500); }
    console.log(`   (cross-board walk completed: ${walk_done})`);
    await sleep(800);
    /* What the walk ACTUALLY collected. "sad" and "hello" are both on linked sub-boards of
       this board and neither was found even after the walk reported complete, so read the
       set rather than keep guessing words at it. */
    const set_info = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('.md-board-detail-phrase-builder__chip')]
        .map((c) => (c.textContent || '').trim());
      const root = new Set(['i','do','is','like','want','eat','drink','to','in','on','you','we','not','go','play','make','look','that','out','off','they','can','a','stop','open','get','put','me','here','up','it','will','for','come','feel','help','tell','more','there','down','yes','done','no','with','and','of','because','the','think','good','big','same','bad','little','different','have','new','give','old','need','use','away','then','so','again','he','she','us']);
      const offRoot = labels.filter((l) => l && !root.has(l.toLowerCase()) && /^[a-z' ]{3,}$/i.test(l));
      return { total: labels.length, offRoot: offRoot.slice(0, 12), sample: labels.slice(0, 10) };
    });
    console.log(`   set: ${set_info.total} chips. first few: [${set_info.sample.join('] [')}]`);
    console.log(`   not on the root board: [${set_info.offRoot.join('] [')}]`);
    const probe_word = set_info.offRoot[0] || 'want';
    const box2 = await page.$('#bd-phrase-builder-search');
    await box2.type(probe_word);
    console.log(`   searching for "${probe_word}"`);
    await sleep(3000);
    const cross = await page.evaluate(() => {
      const btn = document.querySelector('.md-board-detail-phrase-builder__sentence-chip--match, .md-board-detail-phrase-builder__chip');
      const panel = document.querySelector('.md-board-detail-phrase-builder');
      if (!btn) { return { none: true, panel: panel ? (panel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '' }; }
      btn.click();
      return { label: (btn.textContent || '').replace(/\s+/g, ' ').trim() };
    });
    await sleep(1500);
    const s3 = await page.evaluate(READ);
    const logged = await page.evaluate(() => window.__logged || []);
    const boardId = await page.evaluate(() => { try { return window.appState.get('currentBoardState.id'); } catch (e) { return '?'; } });
    console.log(`5. CROSS-BOARD pick: ${cross.none ? 'no match — panel: ' + cross.panel : '"' + cross.label + '"'}`);
    console.log(`   bar=[${s3.bar}]  button_list=[${s3.button_list}]`);
    console.log(`   current board id=${boardId}`);
    console.log(`   stashes.log entries: ${logged.length ? logged.join('  ') : '(none)'}`);

    console.log(`4. CONTROL — tapped board buttons "${tapped2}"`);
    console.log(`   bar=[${s2.bar}]  button_list=[${s2.button_list}]`);
    console.log(`   spoken: ${spoken2.length ? spoken2.join('  ') : '(nothing captured)'}`);
  } finally { await browser.close(); }
})();
