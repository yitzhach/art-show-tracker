# Show Ledger

A season planner for artists who sell at juried art fairs: a catalogue of
shows scored for fit against what you make and what it sells for, and a
ledger for your own season — applications, calendar, route, expenses, sales
and collectors. It runs in the browser with no account, and every number
says where it came from.

Live: https://art-show-tracker.bobdylan2000.workers.dev/

## Where things are

| | |
|---|---|
| `tracker/` | The app. Plain HTML, CSS and JavaScript, no build step |
| `build/` | The Python data build and the browser test suites |
| `qa/` | The page audit (desktop, phone, dark mode) |
| `worker/` | The members' intel Worker. Complete, not deployed |
| `docs/` | Start with `START-HERE.md`; `product-plan.md` is what is being built next |
| `App.tsx`, `components/`, `vite.config.ts` | A separate portfolio site that happens to live in this repo |

## Working on it

`CLAUDE.md` has the rules, the commands and the traps.
`docs/product-plan.md` has the plan. `docs/NEXT-SESSION-PROMPT.md` is the
prompt that starts a build session.

Pushing to `main` deploys the live site through Cloudflare.
