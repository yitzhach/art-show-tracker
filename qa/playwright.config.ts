/* ==========================================================================
   Playwright for the site in site.config.ts. Headless; parallel across pages
   and both viewports; on a failure it keeps the trace (every step with the
   DOM, console and network at that moment, replayable) and the HTML report
   under results/. The site is started for the run unless SITE_QA_URL points
   at a deployed copy.
   ========================================================================== */
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { site } from './lib/site';

const CI = !!process.env.CI;
// Behind an HTTPS proxy (a cloud sandbox) the browser finds its way out but
// page.request, which the link check uses, does not read the environment:
// every link on a deployed site came back "answered nothing". Hand it over.
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;

export default defineConfig({
  testDir: './tests',
  outputDir: './results/test-output',
  fullyParallel: true,
  forbidOnly: CI,
  // On CI a failed test runs once more, so the report can say "fails every
  // time" or "flaky". failOnFlakyTests keeps a pass-on-retry red: a retry is
  // there to diagnose a flake, never to hide one.
  retries: CI ? 1 : 0,
  failOnFlakyTests: CI,
  workers: CI ? '100%' : undefined,
  timeout: 60_000,
  reporter: [
    ['list'],
    ...(CI ? [['github'] as const] : []),
    ['html', { outputFolder: './results/report', open: 'never' }],
    ['./lib/reporter.ts'],
  ],
  use: {
    baseURL: site.baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(PROXY ? { proxy: { server: PROXY, bypass: process.env.NO_PROXY || process.env.no_proxy } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    // Colours are the main thing a theme changes; contrast is checked again here.
    { name: 'dark', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 },
                           colorScheme: 'dark' } },
  ],
  webServer: site.serve && {
    command: site.serve.command,
    cwd: path.resolve(__dirname, site.serve.cwd ?? '.'),
    url: site.serve.readyURL ?? site.baseURL,
    reuseExistingServer: !CI,
    // A cold build (typecheck + bundle on a fresh runner) often needs more
    // than a minute; serve.timeout overrides this per project.
    timeout: site.serve.timeout ?? 180_000,
  },
});
