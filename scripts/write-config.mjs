#!/usr/bin/env node
/**
 * Writes the runtime config.json into a built dist/ folder. This is the step
 * each environment's deploy runs (after downloading the one build artifact),
 * and what the E2E run uses too:
 *
 *   node scripts/write-config.mjs dist https://api.dev.example.com
 *
 * It validates with the app's own parser (src/config.ts), so a value the app
 * would refuse at startup fails the deploy instead.
 */
import { writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseConfig } from '../src/config.ts';

const [dir, apiBaseUrl] = process.argv.slice(2);
if (!dir || !apiBaseUrl) {
  console.error('usage: node scripts/write-config.mjs <dist-dir> <api-base-url>');
  process.exit(2);
}
if (!statSync(join(resolve(dir), 'index.html'), { throwIfNoEntry: false })) {
  console.error(`${dir} has no index.html. Point this at the built dist/ folder.`);
  process.exit(2);
}

let config;
try {
  config = parseConfig({ apiBaseUrl });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const out = join(resolve(dir), 'config.json');
writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${out}: apiBaseUrl=${config.apiBaseUrl}`);
