#!/usr/bin/env node
/**
 * Behavioural probe: does one session's workbook save destroy another's?
 *
 * The server replaces the eval blob wholesale — `log_session.rb:1875` is
 * `self.data['eval'] = params['eval']` — and the client sends the workbook it
 * hydrated on load. `eval-workbook.js` re-hydrates only when `evalIdentity()`
 * CHANGES (deliberately, so a re-render cannot reset the field being typed in),
 * so a tab left open holds a stale base indefinitely. Delivery is fire-and-forget
 * through a stash -> push -> Resque, so nothing compares state and the loser gets
 * no error: the other session's section simply disappears.
 *
 * Scope is one ACCOUNT in two places, not two clinicians — `canEdit` is
 * `isAuthor`. Two tabs, laptop + tablet, or a tab left open across a save made
 * elsewhere all reproduce it.
 *
 * The fix under test is `utils/eval_workbook.js#mergeForSend(stored, local,
 * dirtyKeys)`: start from the newest stored workbook and lay only the sections
 * THIS session edited over it. The unit tests
 * (tests/unit/utils/eval-workbook-merge-test.js) pin the merge function's
 * behaviour given inputs. They cannot pin the thing that actually broke — that
 * the component tracks the right dirty keys and that the merged blob survives the
 * real stash/push/Resque round trip. This probe does, against the running stack.
 *
 * Shape of the test: B writes one section and we confirm it landed. A — open
 * since BEFORE that, so holding a stale base — then writes a DIFFERENT section.
 * A fresh page load must show both. Verification reads the real textareas rather
 * than the API, so it reflects what the SLP would actually see.
 *
 * NEGATIVE CONTROL (do this before trusting a green run): revert `mergeForSend`
 * to send `local` wholesale and re-run. The last assertion MUST go red. A check
 * that cannot fail is not a check.
 *
 * Run from app/frontend under Node 22 with the dev stack up:
 *   node scripts/workbook-concurrent-probe.mjs --user marcus_williams_slp --pass 'demo2025!'
 *   node scripts/workbook-concurrent-probe.mjs --headed --log /hannah_lee/logs/1_5383
 *
 * SIDE EFFECT: writes TABA-<pid> / TABB-<pid> markers into the target eval's
 * `non_sgd_ruled_out` and `functional_goals` sections. Point --log at a
 * throwaway eval; the default (1_5383) is already dirty from earlier testing.
 *
 * Exit 0 when both sections survive, 1 if an assertion fails, 2 on harness error.
 */
/* eslint-env node */
import { cliArgs, launch, login, assertAppReady } from './qa-helpers.mjs';

const opts = cliArgs(process.argv);
const LOG = opts.arg('--log', '/hannah_lee/logs/1_5383');
const stamp = String(process.pid);
const MARK_B = 'TABB-' + stamp;
const MARK_A = 'TABA-' + stamp;

/*
 * 2.5s component debounce + the stash push interval + a Resque hop. Generous on
 * purpose: this probe's failure mode is a false PASS from reading too early, and
 * every read here is a fresh page load that would happily show stale data.
 */
const SETTLE_MS = 12000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(name, pass, detail) {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  return !!pass;
}

async function openReport(browser, base) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(base + LOG, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#wb-functional_goals-notes', { timeout: 30000 });
  // `isAuthor` resolves only once the log's author has loaded, so the textarea
  // starts DISABLED and is enabled a beat later. Waiting a fixed 2.5s raced it
  // and reported "not the author"; wait for the actual condition.
  await page.waitForFunction(() => {
    const el = document.querySelector('#wb-functional_goals-notes');
    return el && !el.disabled;
  }, { timeout: 30000 });
  await sleep(500);
  return page;
}

// Type into a section the way the component expects: set the value, then fire
// `input` so the {{on "input"}} fieldWriter runs (which is what marks the
// section dirty and schedules the save).
async function typeInto(page, sectionId, text) {
  return page.evaluate((sectionId, text) => {
    const el = document.querySelector('#wb-' + sectionId + '-notes');
    if (!el) { return 'no textarea for ' + sectionId; }
    if (el.disabled) { return 'textarea disabled — not the author?'; }
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return null;
  }, sectionId, text);
}

async function readSection(page, sectionId) {
  return page.evaluate((sectionId) => {
    const el = document.querySelector('#wb-' + sectionId + '-notes');
    return el ? el.value : null;
  }, sectionId);
}

async function main() {
  let browser;
  let allPass = true;
  const pass = (v) => { allPass = allPass && v; };

  try {
    const launched = await launch(opts);
    browser = launched.browser;
    await login(launched.page, opts);
    await assertAppReady(launched.page);

    // A opens FIRST and stays open with the base it hydrated on load.
    console.log('step: opening A');
    const pageA = await openReport(browser, opts.BASE);
    console.log('step: opening B');
    const pageB = await openReport(browser, opts.BASE);
    console.log('both tabs open\n');

    // --- Tab B writes its section, and we let it land -----------------------
    console.log('step: typing in B');
    let err = await typeInto(pageB, 'functional_goals', MARK_B);
    if (err) { throw new Error('tab B: ' + err); }
    await sleep(SETTLE_MS);

    // Guard, not decoration: if B never reached the server the final assertion
    // would pass for the wrong reason (nothing to clobber).
    console.log('step: verifying B landed');
    const verifyB = await openReport(browser, opts.BASE);
    const bLanded = await readSection(verifyB, 'functional_goals');
    pass(record('tab B section reached the server', bLanded === MARK_B,
      `read back ${JSON.stringify(bLanded)}`));
    await verifyB.close();

    // --- Tab A, holding a stale base, writes a DIFFERENT section ------------
    console.log('step: typing in A');
    err = await typeInto(pageA, 'non_sgd_ruled_out', MARK_A);
    if (err) { throw new Error('tab A: ' + err); }
    await sleep(SETTLE_MS);

    // --- The verdict: a fresh load must show BOTH ---------------------------
    console.log('step: final verify');
    const verify = await openReport(browser, opts.BASE);
    const finalA = await readSection(verify, 'non_sgd_ruled_out');
    const finalB = await readSection(verify, 'functional_goals');
    console.log('');
    pass(record("tab A's own section saved", finalA === MARK_A,
      `read back ${JSON.stringify(finalA)}`));
    pass(record("tab B's section SURVIVED tab A's save", finalB === MARK_B,
      finalB === MARK_B ? `still ${JSON.stringify(finalB)}`
                        : `expected ${JSON.stringify(MARK_B)}, got ${JSON.stringify(finalB)} — clobbered`));
    await verify.close();
  } catch (e) {
    console.error('\nPROBE ERROR:', e && e.message ? e.message : e);
    process.exitCode = 2;
    return;
  } finally {
    if (browser) { await browser.close().catch(() => {}); }
  }

  console.log(allPass ? '\nConcurrent sections both survive.' : '\nProbe FAILED — see above.');
  process.exitCode = allPass ? 0 : 1;
}

main().catch((e) => {
  console.error('\nPROBE ERROR:', e && e.message ? e.message : e);
  process.exit(2);
});
