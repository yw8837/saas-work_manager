# Gates: public beta UX, mobile MVP, and release readiness

OWNS: src/**, scripts/**, android/**, ios/**, capacitor.config.*, public/**, docs/**, README.md, package.json, package-lock.json, .gitignore

Scope: The public beta landing has an honest, non-blocking discovery flow; the responsive app is packaged as an Android/iOS-ready MVP; release verification proves the deployed experience.

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

- [x] G4: Public landing links keep discovery actions public and reserve login for explicit beta-entry calls to action.
  CHECK: npm test -- src/components/product-preview.test.tsx src/components/hosted-entry-safety.test.tsx
  EXPECT: Test Files
  EVIDENCE: exit=0; 2 files / 8 tests passed; product preview has no workspace route links and hosted landing discovery links stay on-page.

- [x] G5: The landing and core workspace render safely at mobile width, including the preview, touch controls, and no horizontal overflow.
  CHECK: $env:NEXT_PUBLIC_STORAGE_MODE='local'; npm run build; npx playwright test e2e/responsive-ui.spec.ts --project=mobile --workers=1 --reporter=list
  EXPECT: 7 passed
  EVIDENCE: exit=0; 7 passed at 320px, 375px, and 390px; touch CTA, revision panel, focus, and WCAG contrast verified.

- [x] G6: The Capacitor mobile shell has a valid Android and iOS configuration and packages the current production web build.
  CHECK: npm run mobile:verify
  EXPECT: [mobile-verify] PASS
  EVIDENCE: exit=0; Android/iOS shells synced from the current hosted Sites build.

- [x] G7: Source quality and the Sites production artifact both pass after the UX and mobile changes.
  CHECK: npm run lint && npm run typecheck && npm run build:sites
  EXPECT: dist/server/index.js
  EVIDENCE: exit=0; lint/typecheck passed and Sites emitted dist/server/index.js; production dependency audit found 0 vulnerabilities.

- [ ] G8: The public deployed URL serves the landing, SPA deep links, health route, policy pages, and install files after publication.
  CHECK: npm run smoke:sites -- https://ilgamcheck-beta.bsfire1237.chatgpt.site
  EXPECT: 공개 배포 기본 계약 확인 완료
  EVIDENCE: pending

RESOLVED: The earlier OpenNext artifact mismatch was removed by the supported Vite/Sites runtime migration, which emits dist/server/index.js directly. G4 replaces the obsolete private-only deployment wording because this beta is intentionally public.
