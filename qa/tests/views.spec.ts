/* Views a page opens without a new URL (windows, panels, dialogs, tabs), from
   site.views in site.config.ts. The page audit only sees each page as it
   first loads; this opens every view in turn, at every size, and checks it
   the same way: page errors, console errors, accessibility scoped to the view
   and, on a phone, sideways scroll. No tests when site.views is not set. */
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../lib/test';
import { site } from '../lib/site';
import { A11Y_TAGS } from '../lib/audit';

const views = site.views;
const known = views?.known ?? {};

for (const name of views?.names ?? []) {
  test(`view: ${name}`, async ({ page }, info) => {
    if (!views) return;
    const problems: string[] = [];
    page.on('pageerror', e => problems.push(`pageerror: ${e.message.split('\n')[0]}`));
    page.on('console', m => {
      if (m.type() === 'error') problems.push(`console: ${m.text().split('\n')[0].slice(0, 160)}`);
    });

    await page.goto(views.page ?? site.pages[0] ?? './');
    // Whatever the app opens by itself must land first, or it can land on
    // top of the view and the audit would look at the wrong thing.
    await page.waitForLoadState('networkidle');
    if (views.settled) await expect(page.locator(views.settled).first()).toBeVisible();

    const opener = page.locator(views.openWith)
      .getByRole('button', { name, exact: true })
      .or(page.locator(views.openWith).getByRole('link', { name, exact: true }));
    test.skip(await opener.count() === 0, `"${name}" is not offered at this size`);
    await opener.first().click();
    // Views are often lazy chunks: let the chunk and its first render land.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    let axe = new AxeBuilder({ page }).withTags(A11Y_TAGS);
    if (views.scope) {
      // A view that never came up must fail, not pass with nothing to audit.
      await expect(page.locator(views.scope).first()).toBeVisible();
      axe = axe.include(views.scope);
    }
    for (const v of (await axe.analyze()).violations) {
      const where = v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ');
      problems.push(`a11y:${v.id} ${v.help} (${v.nodes.length}) ${where}`);
    }

    if (info.project.name === 'phone') {
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (wide > 1) problems.push(`overflow: page scrolls sideways by ${wide}px`);
    }

    info.annotations.push(...problems.map(p => ({ type: 'finding', description: p })));
    const fresh = problems.filter(p => !Object.keys(known).some(k => `${name} ${p}`.startsWith(k)));
    expect(fresh, `new findings in "${name}" (${info.project.name}); a known one goes in views.known with why`).toEqual([]);
  });
}
