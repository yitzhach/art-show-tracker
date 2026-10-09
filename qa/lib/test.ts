/* The `test` every spec here imports. Before each test it blocks every host
   but the site's own (and site.allowHosts) and freezes the clock, so a
   result depends on the code alone, not on the network or the date. */
import { test as base, expect } from '@playwright/test';
import { site } from './site';

export const test = base.extend<{ siteEnvironment: void }>({
  siteEnvironment: [async ({ context }, use) => {
    const origin = new URL(site.baseURL).origin;
    await context.route(
      url => url.origin !== origin && !site.allowHosts.includes(url.hostname),
      route => route.abort('blockedbyclient'));
    if (site.fixedTime) await context.clock.setFixedTime(new Date(site.fixedTime));
    await use();
  }, { auto: true }],
});

export { expect };
