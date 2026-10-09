/* The site under test: site.config.ts, with two overrides from the shell.

     SITE_QA_URL=https://…/   audit a deployed copy; no local server is started
     SITE_QA_PAGES=a.html,b   audit only these pages                          */
import config from '../site.config';

export type SiteConfig = {
  /** How to start the site locally. Omit when it is only ever audited live. */
  serve?: { command: string; cwd?: string; readyURL?: string };
  /** Pages are relative to this. Keep the trailing slash. */
  baseURL: string;
  pages: string[];
  /** Freeze the page's clock (Date only; timers still run). */
  fixedTime?: string;
  /** Hosts besides the site's own that the browser may reach. */
  allowHosts: string[];
  /** Findings that are the site working as designed, each with the reason.
      Debt goes in audit-baseline.json instead: this is for non-bugs. */
  accept?: { page: string; finding: string; why: string }[];
};

const live = process.env.SITE_QA_URL;
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
