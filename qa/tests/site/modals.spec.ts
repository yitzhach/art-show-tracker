/* CLAUDE.md: a .modal must wrap its head/body/foot in .modal-card. The outer
   .modal is pointer-events:none scaffolding, so without the card the dialog
   renders transparent and cannot be typed into. Three shipped that way: the
   suites clicked with el.click(), which ignores pointer-events. This reads
   the computed style instead, on every page, without opening anything. */
import { test, expect } from '../../lib/test';
import { site } from '../../lib/site';

test.skip(() => test.info().project.name !== test.info().config.projects[0].name,
  'markup, not layout or colour: one project is enough');

for (const pagePath of site.pages) {
  test(`every modal on ${pagePath} can take input`, async ({ page }) => {
    await page.goto(pagePath);
    const modals = await page.locator('.modal').evaluateAll(els => els.map(m => {
      const card = m.querySelector(':scope > .modal-card');
      return { id: m.id || '(no id)', card: !!card, events: card ? getComputedStyle(card).pointerEvents : '' };
    }));
    for (const m of modals) {
      expect(m.card, `#${m.id} has no .modal-card wrapper`).toBe(true);
      expect(m.events, `#${m.id} .modal-card does not take pointer events`).not.toBe('none');
    }
  });
}
