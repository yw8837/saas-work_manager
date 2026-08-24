# Gates: 일감체크 가입·베타 권한·배포 보안

Scope: 공개 가입 뒤 코드 또는 무료 시작이 가능하고, 계정당 1회 30일 Pro와 검증 가능한 Supabase 연결을 배포본까지 증명한다.

- [x] G1: 가입 후 베타 안내와 권한 UI 회귀 테스트가 통과한다
  CHECK: npm test -- src/components/beta-activation-gate.test.tsx src/components/settings-panel.test.tsx src/components/workspace-auth-gate.test.tsx src/components/workspace-provider-plan.test.tsx
  EXPECT: Test Files  4 passed
  EVIDENCE: 전체 회귀 테스트에 포함되어 통과(2026-08-25)

- [x] G2: Supabase 권한·마이그레이션·Sites health 계약 테스트가 통과한다
  CHECK: npm test -- src/lib/supabase/migration-contract.test.ts src/lib/supabase/contract-single-source.test.ts src/sites/entry-server.test.ts scripts/sites-remote-smoke.test.mjs
  EXPECT: Test Files  4 passed
  EVIDENCE: 전체 회귀 테스트에 포함되어 통과(2026-08-25)

- [x] G3: 전체 정적 검사와 단위 테스트가 통과한다
  CHECK: npm test && npm run typecheck && npm run lint
  EXPECT: 89 files / 479 tests, typecheck, lint pass
  EVIDENCE: 89 files / 479 tests, typecheck, lint 통과(2026-08-25)

- [x] G4: Sites 배포 산출물이 생성되고 Worker 계약 검증이 통과한다
  CHECK: npm run build:sites && node scripts/verify-sites-output.mjs
  EXPECT: Sites output verified
  EVIDENCE: Sites output verified 및 Android/iOS shell verify 통과(2026-08-25)

- [x] G5: 운영 의존성 취약점 감사가 통과한다
  CHECK: npm audit --omit=dev
  EXPECT: found 0 vulnerabilities
  EVIDENCE: found 0 vulnerabilities(2026-08-25)

- [x] G6: 공개 배포의 health와 주요 경로가 통과한다
  CHECK: npm run smoke:sites -- https://ilgamcheck-beta.bsfire1237.chatgpt.site
  EXPECT: 공개 배포 기본 계약 확인 완료
  EVIDENCE: Sites v16에서 통과, 이번 배포 후 재검증 예정

- [x] G7: 공개 배포가 연결된 Supabase와 현재 런타임 계약을 증명한다
  CHECK: npm run runtime:readback -- https://ilgamcheck-beta.bsfire1237.chatgpt.site
  EXPECT: runtime 202608250011 service-role current
  EVIDENCE: Sites v16에서 runtime 202608250011 및 service-role current 확인, 이번 배포 후 재검증 예정

- [x] G8: 두 전용 계정으로 계정 간 데이터 격리와 공개 수정 요청을 검증한다
  CHECK: npm run verify:hosted:ephemeral
  EXPECT: HOSTED_VERIFY PASS
  EVIDENCE: HOSTED_VERIFY PASS — RLS 격리, 직접 DML 차단, 수정요청·Realtime·토큰 회전·계정당 베타 1회 검증(2026-08-25)
