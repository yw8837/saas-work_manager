# Gates: 일감체크 가입·베타 권한·배포 보안

Scope: 공개 가입 뒤 코드 또는 무료 시작이 가능하고, 계정당 1회 30일 Pro와 검증 가능한 Supabase 연결을 배포본까지 증명한다.

- [ ] G1: 가입 후 베타 안내와 권한 UI 회귀 테스트가 통과한다
  CHECK: npm test -- src/components/beta-activation-gate.test.tsx src/components/settings-panel.test.tsx src/components/workspace-auth-gate.test.tsx src/components/workspace-provider-plan.test.tsx
  EXPECT: Test Files  4 passed
  EVIDENCE: pending

- [ ] G2: Supabase 권한·마이그레이션·Sites health 계약 테스트가 통과한다
  CHECK: npm test -- src/lib/supabase/migration-contract.test.ts src/lib/supabase/contract-single-source.test.ts src/sites/entry-server.test.ts scripts/sites-remote-smoke.test.mjs
  EXPECT: Test Files  4 passed
  EVIDENCE: pending

- [ ] G3: 전체 정적 검사와 단위 테스트가 통과한다
  CHECK: npm test && npm run typecheck && npm run lint
  EXPECT: Test Files
  EVIDENCE: pending

- [ ] G4: Sites 배포 산출물이 생성되고 Worker 계약 검증이 통과한다
  CHECK: npm run build:sites && node scripts/verify-sites-output.mjs
  EXPECT: Sites output verified
  EVIDENCE: pending

- [ ] G5: 운영 의존성 취약점 감사가 통과한다
  CHECK: npm audit --omit=dev
  EXPECT: found 0 vulnerabilities
  EVIDENCE: pending

- [ ] G6: 공개 배포의 health와 주요 경로가 통과한다
  CHECK: npm run smoke:sites -- https://ilgamcheck-beta.bsfire1237.chatgpt.site
  EXPECT: 공개 배포 기본 계약 확인 완료
  EVIDENCE: pending

- [ ] G7: 공개 배포가 연결된 Supabase와 현재 런타임 계약을 증명한다
  CHECK: npm run runtime:readback -- https://ilgamcheck-beta.bsfire1237.chatgpt.site
  EXPECT: runtime 202608250011 service-role current
  EVIDENCE: pending

- [ ] G8: 두 전용 계정으로 계정 간 데이터 격리와 공개 수정 요청을 검증한다
  CHECK: npm run verify:hosted:ephemeral
  EXPECT: HOSTED_VERIFY PASS
  EVIDENCE: pending
