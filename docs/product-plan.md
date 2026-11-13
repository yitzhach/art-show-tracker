# Product plan — opening Show Ledger to other artists

Written 2026-11-13, after the read-only audit (`docs/audit-2026-11.md`, cited
below as F1…F10). This is the build plan of record. `docs/build-phases.md` is
the older idea list; its numbering still stands and is cited here by number.

**The goal:** a product ready to demo to artists and to show organisers, built
to last, with the owner (Isaac) looking in only at the checkpoints below.

**How to use this file:** find the first row in the status table that is not
`done`, read that phase, build it, tick it off here, and carry on. Stop only
at a checkpoint or at something on "Still Isaac's".

---

## Status

| Phase | What | State |
|---|---|---|
| A | Safe for anyone, no account needed | **next** |
| B | Add a show from anywhere | not started |
| C | Demo-ready | not started |
| D | Accounts, backup and sync | not started — opens with checkpoint 3 |
| E | Sharing and the common catalogue | not started |
| F | Paid tier | not started |

Update the State column, and the "Done so far" list under each phase, in the
same pull request as the work.

---

## Decisions already made — do not reopen without a new fact

| # | Decision | Why |
|---|---|---|
| P-1 | **Artists first; shows second.** The promise to an artist: *know which shows are worth applying to, and whether they paid.* Show organisers are a data partner and the second audience | The whole app already serves this; nothing in the audit argues for a different user |
| P-2 | **Free is everything that runs in the artist's own browser:** catalogue, fit scores, ledger, calendar, money, collectors, full backup. **Paid, later, is what costs money to run or is scarce:** sync across devices, the assistant and page reader, road miles, mock jury, member intel | A free tier that costs nothing to host can stay free forever. F6: the free outside services cannot carry a paid product |
| P-3 | **No automated collection from application sites.** Show data comes from four places: the artist's own hands, the show's own website, other artists' corrections, and written permission | The sites' terms forbid it (audit, "What the show sites allow"), and a product resting on one site's pages breaks when that site changes |
| P-4 | **Stars, hearts, statuses, notes, money and contacts belong to the artist.** They never enter the shared catalogue. Sharing is a deliberate act, per item. The ten factor scores and editorial notes are the product and ship to everyone | Isaac, 2026-11-13 |
| P-5 | **One account system: the studio platform's sign-in** (repo `yitzhach/Art-Talk-Back`), with outside artists in a database separate from Isaac's own studio. The Supabase option is hidden from newcomers and retired later | It is the only back end built for many studios, with isolation tests. A second sign-in system would be a second thing to secure. Needs the platform's on-hold "second studio" work (its D-170), so Phase D opens with a checkpoint |
| P-6 | **Working name: Show Ledger.** The Worker name, the code names and the storage keys do not change. The artist's own name comes from their profile, never from a default | Renaming the Worker strands saved seasons (`CLAUDE.md`, Do NOT). A final name and a domain are Isaac's, at checkpoint 2 |
| P-7 | **The stack stays:** classic scripts, no build step, Cloudflare, the honesty rules. No rewrite | No finding in the audit is caused by the stack. Page weight was measured and is fine |
| P-8 | **Claude ships when everything is green.** See `CLAUDE.md` → Shipping. Isaac sees checkpoints, not pull requests | Isaac asked for a hands-off build |
| P-9 | **Unfinished surfaces are hidden from newcomers**, not shown disabled: Mock jury, the Pro cards, Network, "Share to network", the calendar's disabled connect buttons. The code and its tests stay | In a demo a disabled control reads as a broken one. The honesty rule is unchanged: nothing claims to work that does not |
| P-10 | **The full backup file includes contacts**, do-not-contact people included, and says so. The mailing CSV still drops them. Contacts are still never synced to any server | A backup that silently loses people is not a backup. This narrows the wording of the contacts rule in `CLAUDE.md`; update that line when A1 ships |

---

## Checkpoints — the only times Isaac is needed

A checkpoint is a short message (under 150 words, plain language) with a link
to try and one thing to do or decide. Work that does not depend on the answer
carries on.

| # | When | What Isaac does |
|---|---|---|
| 1 | Full backup (A1) is live | Makes one full backup of his real season and keeps the file. **No change to how saved data is stored ships before this is done** |
| 2 | End of Phase C | Runs the five-minute demo on his own phone. Decides the name and whether to buy a domain |
| 3 | Start of Phase D | Says go. Does the parts only he can: a new database, secrets, a new Worker's first deploy |
| 4 | Start of Phase F | Chooses the payment provider and the price |

## Still Isaac's — never done without him

Secrets. Spending money. Deleting data, a database or a Worker. A new
Worker's first deploy. A domain. Any real email to real people. Anything
legal: the privacy and terms pages are drafted by Claude and read by him, and
a lawyer's hour is worth having before a public launch or a first charge.

Three things he can do at any time, none of which block the build:

1. **Until checkpoint 1:** use the export buttons on the Ledger, Money,
   Collectors and Calendar pages and keep the files. Today most of his season
   exists in one browser (F1).
2. **Ask permission.** Two short emails, drafts at the end of this file: to
   Creative West (ZAPP's owner) and to EntryThingy.
3. **Turn on Cloudflare Web Analytics** for the site (free, no cookies), so
   there is evidence of use by the time of the demo.

---

## Phase A — Safe for anyone, no account needed

**Why first:** today a new visitor sees Isaac's season under Isaac's name,
and anyone without an account can lose a year of records by clearing a
browser (F1, F1b, F2, F3). Nothing else matters until that is fixed.

Build in this order.

- **A1. Full backup and restore.** One file holding every collection and
  every setting the artist made (shows, events, applications, rankings,
  expenses, sales, contacts, debriefs, reviews, catalogue hearts and ratings,
  the fit profile, layout). Restore treats the file as untrusted input: an
  unknown or newer-versioned file is refused whole with a reason; a good one
  replaces the device's data with Undo. Old shows-only exports still import.
  The page says when the last backup was made and nudges when it is old.
  → **Checkpoint 1.**
- **A2. An honest first run.** No seeded season. A new browser opens to an
  empty ledger with three ways to start: browse the catalogue, add a show,
  or load a clearly labelled sample season (fictional shows, the same loud
  TEST DATA treatment as the practice show). A device still holding the
  untouched seed is cleared to empty; a device with real data is not touched.
- **A3. No Isaac in the defaults.** Artist name and website come from a
  profile the artist fills in, and are used in the titles, header, share
  card, embed and manifest. Empty profile → no name shown, never a
  placeholder person.
- **A4. Account & sync tells the truth to a newcomer.** "Your season is saved
  in this browser. Back it up." The Supabase form moves behind "Advanced" and
  only appears when a Supabase project is already configured on the device.
- **A5. Keep the data alive.** Ask the browser for persistent storage; on an
  iPhone, say how to add the app to the home screen and why it matters; listen
  for changes from a second tab so a stale tab cannot overwrite a newer edit
  (F8).
- **A6. Housekeeping.** A real `README.md`. The version stamp stops
  promising a `commit` nobody writes (F10). Basic security headers on every
  response (no sniffing, no framing by other sites, a referrer policy) and a
  content security policy in report-only mode (F7) — check Cloudflare's
  current documentation for how static assets set headers.

**Gate A.** A fresh browser shows no trace of Isaac. A test backs up a full
database, wipes it, restores it, and finds every collection identical. A
fixture shaped like a real schema-v11 season loads unchanged. Every suite and
`npm --prefix qa test` pass, and the preview is audited before landing.

Done so far: —

---

## Phase B — Add a show from anywhere

**Why:** the catalogue cannot be the only way in, and the only importer is
written for one site's page layout (F4). The durable answer is that the
artist brings the show in, from whatever page they are looking at (P-3).

- **B1. Paste anything.** One paste box for the text of any show page or
  email. A general reader looks for the things every prospectus states —
  name, place, dates, deadline, jury fee, booth fee, notification date — and
  hands candidates with a confidence to the review table that already exists
  (`import.js`). The ZAPP reader stays as one recogniser among several.
  Nothing is fetched; nothing is saved before review; a value it cannot read
  is "not found", never a guess.
- **B2. Keep the source.** The page's link is stored on the show as its
  source and opens in a new tab. The app never fetches it.
- **B3. From a phone.** Register the app as a share target, so on Android
  "Share → Show Ledger" from a browser lands in the paste box. iPhone has no
  equivalent for web apps: the paste box is the path, and the page says so.
- **B4. Freshness.** Every catalogue fact shows the date it was captured. A
  show in the ledger carries "last checked", and near its deadline the app
  asks the artist to look at the show's own page rather than trusting an old
  date.
- **B5. Offer it back (design only in this phase).** After an artist adds a
  show the catalogue does not have, the app can say "share these facts with
  other artists?" — facts only, never stars or notes. Until accounts exist
  there is nowhere to send them, so this phase writes the design and the
  provenance grade (`member`, with a date), and builds nothing that pretends
  to send.

**Gate B.** Hand-written sample texts in at least five different page
layouts (written for the tests, not copied from any site) read to the right
fields or to "not found". A wrong number never appears without the artist
having seen it in review. The fee reader's audit rule applies: check the
output against the raw text, not by reading the code.

Done so far: —

---

## Phase C — Demo-ready

**Why:** the pieces are strong and the first five minutes are not. Seen on
the live site at phone size: the catalogue's controls fill two screens before
the first show; the ledger's header wraps ten controls over five rows; the
count reads "237 shows" above "135 of 240"; Account & sync asks for a
database key.

- **C1. The first five minutes.** A new browser lands on a welcome that says
  what this is in two sentences, asks two questions (what you make, what it
  sells for), and drops the artist into their ranked list. A returning
  browser goes straight to the ledger.
- **C2. Phone first.** On the catalogue the filters collapse and the first
  show is on the first screen. On the ledger the header keeps the menu and
  "Add show"; the rest moves into the menu. One count, stated one way.
- **C3. Say where the catalogue is strong.** 100 of 237 shows are in
  Florida. The catalogue page states its coverage honestly, and "tell us
  about a show we are missing" is one tap from an empty search.
- **C4. For shows.** One page an organiser can be sent to: this is how your
  show appears, here is how to correct it. Until accounts exist the
  correction is an email the organiser sends from their own mail app, and the
  page says that is what it is. A corrected fact carries the grade
  `organiser` and a date.
- **C5. A demo that is not Isaac's season.** `?demo=1` loads the fictional
  sample season without touching saved data, and banners itself as a demo.
- **C6. Hide what is not finished (P-9).**
- **C7. The public basics.** A plain-language privacy page (what is stored,
  where, and that contacts never leave the device) and terms page, both
  marked draft until Isaac has read them. Page descriptions and link-preview
  tags. A demo script and a one-page "what this is" in `docs/`.

**Gate C.** From a clean browser on a phone, in under five minutes: land →
answer two questions → see ranked shows → open one → heart it → add it to the
ledger → add an outside show by paste → see a calendar clash → log a sale →
see whether the show paid. Site QA clean at phone, desktop and dark.
→ **Checkpoint 2.**

Done so far: —

---

## Phase D — Accounts, backup and sync

Opens with **checkpoint 3**: it resumes platform work Isaac put on hold, and
needs things only he can do.

- Sign-up by emailed code on the studio platform, for anyone. Outside
  artists' data in its own database, separate from Isaac's studio.
- First account feature: **the full backup, kept for you.** One versioned
  snapshot per account, saved after changes, restorable on a new device.
  Contacts are left out of it (they never go to a server); the page says so
  and points at the backup file.
- Shows and sales keep the per-record sync they already have. More
  collections move to per-record sync only when two-device editing of them is
  a real need.
- Delete my account, and everything in it, from the app.
- Before any artist's content is shown to another: the content security
  policy is enforced, which means the inline scripts on those pages move into
  files (F7).
- The page reader: paste text or a screenshot and the assistant proposes
  fields. Same review table, graded `search` at best, never `verified`.

**Gate D.** The platform's isolation tests cover a second studio. A new
artist signs up on a phone, enters a season, and finds it on a laptop.
Deleting the account leaves nothing behind.

## Phase E — Sharing and the common catalogue

- Share a show, a note or a ranking with one other artist, by invitation;
  private until then (P-4).
- Artists' corrections and new shows flow into the catalogue through a
  review queue, each fact dated and graded `member`; a second artist
  confirming it upgrades it.
- Organisers can claim and maintain their own listing.
- The member intel network (`worker/`, `docs/handoff.md`) is folded into the
  platform rather than deployed as a third back end.
- **Launch gate for the catalogue:** every record's facts trace to the
  show's own site, an organiser, a member, or written permission. Records
  that still rest only on the original ZAPP capture are counted on a
  dashboard and worked down before a public launch.

## Phase F — Paid tier

Opens with **checkpoint 4**. Billing and entitlements; `plan.js` cards turn
into real offers only when they can be bought. Before the first charge, the
free outside services are replaced or licensed: road miles, address lookup,
weather (F6).

---

## Rules for every phase

- Everything in `CLAUDE.md` still holds. The honesty rules are the product.
- One phase item per pull request where practical; small beats clever.
- Nothing ships that changes how saved data is stored until checkpoint 1 is
  done. After that, a schema change needs a migration test against old data.
- New pages need the theme snippet, the nav entry, and the service worker
  list (the suites enforce the last two).
- When a phase finishes: tick the status table, write "Done so far", update
  `docs/START-HERE.md`, and send the checkpoint message if there is one.

---

## Appendix — two emails for Isaac to send

**To Creative West (ZAPP and CaFÉ):**

> I'm a working artist who applies through ZAPP. I've built a free planning
> tool for artists — a season ledger that helps us decide which shows to
> apply to and track deadlines — and every listing in it links back to the
> show's ZAPP page to apply. I'd like to do this properly. Your terms mention
> "Specific Terms" for uses beyond personal use: could we talk about what
> would let the tool show basic event facts (name, dates, deadline, fees)
> with a link to ZAPP? I'm glad to show it to you.

**To EntryThingy:**

> I'm a working artist building a free season-planning tool for artists.
> I'd like to list calls hosted on EntryThingy — name, dates, deadline and
> fee only — with a link straight to your entry page. Is there a way you'd
> prefer I do that, or a feed I should use?
