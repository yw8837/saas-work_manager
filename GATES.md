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
  EVIDENCE: Sites v18에서 health, 공개 설정, SPA 경로, manifest, service worker, favicon 통과(2026-08-25)

- [x] G7: 공개 배포가 연결된 Supabase와 현재 런타임 계약을 증명한다
  CHECK: npm run runtime:readback -- https://ilgamcheck-beta.bsfire1237.chatgpt.site
  EXPECT: runtime 202608250011 service-role current
  EVIDENCE: Sites v18에서 Supabase runtime 202608250011 및 service-role current 확인(2026-08-25)

- [x] G8: 두 전용 계정으로 계정 간 데이터 격리와 공개 수정 요청을 검증한다
  CHECK: npm run verify:hosted:ephemeral
  EXPECT: HOSTED_VERIFY PASS
  EVIDENCE: HOSTED_VERIFY PASS — RLS 격리, 직접 DML 차단, 수정요청·Realtime·토큰 회전·계정당 베타 1회 검증(2026-08-25)

## 2026-08-26 외부 베타 완성도 하드닝

- [x] G9: 사용자 작업물·백업 폴더가 있어도 공식 릴리스 검사가 제품 테스트만 실행한다
  CHECK: npm run check:release
  EXPECT: 제품 테스트, typecheck, lint, build, audit가 모두 통과한다

- [x] G10: 30일 Pro 이용권을 유지하면서 사용 14일째부터 설문을 놓치지 않게 안내한다
  CHECK: 관련 단위 테스트와 데스크톱·모바일 E2E
  EXPECT: 사용 14일 전에는 설문을 재촉하지 않고, 14일째부터 만료 뒤까지 설정 가능한 공개 설문 링크를 보여준다

- [x] G11: Sites 정적 HTML 경로도 클릭재킹·MIME 스니핑·리퍼러 노출 방지 정책을 배포 산출물에 포함한다
  CHECK: Sites 산출물 계약 테스트와 공개 URL 헤더 검사
  EXPECT: /, /today, /privacy, /terms가 동일한 보안 정책으로 제공된다

- [ ] G12: 계정 삭제·정책 게시·백업 복구의 운영 증거가 최신 상태로 검증된다
  CHECK: npm run policy:manifest:verify && npm run operational:evidence:verify
  EXPECT: 게시 정책과 30일 이내 운영 증거 검증 통과

- [ ] G13: 프로젝트 팀원이 아닌 외부 이메일이 가입 인증 메일을 받고 로그인한다
  CHECK: Supabase Auth readback, SMTP DNS/evidence, 외부 주소 가입 실험
  EXPECT: 커스텀 SMTP가 활성화되고 외부 가입·인증·로그인 통과

- [ ] G14: 최종 Sites 배포본이 모바일웹·Android·iOS 셸·DB 계약·베타 코드·설문 링크를 함께 검증한다
  CHECK: build:sites, mobile:verify, test:e2e:release, smoke:sites, runtime readback
  EXPECT: 모든 자동 검증과 공개 배포 확인 통과
