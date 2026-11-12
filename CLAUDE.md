# DumosRx

@.agents/AGENTS.md

This file exists so the rules above load automatically: Claude Code reads
`CLAUDE.md` on its own but does not read `AGENTS.md` unless it's imported
or explicitly opened. When working inside `client/`, `web/`, or
`laravel-server/`, also read that package's own `AGENTS.md` — the file
above explains why they're kept separate instead of duplicated here.

## Testing Standards

Before creating, writing, modifying, refactoring, debugging, or reviewing any automated tests, test fixtures, mocks, or testing infrastructure, you MUST read and follow the canonical instructions in:

`.agents/skills/strict-testing/SKILL.md`

These standards are mandatory, not optional suggestions.
