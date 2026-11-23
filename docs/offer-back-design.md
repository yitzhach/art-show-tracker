# Offering a show's facts back to other artists (plan B5)

**Status: design only (2026-11-23). Nothing here is built.** The plan
(`docs/product-plan.md`, B5) asks for the design and the provenance grade in
Phase B, and for nothing that pretends to send. Until accounts exist (Phase
D) there is nowhere to send to. The flow ships in Phase E, through the review
queue described there.

## What it is

After an artist adds a show the catalogue does not have (pasted from its
page, or typed in), the app may ask once: *"Share these facts with other
artists?"* A yes sends the show's **facts**, never anything of the artist's
own. Every other artist then sees those facts graded `member`, with a date,
until something better replaces them.

## What may go, and what never does

| May go (facts) | Never goes (the artist's own, P-4) |
|---|---|
| Name, city, state | Stars and rating |
| Show dates, apply-by date, notification date | Status, applications, results |
| Jury fee, booth fee (with the size the text named) | Notes, gross sales, individual sales |
| The show's own page link | Contacts, hearts, rankings, expenses |

Each fact goes as one row, chosen by the artist on a screen that lists them
with tick boxes, all ticked except money (the fee reader's history says a
plausible wrong number is the costly error, W-4). Nothing is sent without
that screen.

## The grade: `member`, with a date

`member` already exists in the drawer ("reported", for the intel network).
A shared fact uses it unchanged in meaning: *reported by an artist, not
checked by anyone else.* It carries:

- `captured`: the day the artist read it (their `checkedAt`, else the day
  they added the show). The drawer renders "as of <date>", as for every other
  sourced fact since B4.
- `how`: `pasted-page` (the artist gave the page's link), `pasted-text`
  (an email, a post, no link) or `typed`.
- `confirmations`: how many artists, besides the first, sent the same value.

A second artist sending the same value raises `confirmations`; the chip then
reads "reported · confirmed by 2". It stays `member`. It never becomes
`verified`: that word means the page was opened by whoever maintains the
catalogue (`CLAUDE.md`), and an artist's paste is not that. An organiser's
correction (C4, grade `organiser`) or a maintainer opening the page replaces
it.

Two artists sending **different** values: both are shown, side by side, with
their dates; neither wins by arithmetic. A fee is never averaged.

## Quotes, and private text

A fact read by the paste reader can carry the sentence it came from. That
sentence is the best evidence there is, and also the easiest way to leak
something private.

- **From a public page** (the artist gave a link): the quote may go, cut to
  the one sentence, with email addresses and phone numbers removed before it
  leaves the device.
- **From an email or other private text** (no link): the facts may go; the
  quote never does. An organiser's email to an artist is correspondence, not
  a publication.

Today the reader keeps the whole pasted text only during review and stores
no per-field quote. Recording the quote per field is the first piece of
build work when this ships; it changes `import.js` and the fixtures, not the
stored show.

## Consent, retraction, abuse

- The ask appears once per show, after the import's Undo window, and "No"
  is remembered for that show. A setting turns the ask off.
- The artist can see everything they have shared and retract any of it; a
  retracted fact leaves the catalogue unless someone else also sent it.
- One account's reports are rate-limited, and a single report never changes
  a money fact in the catalogue on its own: it shows as a possible update
  beside the current value (the same rule as W-4 for the watcher).
- Shared facts carry an opaque member id, never the artist's name, unless
  the artist chooses to be credited.

## The record (for Phase E)

```
memberFact {
  id, memberId,                 // opaque
  catalogueId | proposedShowId, // an existing record, or a new show proposal
  field, value,                 // one fact per row
  captured, how, quote|null, sourceUrl|null,
  submittedAt, status           // queued | accepted | rejected | retracted
}
```

Accepted rows are folded into `fit-data.json` by the build, like
`research-overrides.json` is today, so the browser still reads flat files and
nothing new sits in the read path.

## Already in place from Phase B

- A pasted show is `source: 'paste'` and keeps the page's link (B1, B2).
- `checkedAt` records when the artist last checked the show's page (B4).
- The drawer shows a capture date for every sourced fact (B4), so a `member`
  fact will read the same way as every other.
