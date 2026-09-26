# Security update and domain readiness implementation plan

> Execute inline using superpowers:executing-plans, with one independent final review. User requested continuous execution through review.

**Goal:** Remove known production dependency vulnerabilities and prepare a safe custom-domain transition without breaking the existing judging URL.
**Architecture:** Keep Supabase and the current Sites deployment. Patch dependencies first; centralize deployment-origin defaults separately. Keep old customer tokens and current-origin authentication behavior intact.
**Tech Stack:** Next.js 16.3.x, React, Vite Sites Worker, Supabase, Vitest, Playwright.
**Spec:** HANDOFF.md, PRODUCT.md, GATES.md.

## Global constraints

- Preserve all pre-existing dirty/untracked files. Work on a new branch; never commit user materials.
- Next and eslint-config-next: same latest available 16.3.x; keep @next/env aligned. npm generates the lockfile.
- No paid plan changes, credential exposure, destructive data changes or removal of old domain routes.
- External DNS/OAuth changes require verified access and exact authoritative values; no guessed records.

## Review focus

- Existing Google redirect behavior and customer bearer-token links must survive an origin change.
- Mobile localhost public-config fetch must use the configured HTTPS server.
- Invalid or credential-bearing configured origins must not create external redirects or leak tokens.
- Policy publication hashes are DB contracts, not arbitrary text to replace.
- A clean audit alone does not prove deployment or live authentication works.

## Task 1: Dependency security update

Files: package.json, package-lock.json; verification report under docs/verification.
- [x] Reproduce production audit: 5 vulnerable packages, including critical next.
- [x] Update next/@next/env/eslint-config-next to 16.3.6 with npm, then npm audit fix (no --force).
- [x] Run npm run check:release and npm run build:sites plus verify-sites-output.
- [ ] Independent review, record results, commit only task files and open the requested security PR.

## Task 2: Domain readiness

Files: origin configuration helper, actual origin consumers, corresponding tests and environment example; exact consumers determined by read-only inventory before implementation.
- [x] Inventory hardcoded production origin references and distinguish runtime consumers from historical evidence and test fixtures.
- [x] Write failing tests for configured HTTPS origin, invalid origins and localhost/mobile fallback before runtime changes; characterize unchanged current-origin customer/OAuth behavior for both domains.
- [x] Implement the smallest shared configuration preserving the current production URL by default.
- [x] Re-run unit/static/build/E2E verification; inspect Sites domain status and DNS.
- [ ] Only enable the new origin after DNS/TLS and OAuth readiness are established; keep old URL live.

## Task 3: Review and handoff

- [x] Independent whole-diff review, fix important findings and repeat applicable tests.
- [ ] Update HANDOFF.md and verification evidence with completed and blocked steps distinctly.
- [ ] Create/attach PRs. Shared-main merge and deployment depend on verified checks; never claim external completion from local tests.

## Execution ledger

- Baseline b10312b, branch chore/security-domain-20260926. Audit reproduced before changes.
- Ruling: use the existing checkout on a new branch, preserving unrelated edits; no worktree creation consent was supplied. Task files do not overlap the dirty survey document.
- Ruling: dependency patch validation uses the existing failing npm audit as the red gate rather than adding a redundant source-version assertion.
- User requested execution through final review; proceed from the existing HANDOFF specification without another plan-approval round.
- Independent review found a wildcard-host acceptance flaw. Red: 5 test failures; green after shared normalizer repair: 21 tests. Added old/new OAuth and copied customer-link regression tests: 23 pass.
- Final check:release: exit 0, 91 test files/516 tests, 44 E2E cases, lint/typecheck/audit/local+hosted builds pass. Full audit 0 vulnerabilities. Sites default and custom-origin builds validated; default build restored.
- Ruling: use repository-mandated PR workflow (finishing-a-development-branch option 2); do not merge shared main without authorization. Preserve user's dirty assets.
- User authorized agent DNS setup and approved provider's SLA/traffic-limitation notice. Exact three DNS records registered successfully; authoritative/public propagation and TLS verification follow.
