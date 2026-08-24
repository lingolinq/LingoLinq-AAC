#!/usr/bin/env node
/**
 * N1 — the under-13 signup experience, driven through the real UI.
 *
 * The API-level state machine was verified separately (see
 * docs/task-management/2026-08-24-n1-under-13-signup-path.md). This covers the
 * half that can only be seen in a browser: what the CHILD actually experiences
 * after signing up, and what they see when they try to sign in while pending.
 *
 * Run from app/frontend:  node scripts/n1-under13-signup-qa.mjs [--headed]
 */
import { chromium } from 'playwright';

const arg = (n, d) => process.argv.find((a, i) => process.argv[i - 1] === n) || d;
const BASE = arg('--base', 'http://localhost:8184');
const HEADED = process.argv.includes('--headed');
const STAMP = arg('--stamp', String(Math.floor(Number(process.env.QA_STAMP || '0')) || 0));

const results = [];
function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`[${pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO'}] ${id}: ${detail}`);
}

const visibleControls = (page) => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('input, select, button, a.btn, [role="button"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    out.push([el.tagName.toLowerCase(), el.id || el.className.toString().slice(0, 34), (el.innerText || el.value || el.placeholder || '').toString().trim().slice(0, 34)].join(' | '));
  });
  return out;
});

const bodyText = (page) => page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 700));

/* Country / birth month / birth year are BoundSelect widgets, NOT native
   <select> — the trigger is a <button id=...> and the options are
   li[role="option"]. page.selectOption() throws on them, so an earlier version
   of this script swallowed the error and reported the DOB as set when nothing
   had been chosen. Always read the trigger back and assert. */
async function chooseBoundSelect(page, triggerId, optionText) {
  const trigger = page.locator(`#${triggerId}`);
  await trigger.click();
  await page.waitForTimeout(700);
  const opt = page.locator('li[role="option"]').filter({ hasText: new RegExp(`^\\s*${optionText}\\s*$`, 'i') }).first();
  if (!(await opt.isVisible({ timeout: 4000 }).catch(() => false))) {
    // fall back to a looser match
    const loose = page.locator('li[role="option"]', { hasText: optionText }).first();
    if (!(await loose.isVisible({ timeout: 2000 }).catch(() => false))) {
      throw new Error(`option "${optionText}" not offered by #${triggerId}`);
    }
    await loose.click();
  } else {
    await opt.click();
  }
  await page.waitForTimeout(700);
  const shown = (await trigger.innerText().catch(() => '')).trim();
  if (!new RegExp(optionText, 'i').test(shown)) {
    throw new Error(`#${triggerId} still reads "${shown}" after choosing "${optionText}"`);
  }
  return shown;
}

(async () => {
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log(`  [js error] ${String(e).slice(0, 140)}`));
  const child = `qa_child_${STAMP}`;
  const childEmail = `${child}@example.com`;
  const parentEmail = `qa_parent_${STAMP}@example.com`;

  try {
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log('\n--- step 1 controls ---');
    console.log((await visibleControls(page)).join('\n'));

    // Role step: communicator, a country, and a birth date that makes them under 13.
    const comm = page.getByRole('button', { name: /communicat/i }).first();
    if (await comm.isVisible({ timeout: 4000 }).catch(() => false)) {
      await comm.click();
      await page.waitForTimeout(1200);
    }
    const gotCountry = await chooseBoundSelect(page, 'registration_country', 'United States');
    const gotMonth = await chooseBoundSelect(page, 'birth_month', 'April');
    const gotYear = await chooseBoundSelect(page, 'birth_year', '2020');
    record('N1-dob-selected', true, `country="${gotCountry}" month="${gotMonth}" year="${gotYear}" (under 13 in 2026), each read back from the trigger`);

    // Continue to the next step.
    const cont = page.getByRole('button', { name: /continue|next|get started/i }).first();
    if (await cont.isVisible({ timeout: 4000 }).catch(() => false)) {
      await cont.click();
      await page.waitForTimeout(2000);
    }

    // Did we land on the under-13 step (parent email present)?
    const parentField = page.locator('#parent_consent_email');
    const onUnder13 = await parentField.isVisible({ timeout: 6000 }).catch(() => false);
    record('N1-under13-step-shown', onUnder13,
      onUnder13 ? 'parent/guardian email field is presented for an under-13 DOB'
        : `did not reach the under-13 step. Body: "${(await bodyText(page)).slice(0, 200)}"`);
    if (!onUnder13) {
      console.log('\n--- controls at this point ---');
      console.log((await visibleControls(page)).join('\n'));
      throw new Error('under-13 step not reached');
    }

    await parentField.fill(parentEmail);
    await page.fill('#user_name_under_13', child);
    await page.fill('#email_under_13', childEmail);
    await page.fill('#password_under_13', 'testpassword123').catch(async () => {
      await page.fill('input[type="password"]', 'testpassword123');
    });
    const terms = page.locator('#register_under_13_terms_consent');
    if (await terms.isVisible().catch(() => false)) await terms.check().catch(() => {});
    await page.waitForTimeout(500);

    // Does it refuse to proceed without the parent email? (validation check)
    await parentField.fill('');
    const submit = page.getByRole('button', { name: /sign up|create|register|submit/i }).first();
    await submit.click().catch(() => {});
    await page.waitForTimeout(1500);
    const warned = await page.locator('.text-danger').filter({ hasText: /parent|guardian/i }).first().isVisible().catch(() => false);
    record('N1-parent-email-required', warned,
      warned ? 'blocked with a parent-email-required message when left blank' : 'no visible parent-email validation message');
    await parentField.fill(parentEmail);
    await page.waitForTimeout(400);

    // Real submit.
    await submit.click().catch(() => {});
    await page.waitForTimeout(6000);

    const text = await bodyText(page);
    const waiting = /parent or guardian|approve your account|check with a parent/i.test(text);
    record('N1-waiting-screen', waiting,
      waiting ? `child sees the waiting screen: "${text.slice(0, 220)}"`
        : `NO waiting screen. Body: "${text.slice(0, 260)}"`);

    // Is the child left signed in, or held out?
    const url = page.url();
    const hasToken = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('lingolinqStash-auth_settings');
        return !!(raw && JSON.parse(raw).access_token);
      } catch (e) { return false; }
    });
    record('N1-no-token-in-browser', !hasToken,
      hasToken ? 'a bearer token WAS stored in the browser despite pending consent' : `no access_token stored; url=${url}`);

    // Now try to sign in as the pending child.
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.fill('#identification', child);
    await page.fill('#password', 'testpassword123');
    await page.locator('button.login-btn[type="submit"], form button[type="submit"]').first().click();
    await page.waitForTimeout(5000);

    const loginText = await bodyText(page);
    const stillOnLogin = page.url().includes('/login');
    record('N1-login-blocked', stillOnLogin, `after submit url=${page.url()}`);

    const explains = /parent|guardian|approv|consent/i.test(loginText);
    record('N1-login-message-explains-why', explains,
      explains ? `login screen explains the block: "${loginText.slice(0, 260)}"`
        : `login blocked but with NO parental explanation. Body: "${loginText.slice(0, 260)}"`);

    // Is there a way out -- resend, or a way to fix a mistyped parent address?
    const resend = await page.getByRole('button', { name: /resend|send again|try again/i }).first().isVisible().catch(() => false);
    const parentFieldOnLogin = await page.locator('#login_parent_consent_email').isVisible().catch(() => false);
    record('N1-recovery-offered', resend || parentFieldOnLogin,
      `resend control visible=${resend}; parent-email field on login visible=${parentFieldOnLogin}`);

  } catch (e) {
    record('harness', false, `threw: ${e.message.slice(0, 160)}`);
  } finally {
    console.log('\n===== SUMMARY =====');
    results.forEach((r) => console.log(`${r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'INFO'}  ${r.id}`));
    console.log(`\nchild user: ${child}`);
    await browser.close();
  }
})();
