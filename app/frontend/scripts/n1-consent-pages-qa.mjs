#!/usr/bin/env node
/**
 * The PARENT-facing half of the COPPA flow: the pages a parent actually lands on
 * from the consent email. N1 verified the state transitions these pages perform
 * but never looked at what they render — and this session has twice found
 * templates that compile and show nothing useful.
 *
 * Also exercises the 14-day `parent_consent_expires_at` window and a tampered
 * token, because a consent page that fails silently is worse than one that errors.
 *
 * FIXTURES. This script needs live consent tokens, which cannot be committed.
 * Generate them into a file of your choosing and pass its path:
 *
 *   bundle exec rails runner scripts/n1-consent-fixtures.rb > /tmp/consent_pages.json
 *   node scripts/n1-consent-pages-qa.mjs --fixtures /tmp/consent_pages.json
 *
 * The generator is committed alongside this script so the whole run is
 * reproducible by anyone. It previously read a hardcoded path inside one
 * machine's Claude Code session scratchpad, which meant nobody else could run
 * it and the "12/12 verified" claim in CLAIM-CHECK-BACKLOG.md rested on an
 * artifact that no longer exists once /private/tmp is cleared.
 *
 * Run from app/frontend.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const arg = (n, d) => process.argv.find((a, i) => process.argv[i - 1] === n) || d;
const FIXTURES = arg('--fixtures', null);
if (!FIXTURES) {
  console.error('Missing --fixtures <path>. Generate it first:\n' +
    '  bundle exec rails runner scripts/n1-consent-fixtures.rb > /tmp/consent_pages.json\n' +
    '  node scripts/n1-consent-pages-qa.mjs --fixtures /tmp/consent_pages.json');
  process.exit(2);
}
let F;
try {
  F = JSON.parse(readFileSync(FIXTURES, 'utf8'));
} catch (e) {
  console.error(`Could not read fixtures at ${FIXTURES}: ${e.message}`);
  process.exit(2);
}

const results = [];
function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`[${pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO'}] ${id}: ${detail}`);
}

async function visit(page, url, tag) {
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => ({ err: e.message }));
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const txt = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      text: txt,
      len: txt.length,
      title: document.title,
      // does the page render actual chrome, or is it an empty shell?
      headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.innerText.trim()).filter(Boolean).slice(0, 4),
      links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).slice(0, 6),
      // anything that leaks a token into the visible page or the title
      leaksToken: /token=/i.test(txt),
    };
  });
  console.log(`\n### ${tag}`);
  console.log(`   status: ${resp && resp.status ? resp.status() : (resp && resp.err) || 'n/a'}`);
  console.log(`   title:  ${info.title}`);
  console.log(`   h1-h3:  ${JSON.stringify(info.headings)}`);
  console.log(`   text:   ${info.text.slice(0, 240)}`);
  return { resp, info };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 860 } });

  try {
    // 1. The happy path the parent is asked to click.
    {
      const { resp, info } = await visit(page, F.approve_valid, 'APPROVE — valid token');
      record('approve-200', resp && resp.status() === 200, `HTTP ${resp && resp.status()}`);
      record('approve-renders-content', info.len > 60 && info.headings.length > 0,
        `${info.len} chars of text, headings ${JSON.stringify(info.headings)}`);
      record('approve-confirms-in-words', /approv|thank|consent|activat|all set|ready/i.test(info.text),
        info.text.slice(0, 160));
      record('approve-no-token-leak', !info.leaksToken,
        info.leaksToken ? 'the page renders a token= string to the parent' : 'no token echoed into the page body');
    }

    // 2. Re-visiting the same link (parents double-click, mail clients prefetch).
    {
      const { resp, info } = await visit(page, F.approve_valid, 'APPROVE — same link a second time');
      record('approve-idempotent', resp && resp.status() === 200 && info.len > 60,
        `HTTP ${resp && resp.status()}, ${info.len} chars — must not 500 or look like a failure`);
    }

    // 3. A tampered token must not silently look like success.
    {
      const { info } = await visit(page, F.approve_bad_token, 'APPROVE — tampered token');
      const saysNo = /not valid|invalid|expired|link|problem|sorry|unable|couldn/i.test(info.text);
      const falseSuccess = /thank you|approved|all set|activated/i.test(info.text) && !saysNo;
      record('approve-bad-token-rejected', saysNo && !falseSuccess,
        saysNo ? `explains the failure: "${info.text.slice(0, 150)}"` : `does NOT explain: "${info.text.slice(0, 150)}"`);
    }

    // 4. The 14-day window.
    {
      const { info } = await visit(page, F.approve_expired, 'APPROVE — expired (15 days old)');
      const saysExpired = /expire|no longer valid|out of date|too old|request a new/i.test(info.text);
      const falseSuccess = /thank you|approved|all set|activated/i.test(info.text) && !saysExpired;
      record('approve-expired-rejected', !falseSuccess,
        falseSuccess ? 'EXPIRED LINK APPEARED TO SUCCEED' : `rejected; wording: "${info.text.slice(0, 150)}"`);
      record('approve-expired-says-so', saysExpired,
        saysExpired ? 'tells the parent the link expired' : 'rejects, but does not say the link EXPIRED or how to get a new one');
    }

    // 5. The revoke page.
    {
      const { resp, info } = await visit(page, F.revoke_valid, 'REVOKE — valid token');
      record('revoke-200', resp && resp.status() === 200, `HTTP ${resp && resp.status()}`);
      record('revoke-renders-content', info.len > 60 && info.headings.length > 0,
        `${info.len} chars, headings ${JSON.stringify(info.headings)}`);
      record('revoke-confirms-in-words', /revok|withdraw|removed|no longer/i.test(info.text),
        info.text.slice(0, 160));
    }

    // 6. Revoke twice — the already_revoked branch exists in the controller.
    {
      const { resp, info } = await visit(page, F.revoke_valid, 'REVOKE — same link a second time');
      record('revoke-idempotent', resp && resp.status() === 200 && info.len > 60,
        `HTTP ${resp && resp.status()}, ${info.len} chars`);
    }

  } catch (e) {
    record('harness', false, `threw: ${e.message.slice(0, 160)}`);
  } finally {
    console.log('\n===== SUMMARY =====');
    results.forEach((r) => console.log(`${r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'INFO'}  ${r.id}`));
    const f = results.filter((r) => r.pass === false).length;
    console.log(`\n${results.filter((r) => r.pass === true).length} passed, ${f} failed`);
    await browser.close();
    process.exit(f ? 1 : 0);
  }
})();
