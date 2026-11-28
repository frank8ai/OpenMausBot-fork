# Diátaxis & Keep a Changelog Reference

## Keep a Changelog Template
```markdown
## [1.2.0] - 2026-11-25
### Added
- Support `Idempotency-Key` header on POST `/v1/orders`.
### Changed
- Enforce strict JSON schema validation on webhook payloads.
### Fixed
- Eliminate stale cursor pagination on empty pages.
### Security
- Enforce 30s replay window on HMAC webhook signatures.
```

## Diátaxis Placement Rules
- **Tutorials**: `docs/tutorials/<quickstart>.md` — runnable end-to-end onboarding.
- **How-To**: `docs/how-to/<task>.md` — task-oriented recipe.
- **Reference**: `docs/reference/<api-or-cli>.md` — machine-verified field tables.
- **Explanation**: `docs/explanation/<architecture>.md` — ADR & design tradeoffs.
