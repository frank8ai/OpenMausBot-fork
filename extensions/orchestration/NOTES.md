# Orchestration v3 (P0)

Source of truth: `server/orchestration/` on branch `feat/orchestration-v3-p0` of
`C:\Users\frank\Documents\frank\Projects\OpenMausBot`.

Upstream proposal: https://github.com/milind-soni/OpenMausBot/pull/6897

The files here are a verbatim copy of that branch as of 2026-11-21, kept so the
work survives independently of the upstream review. When the pull request is
merged, delete this folder and track the code from upstream instead.

Contents:

| File | Role |
| --- | --- |
| `contracts.ts` | zod schemas: task envelope, handoff delta, subagent isolation policies |
| `blackboard-store.ts` | versioned in-memory state, optimistic concurrency, idempotent applies |
| `serializer.ts` | runtime DTOs to bounded prompt slices |
| `harness.ts` | prompt assembly, two-strike retry policy, handoff deltas |
| `subagent.ts` | depth-limited fan-out with per-role tool filtering |
| `tool-filter.ts` | strips spawn and write tools per isolation policy |
| `verifier-runner.ts` | acceptance checks; Windows `.cmd`/`.bat` via ComSpec with metacharacter guard |
| `*.test.ts` | unit, adversarial and e2e suites (46 tests) |

Local check on Windows 11, Node 24.13.1:

```
npx vitest run server/orchestration   # 3 files, 46 tests passed
npx tsc -p tsconfig.server.json --noEmit
npx oxlint --deny-warnings server/orchestration
```
