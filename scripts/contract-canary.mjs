#!/usr/bin/env node
/**
 * `npm run api:canary`: proves the generated client protects us. For each
 * mutation below it copies the app to a temp dir, applies one breaking change
 * to the API spec (a renamed field or path the portal uses), regenerates the
 * client types and runs `tsc`. The run passes only if:
 *
 *   - the unmodified copy type-checks (so failures come from the mutation), and
 *   - every mutation makes `tsc` fail in production code, not only in the
 *     MSW mocks or tests (which are typed against the schema too).
 *
 * If a mutation compiles, the app is reading that field or path through an
 * untyped escape hatch (`any`, a cast, a hand-written type) and a real backend
 * rename would only surface at runtime.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
/** tsc error lines from the mocks, test helpers or test files don't count as "the app noticed". */
const isTestCode = (line) => /^src\/(?:mocks|test)\//.test(line) || /^src\/\S*\.test\.tsx?\(/.test(line);
const BIN = join(ROOT, 'node_modules', '.bin');

/** Renames a property of a component schema, including in its `required` list. */
const renameField = (schema, from, to) => ({
  name: `${schema}.${from} -> ${to}`,
  apply(spec) {
    const s = spec.components.schemas[schema];
    if (!s?.properties?.[from]) throw new Error(`canary is stale: ${schema}.${from} is not in the spec`);
    const { [from]: moved, ...rest } = s.properties;
    s.properties = { ...rest, [to]: moved };
    if (s.required) s.required = s.required.map((r) => (r === from ? to : r));
  },
});

const renamePath = (from, to) => ({
  name: `path ${from} -> ${to}`,
  apply(spec) {
    if (!spec.paths[from]) throw new Error(`canary is stale: ${from} is not in the spec`);
    const { [from]: moved, ...rest } = spec.paths;
    spec.paths = { ...rest, [to]: moved };
  },
});

const MUTATIONS = [
  renameField('UserResponse', 'role', 'userRole'),
  renameField('AdminKycSubmissionResponse', 'decisionReason', 'reason'),
  renameField('AdminTopUpResponse', 'amountMinor', 'amount'),
  renameField('TokenResponse', 'accessToken', 'token'),
  renameField('RejectKycRequest', 'reason', 'note'),
  renamePath('/admin/kyc/{id}/approve', '/admin/kyc/{id}/accept'),
];

function typecheck(dir, spec) {
  writeFileSync(join(dir, 'api', 'openapi.json'), JSON.stringify(spec));
  execFileSync(join(BIN, 'openapi-typescript'), ['api/openapi.json', '--output', 'src/api/schema.d.ts'], {
    cwd: dir,
    stdio: 'pipe',
  });
  try {
    execFileSync(join(BIN, 'tsc'), ['-p', 'tsconfig.app.json'], { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const original = JSON.parse(readFileSync(join(ROOT, 'api', 'openapi.json'), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'contract-canary-'));
let failed = false;
try {
  for (const entry of ['src', 'api', 'tsconfig.base.json', 'tsconfig.app.json', 'package.json']) {
    cpSync(join(ROOT, entry), join(dir, entry), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');

  const control = typecheck(dir, original);
  if (!control.ok) {
    console.error(`Control run failed: the unmodified app does not type-check.\n${control.output}`);
    process.exit(1);
  }
  console.log('control: unmodified spec type-checks');

  for (const mutation of MUTATIONS) {
    const spec = structuredClone(original);
    mutation.apply(spec);
    const result = typecheck(dir, spec);
    if (result.ok) {
      failed = true;
      const message = `${mutation.name}: tsc still passes, so the app would not notice this API change`;
      console.log(process.env.GITHUB_ACTIONS ? `::error::${message}` : `FAIL ${message}`);
      continue;
    }
    const errors = result.output.split('\n').filter((line) => line.includes('error TS'));
    const inApp = errors.find((line) => !isTestCode(line));
    if (!inApp) {
      failed = true;
      const message = `${mutation.name}: only mocks/tests fail to compile; the app itself would not notice`;
      console.log(process.env.GITHUB_ACTIONS ? `::error::${message}` : `FAIL ${message}`);
    } else {
      console.log(`ok   ${mutation.name}: tsc fails (${errors.length} errors)\n       ${inApp.trim().slice(0, 160)}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
