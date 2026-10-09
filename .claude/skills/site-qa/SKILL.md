---
name: site-qa
description: Test this site in a real browser without screenshots. Runs the qa/ audit (page errors, JS and console errors, broken links, accessibility, phone layout) and the Playwright specs, reads qa/results/audit.json, and drives pages as text with qa/browse. Use when asked to test, check, verify, QA or click through the site or a UI change, before finishing any change under tracker/, or when the "Site QA" check fails in CI.
---

# Site QA

Everything lives in `qa/`; `qa/README.md` has the detail. The browser is
headless and every result is text or JSON. Never decide pass or fail from a
screenshot.

## Run it

1. `npm ci --prefix qa`, once per session (skip it if `qa/node_modules` exists).
2. `npm --prefix qa test` runs the audit and the specs at desktop and phone
   size. It starts the site itself.
3. Read `qa/results/audit.json`:
   - `new` was introduced by this change and fails the run. Fix it.
   - `errors` are pages that didn't finish auditing. The message says why.
   - `fixed` means a known issue went away. Run
     `npm --prefix qa run audit:baseline` and commit the smaller baseline.
   - `unlistedPages` are pages the site links to that the audit skips. Add
     them to `qa/site.config.ts`.

   A spec failure prints its assertion in the run output. To rerun one page:
   `npm --prefix qa run audit -- -g browse.html --project=phone`.
4. Also run the older suites, `node build/run-suites.cjs` (see CLAUDE.md).

## Look at a page yourself, as text

Start the site (`python3 -m http.server 8765` from the repo root), then:

```bash
qa/browse open http://127.0.0.1:8765/tracker/browse.html
qa/browse find "Add a show"      # search the snapshot rather than reading it all
qa/browse click e13              # refs come from the snapshot
qa/browse fill e25 "Cherry Creek" --submit
qa/browse console                # what the page logged
qa/browse open --device="Pixel 7" http://…   # phone size
qa/browse close
```

`qa/browse --help` lists every command. The guides are in
`qa/node_modules/@playwright/cli/skills/playwright-cli/references/`. Unlike the
tests, `qa/browse` doesn't block other hosts, so a sandbox with no internet
logs errors for fonts, maps and routing. Those are not the site's bugs.

## Turn what you checked into a test

Add a spec under `qa/tests/site/`:

- Import `test` and `expect` from `../../lib/test`, which blocks the network
  and freezes the clock just as the audit does.
- Locate elements by role and name, such as
  `page.getByRole('button', { name: 'Menu' })`. These are the names the
  snapshot shows.
- Assert what a user would see or be able to do: `toBeVisible`, `toHaveText`,
  `toHaveCSS`. A click that didn't throw proves nothing; `el.click()` ignores
  `pointer-events`.
- `qa/browse recording-start` … `recording-stop` prints your clicks as
  Playwright code to start from.

## Rules

- Never add a new issue to `qa/audit-baseline.json`, or to `accept` in
  `qa/site.config.ts`, just to get a green run. If one has to stay, tell the
  user what it is and why.
- Never skip, loosen or delete a check or a spec to make a run pass.
- When CI fails, read the job log: it prints every new issue and failed
  assertion. Reproduce it locally with the same command. The uploaded traces
  are for a person.
