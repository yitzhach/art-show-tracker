/* The site under test: site.config.ts, with two overrides from the shell.

     SITE_QA_URL=https://…/   audit a deployed copy; no local server is started
     SITE_QA_LIVE=1           the same, at liveURL (npm run test:live)
     SITE_QA_PAGES=a.html,b   audit only these pages                          */
import config from '../site.config';

export type SiteConfig = {
  /** How to start the site locally. Omit when it is only ever audited live. */
  serve?: { command: string; cwd?: string; readyURL?: string;
    /** How long the site may take to come up, in ms. Default 180000. */
    timeout?: number };
  /** Where the site is deployed, for `npm run test:live` after it goes live. */
  liveURL?: string;
  /** Pages are relative to this. Keep the trailing slash. */
  baseURL: string;
  pages: string[];
  /** Freeze the page's clock (Date only; timers still run). */
  fixedTime?: string;
  /** Hosts besides the site's own that the browser may reach. */
  allowHosts: string[];
  /** Views a page opens without a new URL (windows, panels, dialogs, tabs):
      tests/views.spec.ts opens each in turn and audits it. See README. */
  views?: ViewsConfig;
  /** Findings that are the site working as designed, each with the reason.
      Debt goes in audit-baseline.json instead: this is for non-bugs. */
  accept?: { page: string; finding: string; why: string }[];
};

export type ViewsConfig = {
  /** Page to open them from. Default: the first page. */
  page?: string;
  /** Wait for this to be visible before opening anything, e.g. a window the
      app opens by itself after load, so it cannot land on top of the view. */
  settled?: string;
  /** The container holding the buttons or links that open the views. */
  openWith: string;
  /** Their accessible names, one view each. Missing at a size (a phone dock
      shows fewer) → skipped at that size. */
  names: string[];
  /** The opened view: it must be visible, and the audit is scoped to it.
      Omit to audit the whole page. */
  scope?: string;
  /** Known issues, "<name> <start of the finding>": why. Bugs and by-design
      alike; only findings not listed here fail. */
  known?: Record<string, string>;
};

const live = process.env.SITE_QA_URL
  || (process.env.SITE_QA_LIVE ? config.liveURL : undefined);
if (process.env.SITE_QA_LIVE && !live) throw new Error('SITE_QA_LIVE: set liveURL in qa/site.config.ts');
const slash = (u: string) => (u.endsWith('/') ? u : u + '/');

export const site: SiteConfig & { listedPages: string[] } = {
  ...config,
  // What "unlisted" is measured against, even when SITE_QA_PAGES narrows a run.
  listedPages: config.pages,
  serve: live ? undefined : config.serve,
  baseURL: slash(live || config.baseURL),
  pages: process.env.SITE_QA_PAGES
    ? process.env.SITE_QA_PAGES.split(',').map(p => p.trim()).filter(Boolean)
    : config.pages,
};
