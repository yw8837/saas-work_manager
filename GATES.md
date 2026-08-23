# Gates: beta pricing and Worker deployment readiness

OWNS: src/**, scripts/**, supabase/migrations/**, docs/**, README.md, package.json, package-lock.json, .env.example, .gitignore, eslint.config.mjs, open-next.config.ts, wrangler.jsonc, .agents/**

Scope: Basic pricing, beta survey, landing clarity, and a Vite/Sites Worker build are ready. External deployment remains pending final remote verification.

- [x] G1: Basic limits, beta survey fields, landing safety, and runtime-contract tests pass together.
  CHECK: npm test -- src/components/feedback-panel.test.tsx src/components/hosted-entry-safety.test.tsx src/lib/domain/entitlements.test.ts src/lib/domain/plan-limits-contract.test.ts src/lib/supabase/contract-single-source.test.ts scripts/deploy-preflight-policy.test.mjs
  EXPECT: Test Files
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\최용우\Desktop\SaaS\01_일감체크\app; path=90f2b2637df1/51 entries; output=(node:29604) Warning: `--localstorage-file` was provided without a valid path | (Use `node --trace-warnings ...` to show where the warning was created)

- [x] G2: App source has no lint or TypeScript errors after adding project-local skills.
  CHECK: npm run lint && npm run typecheck
  EXPECT: tsc --noEmit
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\최용우\Desktop\SaaS\01_일감체크\app; path=90f2b2637df1/51 entries; output=> ilgamcheck@0.1.0 typecheck | > tsc --noEmit

- [x] G3: The current dynamic Next application produces a Cloudflare Worker-compatible OpenNext build.
  CHECK: node scripts/verify-worker-output.mjs
  EXPECT: worker output verified
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\최용우\Desktop\SaaS\01_일감체크\app; path=90f2b2637df1/51 entries; output=worker output verified

- [ ] G4: A Sites private production version is packaged and published with the Vite Worker runtime.
  EVIDENCE: pending

RESOLVED: The earlier OpenNext artifact mismatch was removed by the supported Vite/Sites runtime migration, which emits dist/server/index.js directly.
