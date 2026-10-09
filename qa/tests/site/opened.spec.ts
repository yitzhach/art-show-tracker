/* The page audit looks at each page as it first loads, so a drawer, dialog or
   menu is only ever checked closed. This opens each one the way a visitor
   would and runs the same checks inside it: page and console errors, axe's
   WCAG A/AA rules, and on a phone sideways scroll and fields under 16px.
   Every project runs it, so dark mode's contrast is checked open too.

   Not covered: the assistant panel (only shown signed in to the studio) and
   anything that needs saved data first (the debrief, the calendar quick look). */
import type { Page, TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../../lib/test';

/* `shown` proves it opened; `scope` is what gets checked (default: the
   dialog or drawer around `shown`). The page behind it is audited closed already. */
type State = { page: string; name: string; open: (p: Page) => Promise<unknown>; shown: string; scope?: string };

const click = (sel: string) => (p: Page) => p.click(sel);
const STATES: State[] = [
  { page: 'index.html', name: 'page menu', open: click('.nav-btn'), shown: '.nav-list', scope: '.nav-menu' },
  { page: 'index.html', name: 'Add show', open: click('#btnAdd'), shown: '#drawer', scope: '#drawer' },
  { page: 'index.html', name: 'Account & sync', open: click('#syncPill'), shown: '#settingsDrawer', scope: '#settingsDrawer' },
  { page: 'index.html', name: 'Import shows', open: click('#btnImportShows'), shown: '#importModal .modal-card', scope: '#importModal' },
  { page: 'index.html', name: 'Share', open: click('#btnShare'), shown: '#shareModal .modal-card', scope: '#shareModal' },
  { page: 'browse.html', name: 'show drawer', open: click('#cards .card .card-name'), shown: '#idrClose', scope: '.idr' },
  { page: 'browse.html', name: 'Add a show', open: click('#btnAddRecord'), shown: '#recDrawer', scope: '#recDrawer' },
  { page: 'browse.html', name: 'ranking editor', open: click('#rkNew'), shown: '#rkModal .modal-card', scope: '#rkModal' },
  { page: 'calendar.html', name: 'new event', open: click('#btnNew'), shown: '#evTitle', scope: '.cal-sheet' },
  { page: 'calendar.html#2026-09-05/day', name: 'day view', open: async () => {}, shown: '.cal-day', scope: '.cal-day' },
  { page: 'expenses.html', name: 'Add expense', open: click('#expAdd'), shown: '#exModal .modal-card', scope: '#exModal' },
  { page: 'expenses.html', name: 'Add sale', open: click('#saleAdd'), shown: '#saModal .modal-card', scope: '#saModal' },
  { page: 'expenses.html', name: 'Import sales CSV', open: click('#saleImport'), shown: '#imModal .modal-card', scope: '#imModal' },
  { page: 'contacts.html', name: 'Add contact', open: click('#ctAdd'), shown: '#ctModal .modal-card', scope: '#ctModal' },
  { page: 'jury.html', name: 'Start one', open: click('#jyNew'), shown: '#jyModal .modal-card', scope: '#jyModal' },
];

async function problems(page: Page, info: TestInfo, errors: string[], shown: string, scope: string) {
  const out = [...errors];
  const axe = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  for (const v of axe.violations) {
    out.push(`a11y ${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`);
  }
  if (info.project.use.isMobile) {
    const phone = await page.evaluate(sel => {
      const root = document.documentElement;
      const box = document.querySelector(sel);
      const open = box && (box.closest('.modal, .drawer') || box);
      const fields = Array.from(document.querySelectorAll('textarea, select, input'))
        .filter(el => !/^(hidden|checkbox|radio|range|color|file|submit|button|reset|image)$/.test((el as HTMLInputElement).type || ''))
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .map(el => ({ id: el.id || el.getAttribute('name') || el.tagName.toLowerCase(), px: parseFloat(getComputedStyle(el).fontSize) }))
        .filter(f => f.px < 16);
      return { page: root.scrollWidth - root.clientWidth,
               open: open ? open.scrollWidth - open.clientWidth : 0,
               openScrolls: open ? getComputedStyle(open).overflowX : '', fields };
    }, shown);
    if (phone.page > 1) out.push(`layout: the page scrolls ${phone.page}px sideways`);
    if (phone.open > 1 && phone.openScrolls !== 'hidden') out.push(`layout: the open panel scrolls ${phone.open}px sideways`);
    for (const f of phone.fields) out.push(`input-zoom: #${f.id} is ${f.px}px (iOS zooms under 16px)`);
  }
  return out;
}

for (const s of STATES) {
  test(`${s.page} — ${s.name}, opened`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push('js-error: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_BLOCKED_BY_CLIENT/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(s.page);
    // The catalogue wires its buttons once its shows have loaded; a click
    // before that does nothing.
    if (s.page.startsWith('browse.html')) await expect(page.locator('#cards .card').first()).toBeVisible();
    await s.open(page);
    await expect(page.locator(s.shown).first()).toBeVisible();
    expect(await problems(page, info, errors, s.shown, s.scope ?? s.shown), `${s.name} on ${s.page}`).toEqual([]);
  });
}
