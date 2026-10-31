import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the production build (dist/, exactly what deploys ship) served
 * by `vite preview`, talking cross-origin to a mock API that runs the same MSW
 * handlers as the unit tests (e2e/mock-api-server.ts).
 *
 * The run copies dist/ to .e2e-site/ and writes config.json there, the way a
 * deploy would, so dist/ itself stays environment-neutral.
 *
 * Run `npm run build` first. PLAYWRIGHT_CHANNEL=chrome uses an installed Chrome
 * instead of Playwright's own Chromium.
 */
const API_PORT = 9090;
const WEB_PORT = 4173;
const API = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: 'e2e',
  // One shared mock API whose data the tests reset: run serially.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
  webServer: [
    {
      command: `node e2e/mock-api-server.ts ${API_PORT}`,
      url: `${API}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
    {
      command: [
        'rm -rf .e2e-site',
        'cp -R dist .e2e-site',
        `node scripts/write-config.mjs .e2e-site ${API}`,
        `vite preview --outDir .e2e-site --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      ].join(' && '),
      url: `http://127.0.0.1:${WEB_PORT}/config.json`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});

export { API };
