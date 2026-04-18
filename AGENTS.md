# TaskProof Agent Rules

## Coding Conventions
- Prefer small modules with explicit types and no hidden global state.
- Keep TaskProof fully local-first. No network dependency beyond the target site under test.
- Use strict TypeScript and fail fast on invalid task specs.
- Generated evidence must be deterministic in structure and easy to diff.
- Use plain, durable file formats: JSON, HTML, PNG, ZIP.
- Treat the demo app as product surface, not scaffolding. No fake controls or placeholder copy.
- Avoid adding a dependency unless it removes meaningful complexity.

## Review Rules
- Review for behavioral bugs first, then regressions, then missing tests, then clarity gaps.
- Every new CLI feature needs at least one direct test.
- Every supported step type needs coverage in either unit tests or the demo flow.
- If a report panel exists, it must be backed by real evidence data.
- Remove dead code and unused styles immediately instead of carrying them forward.

## Stop-And-Fix Rule
- If any command or implementation path fails twice, stop extending scope.
- Find and repair the root cause before continuing.
- If the right repair is to reduce scope, reduce it explicitly and keep the acceptance criteria honest.

## Working Defaults
- Use npm workspaces.
- Keep root scripts stable and human-readable.
- Prefer committed sample artifacts over mocked screenshots in docs.
- Keep prose concise in code comments and docs.
