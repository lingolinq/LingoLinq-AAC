// Browser check: dropping an image file onto a board button in EDIT mode replaces its picture
// directly, with a spinner on the button meanwhile, on BOTH board pages (2026-10-02, requested:
// "on the boards-alt and board-detail pages, there should be a drag and drop image functionality to
// replace the board button image -> after the user drops the image, add a spinner").
//
// A REAL DRAG, not a script-built event: Chrome's own drag input (CDP Input.dispatchDragEvent) with
// an actual PNG file on disk, so the browser's dragenter/dragover/drop handling runs as for a file
// dragged from the desktop. Per page it checks: the hovered button is highlighted as a drop target
// (`drop_target`), the spinner (`.ll-drop-uploading`) covers the button right after the drop, no
// button-settings window opens (the old board-alt behaviour), the spinner clears, and the tile then
// shows the uploaded picture.
//
// DATA: the image is uploaded (an Image record + S3 on the dev stack), but the board is NOT saved --
// edit mode is left unsaved when the browser closes. Localhost only.
// Usage: node scripts/button-image-drop-qa.mjs [--user example --pass password --board example/core-40_1] [--headed]

import fs from 'fs';
import os from 'os';
import path from 'path';
import { cliArgs, launch, login } from './qa-helpers.mjs';

const { BASE, USER, PASS, HEADED, arg } = cliArgs(process.argv);
const BOARD = arg('--board', 'example/core-40_1');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`REFUSING: --base must be localhost, got ${BASE}`); process.exit(2);
}
const [owner, slug] = BOARD.split('/');
const PAGES = [
  { label: 'board-alt (Basic)', url: `/${owner}/board/${slug}` },
  { label: 'board-detail (Modern)', url: `/${owner}/board-detail/${slug}` }
];

// A 4x4 red PNG, written to a temp file so the drag carries a real file path.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC', 'base64');
const IMAGE = path.join(os.tmpdir(), `button-image-drop-qa-${process.pid}.png`);
fs.writeFileSync(IMAGE, PNG);

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function dropOnFirstButton(page, cdp, label) {
  await page.evaluate(() => window.appState.toggle_mode('edit'));
  await wait(2500);
  record(`${label}: in edit mode`, await page.evaluate(() => !!window.appState.get('edit_mode')));
  const target = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.button[data-id]')].find((e) => e.getClientRects().length);
    if (!b) { return null; }
    const r = b.getBoundingClientRect();
    const pics = [...b.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    return { id: b.getAttribute('data-id'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), pics };
  });
  if (!target) { throw new Error(`${label}: no board button on screen`); }
  const data = { items: [], files: [IMAGE], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: target.x, y: target.y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: target.x, y: target.y, data });
  await wait(150);
  record(`${label}: the button is highlighted as a drop target`, await page.evaluate((id) => !!document.querySelector(`.button[data-id="${id}"].drop_target`), target.id));
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: target.x, y: target.y, data });
  await wait(60);
  const during = await page.evaluate((id) => {
    const b = document.querySelector(`.button[data-id="${id}"]`);
    const v = b && b.querySelector('.ll-drop-uploading');
    return { spinner: !!(v && v.querySelector('.md-loading-spinner')), status: v ? v.getAttribute('role') : null, settings: !!document.querySelector('#button_settings') };
  }, target.id);
  record(`${label}: a spinner covers the button right after the drop`, during.spinner && during.status === 'status');
  let settled = false;
  for (let i = 0; i < 30 && !settled; i++) { await wait(1000); settled = !(await page.$('.ll-drop-uploading')); }
  record(`${label}: the spinner clears when the image is in place`, settled);
  const after = await page.evaluate((id) => {
    const b = document.querySelector(`.button[data-id="${id}"]`);
    return { pics: b ? [...b.querySelectorAll('img')].map((i) => i.getAttribute('src')) : [], settings: !!document.querySelector('#button_settings'), error: /Upload failed/.test(document.body.innerText) };
  }, target.id);
  record(`${label}: no button-settings window opened`, !during.settings && !after.settings);
  record(`${label}: no upload error`, !after.error);
  const changed = after.pics.filter((p) => p && !target.pics.includes(p) && /^https?:\/\//.test(p));
  record(`${label}: the tile shows the uploaded picture`, changed.length > 0, changed[0] && changed[0].slice(0, 70));
}

const { browser, page } = await launch({ HEADED });
try {
  await login(page, { BASE, USER, PASS });
  await page.setViewport({ width: 1280, height: 900 });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Input.setInterceptDrags', { enabled: false });
  for (const p of PAGES) {
    console.log(`\n${p.label}`);
    await page.goto(BASE + p.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(4000);
    await dropOnFirstButton(page, cdp, p.label);
  }
} catch (e) {
  console.error('  harness error:', e && e.message);
  results.push({ name: 'harness', pass: false });
} finally {
  await browser.close();
  try { fs.unlinkSync(IMAGE); } catch (e) { /* already gone */ }
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed / ${failed} failed`);
if (!results.length) { console.log('NO CHECKS RAN, treating as a failure.'); process.exit(1); }
process.exit(failed ? 1 : 0);
