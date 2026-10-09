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
   - its address, and `liveURL` if it is deployed
   - the full list of pages, including routes in an app
   - `views`, if the app opens windows, panels or tabs without changing the
     URL (a desktop-style app, a dashboard with tabs): the container of the
     buttons that open them, their names, and the selector of the opened view.
     Without it the audit only sees each page as it first loads.

   If tests need today's date pinned, set `fixedTime`. Also act on any
   `CHECK` the installer printed (Vitest or Jest it could not patch).
2. `npm ci --prefix qa`, then `npm --prefix qa test` with no baseline. Read
   `qa/results/audit.json`, decide which findings are real bugs and which are
   the site working as designed:
   - By design → add to `accept` in `qa/site.config.ts`, with the reason.
   - Real bugs → leave them to the baseline. Never fix site code during setup
     unless asked.
3. `npm --prefix qa run audit:baseline` records the real bugs as known issues.
   `npm --prefix qa test` must then pass.
4. The installer added the **Site QA workflow** block to CLAUDE.md (below).
   Run the project's own tests too: they must still pass.
5. Commit `qa/`, `.github/workflows/site-qa.yml`, `.claude/skills/site-qa/`
   and CLAUDE.md on a side branch. Tell the user what the audit found, in
   plain words, and propose fixes. Change no site code until they approve.

## The workflow (every change, once site-qa is in)

The installer writes this into CLAUDE.md between site-qa markers; `update`
keeps it current. Follow it unless the project's CLAUDE.md says otherwise.

1. Work on a side branch, never straight on the branch that deploys.
2. Test a local build with `npm --prefix qa test`.
3. Report findings in plain words first; no site code changes until the
   owner approves which fixes.
4. Fix in small batches; the project's tests and `npm --prefix qa test` pass
   after each.
5. Anything near saved data: also check existing data with a second tab open.
6. If the host builds a preview of the branch, audit it before asking to
   land: `SITE_QA_URL=<preview URL> npm --prefix qa test`.
7. Land on the deploying branch only on the owner's word, then
   `npm --prefix qa run test:live`. In a cloud session the live host must be
   under Allowed domains in the environment's network settings.

Tedious sweeps may go to a Haiku subagent to save usage: reading long test
output or `audit.json`, sorting findings, listing what a page offers, checking
many pages or links for one thing. It reports back in a few lines. Decisions,
code changes, fixes and anything the owner approves stay in the main session.

## Update it

Same clone, then `node "${TMPDIR:-/tmp}/site-qa/bin/site-qa.mjs" update .`. It
replaces only the shared files. It never touches `qa/site.config.ts`,
`qa/audit-baseline.json` or `qa/tests/site/`, and refreshes only the site-qa
block in CLAUDE.md. If it says the dependencies
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

   A `views.spec.ts` failure lists that view's new findings; a bug the owner
   hasn't approved fixing, or something by design, goes in `views.known`
   with why. A spec failure prints its assertion in the run output. To rerun one page:
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
