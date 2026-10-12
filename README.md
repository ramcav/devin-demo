# Internal tools platform (Devin prototype)

A prototype for a build-vs-buy question: can a fintech replace Microsoft Power Apps for its internal tools by building them in-house with Devin?

The approach: build one governed platform layer once (auth, role-based permissions, maker-checker approvals, an append-only audit log, server-paged tables), then have Devin generate each internal app on top of it from a written recipe (a Devin skill).

- **What to build:** [`SPEC.md`](SPEC.md)
- **How we build (rules for Devin):** [`.devin/knowledge.md`](.devin/knowledge.md)
- **Recipe for every new app (Devin skill):** [`.devin/skills/new-internal-app/SKILL.md`](.devin/skills/new-internal-app/SKILL.md)
- **Recipe for every new integration (Devin skill):** [`.devin/skills/new-integration/SKILL.md`](.devin/skills/new-integration/SKILL.md)
- **How it was built:** [`BUILD_LOG.md`](BUILD_LOG.md)

Setup instructions, the role list and what's mocked are added once the app is built.

All data in this repository is synthetic.
