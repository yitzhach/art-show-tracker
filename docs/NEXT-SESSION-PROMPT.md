# Prompt for a new chat

Paste everything in the box into a new Claude Code chat on this repository.
The same prompt works every time: the plan says where to pick up.

```
Continue building Show Ledger for other artists.

Read docs/product-plan.md first, starting with its "Pick up here" section,
then docs/START-HERE.md. Do what "Pick up here" says is next, then carry on
through the plan's status table in order. docs/audit-2026-11.md has the
evidence behind the plan; open it only when you need a finding.

You make the engineering and product decisions. The plan's "Decisions already
made" table is settled; anything it does not cover, decide, write the
decision and the reason into the plan, and keep going.

I want this hands-off. You have my permission to open pull requests, merge
them to main once every check passes, and let the deploy run, as CLAUDE.md →
Shipping describes. After each merge, check the live site. Do not ask me to
review code or to go to GitHub.

Stop and message me only for:
- a checkpoint in the plan (a link to try, and the one thing I need to do);
- something on the plan's "Still Isaac's" list;
- a test you cannot make pass honestly.

My real season is on the live site and I have a full backup of it. Any change
to how saved data is stored needs a test that old data still loads unchanged.

Before you stop for any reason, rewrite the plan's "Pick up here" section so
the next chat can resume from it without this one, and get that onto main.
Keep every message to me short and in plain language.
```
