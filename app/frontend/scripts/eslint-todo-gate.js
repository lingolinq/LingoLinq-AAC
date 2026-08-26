/**
 * ESLint baseline gate (hbs .lint-todo analog).
 *
 * Modes:
 *   --update-todo  Regenerate .eslint-todo from a fresh ESLint run (writes the file).
 *   (default / CI) Run ESLint, subtract baseline matches, exit 1 on NEW findings.
 *
 * Never silently rewrites the baseline in CI. Stale baseline rows are harmless;
 * prune via --update-todo in an intentional rebaseline commit.
 *
 * Fingerprint: file|ruleId|line|column|severity|messageHash
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const TODO_PATH = path.join(FRONTEND_ROOT, '.eslint-todo');
const ESLINT_BIN = path.join(FRONTEND_ROOT, 'node_modules', '.bin', 'eslint');

function messageHash(message) {
  return crypto.createHash('sha256').update(String(message || '')).digest('hex').slice(0, 12);
}

function toRelPosix(absPath) {
  return path.relative(FRONTEND_ROOT, absPath).split(path.sep).join('/');
}

function fingerprint(relFile, msg) {
  const ruleId = msg.ruleId || '(fatal)';
  const line = msg.line == null ? 0 : msg.line;
  const column = msg.column == null ? 0 : msg.column;
  const severity = msg.severity == null ? 0 : msg.severity;
  return [
    relFile,
    ruleId,
    String(line),
    String(column),
    String(severity),
    messageHash(msg.message),
  ].join('|');
}

function fail(message, detail) {
  console.error('eslint-todo-gate:', message);
  if (detail) console.error(detail);
  process.exitCode = 2;
  return null;
}

function runEslintJson() {
  if (!fs.existsSync(ESLINT_BIN)) {
    return fail('eslint binary not found at ' + ESLINT_BIN);
  }

  const result = spawnSync(
    ESLINT_BIN,
    // --ext: `eslint .` walks only .js, which left the committed .mjs QA
    // harnesses under scripts/ unlinted. Keep in step with the lint:js script
    // in package.json, or the gate and the developer-facing lint disagree.
    ['.', '--ext', '.js,.mjs', '--format', 'json'],
    {
      cwd: FRONTEND_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: process.env,
    }
  );

  // ESLint exits 1 when findings exist; still parse stdout.
  if (result.error) {
    return fail('failed to spawn eslint: ' + result.error.message);
  }
  if (result.status !== 0 && result.status !== 1) {
    return fail(
      'eslint exited ' + result.status,
      (result.stderr || '') + '\n' + String(result.stdout || '').slice(0, 2000)
    );
  }

  try {
    return JSON.parse(result.stdout || '[]');
  } catch (err) {
    return fail(
      'failed to parse eslint JSON: ' + err.message,
      result.stderr || ''
    );
  }
}

function collectFindings(report) {
  const findings = [];
  for (const file of report) {
    const messages = file.messages || [];
    if (!messages.length) continue;
    const rel = toRelPosix(file.filePath);
    for (const msg of messages) {
      findings.push({
        fingerprint: fingerprint(rel, msg),
        file: rel,
        ruleId: msg.ruleId || '(fatal)',
        line: msg.line,
        column: msg.column,
        severity: msg.severity,
        message: msg.message,
      });
    }
  }
  return findings;
}

function loadBaseline() {
  if (!fs.existsSync(TODO_PATH)) {
    return new Map();
  }
  const counts = new Map();
  const text = fs.readFileSync(TODO_PATH, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
  }
  return counts;
}

function writeBaseline(findings) {
  const lines = findings.map((f) => f.fingerprint).sort();
  const header = [
    '# ESLint baseline (grandfathered findings). Do not hand-edit.',
    '# Regenerate: npm run lint:js:todo',
    '# Format: file|ruleId|line|column|severity|messageHash',
    '# Generated: ' + new Date().toISOString(),
  ];
  fs.writeFileSync(TODO_PATH, header.concat(lines).join('\n') + '\n', 'utf8');
}

function updateTodo() {
  const report = runEslintJson();
  if (!report) return;
  const findings = collectFindings(report);
  writeBaseline(findings);
  console.log(
    'eslint-todo-gate: wrote .eslint-todo — filesScanned=%d filesWithIssues=%d findings=%d',
    report.length,
    report.filter((f) => (f.messages || []).length).length,
    findings.length
  );
}

function runCi() {
  const report = runEslintJson();
  if (!report) return;
  const findings = collectFindings(report);
  const baseline = loadBaseline();
  const baselineTotal = [...baseline.values()].reduce((a, b) => a + b, 0);

  const novel = [];
  const remaining = new Map(baseline);
  let grandfathered = 0;

  for (const finding of findings) {
    const left = remaining.get(finding.fingerprint) || 0;
    if (left > 0) {
      remaining.set(finding.fingerprint, left - 1);
      grandfathered += 1;
    } else {
      novel.push(finding);
    }
  }

  const filesScanned = report.length;
  const filesWithIssues = report.filter((f) => (f.messages || []).length).length;

  console.log(
    'eslint-todo-gate: filesScanned=%d filesWithIssues=%d findings=%d baseline=%d grandfathered=%d new=%d',
    filesScanned,
    filesWithIssues,
    findings.length,
    baselineTotal,
    grandfathered,
    novel.length
  );

  if (novel.length === 0) {
    console.log('eslint-todo-gate: OK — no new ESLint findings');
    return;
  }

  console.error('eslint-todo-gate: NEW ESLint findings (not in .eslint-todo):');
  for (const f of novel.slice(0, 50)) {
    const sev = f.severity === 2 ? 'error' : 'warning';
    console.error(
      '  %s:%s:%s  %s  %s  %s',
      f.file,
      f.line,
      f.column,
      sev,
      f.ruleId,
      f.message
    );
  }
  if (novel.length > 50) {
    console.error('  ... and %d more', novel.length - 50);
  }
  process.exitCode = 1;
}

const args = process.argv.slice(2);
if (args.includes('--update-todo')) {
  updateTodo();
} else {
  runCi();
}
