# Prompt for a new chat

Paste everything in the box into a new Claude Code chat on this repository.
The same prompt works every time: the plan's status table says where to
pick up.

```
Continue building Show Ledger for other artists.

Read docs/product-plan.md, then docs/START-HERE.md. Find the first phase in
the plan's status table that is not done and build it, item by item, in the
order written. docs/audit-2026-11.md has the evidence behind the plan; open
it only when you need a finding.

You make the engineering and product decisions. The plan's "Decisions already
made" table is settled; anything it does not cover, decide, write the
decision and the reason into the plan, and keep going.

I want this hands-off. You have my permission to open pull requests, merge
them to main once every check passes, and let the deploy run, as CLAUDE.md →
Shipping describes. Do not ask me to review code or to go to GitHub.

Stop and message me only for:
- a checkpoint in the plan (a link to try, and the one thing I need to do);
- something on the plan's "Still Isaac's" list;
- a test you cannot make pass honestly.

Before the plan's checkpoint 1 is done, ship nothing that changes how saved
data is stored. My real season is in my browser on the live site.

When a phase is finished, tick it off in the plan, update START-HERE, and
carry on into the next phase if no checkpoint is waiting. Keep every message
to me short and in plain language.
```
