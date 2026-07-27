import { defineConfig, devices } from '@playwright/test';

/**
 * The Playwright skeleton Phase 1 asks for.
 *
 * Everything else in this repo is a unit test: 690 of them, and not one boots the app. The class
 * of failure they cannot see is the whole app failing to render — a client component that throws
 * on mount, a bad import, a hook called on a server component. `tsc` is happy with all three.
 *
 * Deliberately runs against `next start` on a production build, because that is where those
 * failures show up; dev mode is more forgiving than the thing that gets deployed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI images often ship a pinned Chromium that does not match this package's expected
        // build. Point at it rather than downloading a second copy on every run.
        ...(process.env['PLAYWRIGHT_CHROMIUM_PATH']
          ? { launchOptions: { executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm start --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
