#!/usr/bin/env node
/**
 * `npm run bundle:check` (after `npm run build`): fails if the gzipped
 * JavaScript or CSS in dist/ exceeds bundle-budget.json.
 *
 * It also guards the "one build for every environment" rule: dist/ must not
 * contain a config.json (each deploy writes its own) or any of the MSW test
 * mocks.
 */
import { appendFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const budget = JSON.parse(readFileSync(join(ROOT, 'bundle-budget.json'), 'utf8'));
const annotate = (level, message) =>
  console.log(process.env.GITHUB_ACTIONS ? `::${level}::${message}` : `${level}: ${message}`);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

let all;
try {
  all = files(DIST);
} catch {
  annotate('error', 'dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const problems = [];
const rows = [];
const totals = { js: 0, css: 0 };
for (const path of all) {
  const kind = { '.js': 'js', '.css': 'css' }[extname(path)];
  if (!kind) continue;
  const bytes = readFileSync(path);
  const gzip = gzipSync(bytes, { level: 9 }).length;
  totals[kind] += gzip;
  rows.push({ file: relative(DIST, path), raw: bytes.length, gzip });
  // Markers that only exist in the mock layer (src/mocks, msw).
  if (kind === 'js' && /mockServiceWorker|mock-token-|onUnhandledFrame/.test(bytes.toString('utf8'))) {
    problems.push(`${relative(DIST, path)} contains test mocks (MSW). Mocks must never ship.`);
  }
}
if (all.some((p) => relative(DIST, p) === 'config.json')) {
  problems.push(
    'dist/config.json exists. The build must be environment-neutral: each deploy writes its own config.json.',
  );
}

const kb = (n) => `${(n / 1000).toFixed(1)} kB`;
console.log('Gzipped size per file:');
for (const r of rows.sort((a, b) => b.gzip - a.gzip))
  console.log(`  ${r.file.padEnd(40)} ${kb(r.gzip).padStart(9)}  (raw ${kb(r.raw)})`);

const summary = ['### Bundle size (gzip)', '', '| | Size | Budget | |', '|---|---:|---:|---|'];
for (const kind of ['js', 'css']) {
  const ok = totals[kind] <= budget[kind];
  summary.push(`| ${kind.toUpperCase()} | ${kb(totals[kind])} | ${kb(budget[kind])} | ${ok ? '✅' : '❌'} |`);
  console.log(
    `${kind.toUpperCase()}: ${kb(totals[kind])} of ${kb(budget[kind])} (${Math.round((100 * totals[kind]) / budget[kind])}%)`,
  );
  if (!ok) {
    problems.push(
      `${kind.toUpperCase()} is ${kb(totals[kind])} gzipped, over the ${kb(budget[kind])} budget in bundle-budget.json.`,
    );
  }
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);

for (const problem of problems) annotate('error', problem);
process.exit(problems.length ? 1 : 0);
