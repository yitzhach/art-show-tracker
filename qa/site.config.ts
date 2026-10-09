/* ==========================================================================
   What the audit needs to know about THIS site. Everything else in qa/ is
   generic; this file, audit-baseline.json and tests/site/ are the parts that
   belong to the tracker.
   ========================================================================== */
import type { SiteConfig } from './lib/site';

const config: SiteConfig = {
  // Static files: serve the repo root the way build/run-suites.cjs does.
  serve: {
    command: 'python3 -m http.server 8765 --bind 127.0.0.1',
    cwd: '..',
    readyURL: 'http://127.0.0.1:8765/tracker/version.json',
  },
  baseURL: 'http://127.0.0.1:8765/tracker/',

  // Every page in nav.js's menu, plus the embed widget.
  pages: [
    'index.html', 'browse.html', 'calendar.html', 'expenses.html',
    'contacts.html', 'jury.html', 'map.html', 'embed.html',
  ],

  // Deadlines and "days until" are relative to today; freeze it so a commit
  // audits the same way next month. Same date as build/browser-tests.cjs.
  fixedTime: '2026-09-05T12:00:00',

  // Every other host is blocked, so no result depends on the network. Google
  // Fonts and Leaflet's CDN stay blocked: the suites run offline too.
  allowHosts: [],

  accept: [
    { page: 'embed.html', finding: 'network:404 shows.json',
      why: 'embed.html reads an exported shows.json beside it, and says so on the page when there is none' },
  ],
};

export default config;
