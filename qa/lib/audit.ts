/* ==========================================================================
   The page audit: load one page as a visitor would and report what is wrong
   with it as data, never as a picture. Generic: nothing here knows which
   site it is looking at.

   Each finding is { check, id, count, message, … }. The checks:
     http        the page itself answered 4xx/5xx
     js-error    an uncaught exception
     console     console.error from the page
     network     a request to the site's own origin failed or answered 4xx/5xx
     link        an <a href> on the site's own origin answers 4xx/5xx  (once)
     a11y        axe-core's WCAG 2.0/2.1 A and AA rules
     layout      the page scrolls sideways                              (phone)
     input-zoom  a form field under 16px, which iOS zooms into          (phone)
   Load metrics are recorded alongside and never judged.
   ========================================================================== */
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export type Finding = {
  check: string;
  /** Stable across runs: the baseline is keyed on check + id. */
  id: string;
  count: number;
  message: string;
  impact?: string;
  targets?: string[];
  help?: string;
};

export type Metrics = {
  ttfbMs: number | null;
  domContentLoadedMs: number | null;
  loadMs: number | null;
  lcpMs: number | null;
  requests: number;
  transferKB: number;
};

export type AuditResult = {
  page: string;
  project: string;
  url: string;
  status: number | null;
  findings: Finding[];
  /** Pages this one links to that the site config does not audit. */
  unlisted: string[];
  metrics: Metrics | null;
  /** Set aside by site.config.ts's accept list; never fail, never baselined. */
  accepted?: { key: string; count: number; why: string }[];
};

const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const MAX_LINKS = 200;

export async function auditPage(page: Page, opts: {
  pagePath: string; project: string; isMobile: boolean; baseURL: string;
  /** Fetch every link. Once per page is enough, so one project does it. */
  checkLinks: boolean;
  /** The pages the config audits: anything else this page links to is "unlisted". */
  listed: string[];
}): Promise<AuditResult> {
  const { baseURL } = opts;
  const origin = new URL(baseURL).origin;
  const ours = (u: string) => { try { return new URL(u).origin === origin; } catch { return false; } };
  // A URL as the site would name it: relative to baseURL, query dropped (the
  // tracker's ?v=<hash> cache-buster changes every build).
  const rel = (u: string) => {
    const s = u.split(/[?#]/)[0];
    return s.startsWith(baseURL) ? s.slice(baseURL.length) || './'
      : s.startsWith(origin) ? s.slice(origin.length) : s;
  };
  const tidy = (s: string) => s.split('\n')[0]
    .replace(/https?:\/\/[^\s)'"]+/g, rel)
    .replace(/\d{4,}/g, '#')
    .replace(/\s+/g, ' ').trim().slice(0, 160);

  const tally = new Map<string, Finding>();
  const add = (f: Omit<Finding, 'count'>, count = 1) => {
    const prev = tally.get(f.check + ':' + f.id);
    if (prev) prev.count += count;
    else tally.set(f.check + ':' + f.id, { ...f, count });
  };

  page.on('pageerror', e =>
    add({ check: 'js-error', id: tidy(e.message), message: e.message.split('\n')[0] }));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/^Failed to load resource/.test(m.text())) return;  // network names the URL
    add({ check: 'console', id: tidy(m.text()), message: m.text().split('\n')[0] });
  });
  const answered = new Set<string>();  // a 4xx is reported once, not again as a failure
  page.on('response', r => {
    if (!ours(r.url()) || r.status() < 400) return;
    answered.add(r.url());
    if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) return;  // http
    add({ check: 'network', id: `${r.status()} ${rel(r.url())}`,
          message: `${r.request().method()} ${rel(r.url())} answered ${r.status()}` });
  });
  page.on('requestfailed', r => {
    if (!ours(r.url()) || answered.has(r.url())) return;  // other hosts are blocked on purpose
    add({ check: 'network', id: `failed ${rel(r.url())}`,
          message: `${rel(r.url())} failed: ${r.failure()?.errorText ?? 'unknown'}` });
  });

  const url = new URL(opts.pagePath, baseURL).href;
  const response = await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  const status = response ? response.status() : null;
  if (status === null || status >= 400) {
    add({ check: 'http', id: String(status ?? 'none'), message: `the page answered ${status ?? 'nothing'}` });
  }

  // Links: every same-origin href, fetched once. Pages they lead to that the
  // config does not list are reported, so the audit's coverage can grow.
  const norm = (p: string) => p.replace(/^\.?\//, '').replace(/(^|\/)index\.html$/, '$1');
  const isPage = (p: string) => /(^|\/)[^/.]*$|\.html?$/.test(p);  // not .json, .ics, .png…
  const listed = new Set(opts.listed.map(norm));
  const hrefs = await page.locator('a[href]').evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href));
  const links = new Set<string>();
  const unlisted = new Set<string>();
  for (const href of hrefs) {
    if (!/^https?:/.test(href) || !ours(href)) continue;
    const bare = href.split('#')[0];
    links.add(bare);
    const path = bare.split('?')[0];
    if (!path.startsWith(baseURL)) continue;
    const p = path.slice(baseURL.length);
    if (isPage(p) && !listed.has(norm(p))) unlisted.add(p || './');
  }
  if (opts.checkLinks) {
    for (const link of [...links].slice(0, MAX_LINKS)) {
      const res = await page.request
        .get(link, { failOnStatusCode: false, maxRedirects: 5, timeout: 10_000 })
        .catch(() => null);
      if (!res || res.status() >= 400) {
        add({ check: 'link', id: rel(link),
              message: `link to ${rel(link)} answered ${res ? res.status() : 'nothing'}` });
      }
    }
  }

  const axe = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
  for (const v of axe.violations) {
    add({
      check: 'a11y', id: v.id, message: v.help, impact: v.impact ?? undefined, help: v.helpUrl,
      targets: v.nodes.slice(0, 5).map(n => n.target.map(t => (Array.isArray(t) ? t.join(' >>> ') : t)).join(' ')),
    }, v.nodes.length);
  }

  if (opts.isMobile) {
    const phone = await page.evaluate(() => {
      const name = (el: Element) => {
        const parts: string[] = [];
        for (let e: Element | null = el; e && e !== document.body && parts.length < 3; e = e.parentElement) {
          if (e.id) { parts.unshift('#' + e.id); break; }
          const cls = Array.from(e.classList).slice(0, 2);
          parts.unshift(e.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : ''));
        }
        // Nothing to go on: quote its text so it can be found without a picture.
        const text = !el.id && !el.classList.length ? (el.textContent ?? '').trim().slice(0, 30) : '';
        return parts.join(' > ') + (text ? ` "${text}"` : '');
      };
      const root = document.documentElement;
      const width = root.clientWidth;
      // The outermost elements past the right edge that nothing clips: the
      // ones to fix. A parent with overflow other than visible contains its
      // children; position:fixed does not scroll the page.
      const wide: string[] = [];
      if (root.scrollWidth > width + 1) {
        const clipped = (el: Element) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (getComputedStyle(p).overflowX !== 'visible') return true;
          }
          return false;
        };
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= width + 1) continue;
          if (getComputedStyle(el).position === 'fixed' || clipped(el)) continue;
          const parent = el.parentElement;
          if (parent && parent !== document.body && parent.getBoundingClientRect().right > width + 1) continue;
          wide.push(`${name(el)} (right edge ${Math.round(r.right)}px)`);
          if (wide.length === 5) break;
        }
      }
      // iOS zooms into a field under 16px on focus and never zooms back out.
      // Hidden fields count: a closed dialog's inputs are typed into later.
      const fields = document.querySelectorAll(
        'textarea, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio])' +
        ':not([type=range]):not([type=color]):not([type=file]):not([type=submit])' +
        ':not([type=button]):not([type=reset]):not([type=image])');
      const small = Array.from(fields)
        .map(el => ({ el, px: parseFloat(getComputedStyle(el).fontSize) }))
        .filter(f => f.px < 16)
        .map(f => `${name(f.el)} (${f.px}px)`);
      return { scrollWidth: root.scrollWidth, width, wide, small };
    });
    if (phone.scrollWidth > phone.width + 1) {
      add({ check: 'layout', id: 'horizontal-scroll', targets: phone.wide,
            message: `the page is ${phone.scrollWidth}px wide on a ${phone.width}px screen` });
    }
    if (phone.small.length) {
      add({ check: 'input-zoom', id: 'font-size-under-16px', targets: phone.small.slice(0, 5),
            message: 'form fields under 16px: iOS zooms in on focus and does not zoom back out' },
          phone.small.length);
    }
  }

  // Through PerformanceObserver, not performance.getEntriesByType: a frozen
  // clock replaces window.performance, and the copy has no entries.
  const metrics = await page.evaluate(async () => {
    const entries = <T extends PerformanceEntry>(type: string) => new Promise<T[]>(resolve => {
      const got: T[] = [];
      try {
        const po = new PerformanceObserver(list => { got.push(...(list.getEntries() as T[])); });
        po.observe({ type, buffered: true });
        setTimeout(() => { po.disconnect(); resolve(got); }, 50);
      } catch { resolve(got); }  // type not supported here
    });
    const [[nav], res, lcp] = await Promise.all([
      entries<PerformanceNavigationTiming>('navigation'),
      entries<PerformanceResourceTiming>('resource'),
      entries<PerformanceEntry>('largest-contentful-paint'),
    ]);
    const ms = (v: number | undefined) => (v ? Math.round(v) : null);
    return {
      ttfbMs: ms(nav?.responseStart),
      domContentLoadedMs: ms(nav?.domContentLoadedEventEnd),
      loadMs: ms(nav?.loadEventEnd),
      lcpMs: ms(lcp.at(-1)?.startTime),
      requests: res.length + 1,
      transferKB: Math.round(((nav?.transferSize ?? 0) + res.reduce((n, r) => n + r.transferSize, 0)) / 1024),
    } satisfies Metrics;
  }).catch(() => null);

  return {
    page: opts.pagePath, project: opts.project, url, status,
    findings: [...tally.values()], unlisted: [...unlisted], metrics,
  };
}
