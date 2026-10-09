---
name: site-qa
description: Browser-test a website without screenshots, and set that testing up in any project. Runs the qa/ page audit (page and JS errors, broken links, accessibility, phone layout, dark mode) and Playwright specs, reads qa/results/audit.json, and drives pages as text with qa/browse. Use when asked to test, check, verify, QA or click through a site or a UI change; to "set up site-qa", "add browser tests" or "update site-qa" in a project; before finishing a UI change; or when the "Site QA" check fails in CI.
---

# site-qa

Browser testing from yitzhach/site-qa. Results are text and JSON. Never decide
pass or fail from a screenshot.

First look for `qa/site.config.ts` at the repo root:

- **Missing** → set it up (below), then run it.
- **Present, and the user asked to update** → update (below).
- **Present** → run it.

## Set it up

```bash
git clone --depth 1 https://github.com/yitzhach/site-qa "${TMPDIR:-/tmp}/site-qa"
node "${TMPDIR:-/tmp}/site-qa/bin/site-qa.mjs" init .
```

It prints what it guessed about the site. Then:

1. Read `qa/site.config.ts` and fix every line marked `CHECK`:
   - how to start the site (from `package.json` scripts and the README)
   - its address
   - the full list of pages, including routes in an app

   If tests need today's date pinned, set `fixedTime`.
2. `npm ci --prefix qa`, then `npm --prefix qa test` with no baseline. Read
   `qa/results/audit.json`, decide which findings are real bugs and which are
   the site working as designed:
   - By design → add to `accept` in `qa/site.config.ts`, with the reason.
   - Real bugs → leave them to the baseline. Never fix site code during setup
     unless asked.
3. `npm --prefix qa run audit:baseline` records the real bugs as known issues.
   `npm --prefix qa test` must then pass.
4. Add two lines to the project's CLAUDE.md (create it if missing):
   ```
   npm ci --prefix qa && npm --prefix qa test   # browser tests → qa/results/audit.json
   qa/browse open <url>                         # read and drive a page as text
   ```
5. Commit `qa/`, `.github/workflows/site-qa.yml` and `.claude/skills/site-qa/`.
   Tell the user what the audit found, in plain words, and offer to fix it.

## Update it

Same clone, then `node "${TMPDIR:-/tmp}/site-qa/bin/site-qa.mjs" update .`. It
replaces only the shared files. It never touches `qa/site.config.ts`,
`qa/audit-baseline.json` or `qa/tests/site/`. If it says the dependencies
changed, run `npm ci --prefix qa`. Then run the tests and commit.

## Run it

1. `npm ci --prefix qa` (skip it if `qa/node_modules` exists).
2. `npm --prefix qa test` runs the audit and the specs at desktop size, phone
   size and in dark mode. It starts the site itself.
3. Read `qa/results/audit.json`:
   - `new` was introduced by this change and fails the run. Fix it.
   - `errors` are pages that didn't finish auditing. The message says why.
   - `fixed` means a known issue went away. Run
     `npm --prefix qa run audit:baseline` and commit the smaller baseline.
   - `unlistedPages` are pages the site links to that the audit skips. Add
     them to `qa/site.config.ts`.

   A spec failure prints its assertion in the run output. To rerun one page:
   `npm --prefix qa run audit -- -g <page> --project=phone`.
4. Also run any other test suites the project's CLAUDE.md lists.

## Look at a page yourself, as text

Start the site with the `serve` command from `qa/site.config.ts`, then:

```bash
qa/browse open <baseURL + page>
qa/browse find "Add to cart"     # search the snapshot rather than reading it all
qa/browse click e13              # refs come from the snapshot
qa/browse fill e25 "text" --submit
qa/browse console                # what the page logged
qa/browse open --device="Pixel 7" <url>   # phone size
qa/browse close
```

`qa/browse --help` lists every command. The guides are in
`qa/node_modules/@playwright/cli/skills/playwright-cli/references/`.
`qa/browse` doesn't block other hosts, so in a sandbox with no internet,
failed font or CDN requests are not the site's bugs.

## Turn what you checked into a test

Add a spec under `qa/tests/site/`:

- Import `test` and `expect` from `../../lib/test`, which blocks other hosts
  and freezes the clock just as the audit does.
- Locate elements by role and name, such as
  `page.getByRole('button', { name: 'Menu' })`.
- Assert what a user would see: `toBeVisible`, `toHaveText`, `toHaveCSS`. A
  click that didn't throw proves nothing.
- `qa/browse recording-start` … `recording-stop` prints your clicks as
  Playwright code to start from.

## Rules

- Never add a new issue to the baseline, or to `accept`, just to get a green
  run. If one has to stay, tell the user what it is and why.
- Never skip, loosen or delete a check or a spec to make a run pass.
- Never edit the shared files in `qa/`, since `update` overwrites them. Change
  them in yitzhach/site-qa instead.
- When CI fails, read the job log: it prints every new issue and failed
  assertion. Reproduce it locally with the same command.
