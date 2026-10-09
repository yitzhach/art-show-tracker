# qa/: browser testing for this site

From [yitzhach/site-qa](https://github.com/yitzhach/site-qa). It tests the
site in a real, headless browser and reports what is wrong as text and JSON.
Nobody has to look at a screenshot to know whether it passed.

## What runs

- **The audit** (`tests/audit.spec.ts`): every page in `site.config.ts`, at
  desktop and phone size and in dark mode. It checks for:
  - the page answering 4xx/5xx
  - uncaught JS errors and `console.error`
  - failed requests to the site's own files
  - broken links
  - accessibility (axe-core, WCAG 2.0/2.1 A and AA)
  - pages that scroll sideways on a phone
  - form fields under 16px (iOS zooms into those)

  Load times are recorded, never judged.
- **Site specs** (`tests/site/`): this site's own checks, written like any
  Playwright test.

Every test runs with other hosts blocked (and the clock frozen if
`site.config.ts` says so), so a result depends on the code, not the network.

## Which files are whose

Three things belong to this project, and `site-qa update` never touches them:

- `site.config.ts`
- `audit-baseline.json`
- `tests/site/`

Everything else is shared, and an update overwrites it. To change a shared
file, change it in yitzhach/site-qa.

## Commands (from the repo root)

```bash
npm ci --prefix qa                       # once per machine or session
npm --prefix qa test                     # everything; starts the site itself
npm --prefix qa run audit                # just the audit
npm --prefix qa run audit -- -g <page> --project=phone   # one page, one size
SITE_QA_URL=https://example.com/ npm --prefix qa run audit   # a deployed copy
npm --prefix qa run test:live           # everything, against liveURL
npm --prefix qa test -- tests/views.spec.ts   # just the views (windows, panels, tabs)
npm --prefix qa run report               # open the last HTML report
qa/browse open <url>                     # drive a page by hand, as text
```

`qa/browse` is [Playwright CLI](https://github.com/microsoft/playwright-cli):
`snapshot` prints the page as an accessibility tree with refs (`e8`), and
`click e8`, `fill e25 "text"`, `console` and `requests` act on and inspect it.
`qa/browse --help` lists every command, and `recording-stop` prints what you did
as Playwright code for a spec.

## Results

- `results/audit.json` is what the audit found, short enough to read whole:
  - `new`: fails the run
  - `fixed`: a known issue is gone
  - `knownByCheck`: how many baselined occurrences each check has
  - `accepted`: set aside on purpose, with the reason
  - `unlistedPages`: linked pages the config doesn't audit
  - `pages`: each page's result and load metrics
- `results/report/` is Playwright's HTML report.
- A failed test keeps a **trace**: every step, with the DOM, console and network
  at that moment. Open it with `npx playwright show-trace <trace.zip>` (in qa/)
  or drop it on trace.playwright.dev.

## Known issues and accepted ones

`audit-baseline.json` lists the issues the site already had when the audit
arrived, per page and viewport, so only new ones fail. When something is
fixed, `npm --prefix qa run audit:baseline` rewrites the file. Check the diff
before committing: it should only shrink.

`accept` in `site.config.ts` is different. It holds findings that are the site
working as designed, each with its reason. They never fail and are never
baselined.

## CI

`.github/workflows/site-qa.yml` runs the type check and every test on each
push and pull request. A failed test runs once more, and a pass on that retry
still fails the run, so a flaky test gets reported instead of hidden. On
failure the report, traces and `audit.json` are uploaded as an artifact for
14 days. **On a public repo anyone can download that artifact. Never put a
real login or key in a test.**

## Playwright version

It's pinned at 1.56.1 because Claude Code cloud sessions ship that Chromium
build and block browser downloads. To upgrade, bump `@playwright/test` and
`playwright-core` together, in yitzhach/site-qa.
