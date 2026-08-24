# Beta Onboarding and Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 가입 뒤 베타 코드 또는 무료 시작으로 자연스럽게 이어지고, 계정당 1회 30일 Pro와 검증 가능한 배포 상태를 서버에서 강제한다.

**Architecture:** 기존 `WorkspaceProvider`와 Supabase 권한 RPC를 유지한다. 별도 진입 게이트는 기존 작업공간 설정에 완료 시각을 저장하고, DB 마이그레이션은 사용자 행 잠금 안에서 계정의 모든 코드 사용 이력을 검사한다. Sites Worker health는 서비스 역할 계약을 직접 확인한 뒤 기존 readback 스키마를 반환한다.

**Tech Stack:** React 19, Next.js 16, Vite Sites Worker, Supabase Auth/Postgres/RLS, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-08-25-beta-onboarding-security-design.md`

## Global Constraints

- 공개 가입과 이메일 인증 정책은 유지한다.
- Hosted 권한은 클라이언트 저장값을 신뢰하지 않는다.
- 베타 Pro는 계정당 총 1회, 30일이다.
- 비밀키·상류 오류 본문을 공개 응답이나 클라이언트 번들에 노출하지 않는다.
- 사용자가 만든 기존 미추적 파일과 `next-env.d.ts` 변경은 수정하지 않는다.

---

### Task 1: 첫 로그인 베타 안내

**Files:**
- Create: `src/components/beta-activation-gate.tsx`
- Create: `src/components/beta-activation-gate.test.tsx`
- Modify: `src/lib/store/seed.ts`
- Modify: `src/lib/store/storage.ts`
- Modify: `src/app/(workspace)/layout.tsx`
- Modify: `src/sites/routes.tsx`
- Modify: `src/styles/theme.css`

**Interfaces:**
- Consumes: `useWorkspace().activateInviteCode`, `updateSettings`, `planAccess`, `hydrated`, `runtimeMode`
- Produces: `BetaActivationGate({ children }): ReactNode`, `AppSettings.betaCodeOnboardingCompletedAt?: string`

- [ ] **Step 1: Write tests for first-entry display, successful code application, skip, and returning users**
- [ ] **Step 2: Run the focused test and verify the new component is missing**
- [ ] **Step 3: Implement the gate and additive settings field**
- [ ] **Step 4: Run focused tests and verify they pass**

### Task 2: 계정당 베타 1회 서버 강제

**Files:**
- Create: `supabase/migrations/202608250011_single_beta_grant_and_health_contract.sql`
- Modify: `src/lib/supabase/runtime-contract.ts`
- Modify: `scripts/verify-hosted-runtime-policy.mjs`
- Modify: `src/lib/supabase/migration-contract.test.ts`
- Modify: `src/lib/supabase/contract-single-source.test.ts`
- Modify: `src/components/workspace-provider-plan.test.tsx`

**Interfaces:**
- Consumes: `redeem_invite_code(text)` and per-user profile lock
- Produces: account-wide `already_redeemed` result and runtime contract `202608250011`

- [ ] **Step 1: Add failing migration contract tests for account-wide redemption**
- [ ] **Step 2: Verify the focused tests fail on the current migration**
- [ ] **Step 3: Add the forward-only migration and update the single-source contract constants**
- [ ] **Step 4: Verify migration and entitlement tests pass**

### Task 3: 코드 상태 UI 정리

**Files:**
- Modify: `src/components/settings-panel.tsx`
- Modify: `src/components/settings-panel.test.tsx`
- Modify: `src/components/workspace-provider.tsx`

**Interfaces:**
- Consumes: `planAccess.source`, `planAccess.expiresAt`, `activateInviteCode`
- Produces: internal marker-free success UI and disabled pending submit

- [ ] **Step 1: Add failing tests for hidden internal marker and pending button state**
- [ ] **Step 2: Verify failures**
- [ ] **Step 3: Implement the minimal UI changes**
- [ ] **Step 4: Verify focused tests pass**

### Task 4: Sites health를 실제 DB 계약에 연결

**Files:**
- Modify: `src/sites/entry-server.tsx`
- Modify: `src/sites/entry-server.test.ts`
- Modify: `scripts/sites-remote-smoke.mjs`
- Modify: `scripts/sites-remote-smoke.test.mjs`

**Interfaces:**
- Consumes: `probeHostedServiceRoleContract(url, key)` and bundled public policy/config constants
- Produces: fail-closed exact `/api/health` payload compatible with runtime readback

- [ ] **Step 1: Add failing Worker tests for DB contract success, mismatch, timeout, and secret non-disclosure**
- [ ] **Step 2: Verify the existing shallow health implementation fails the tests**
- [ ] **Step 3: Implement the bounded contract probe and exact response**
- [ ] **Step 4: Verify Worker and readback tests pass**

### Task 5: 배포·보안 검증

**Files:**
- Modify only if a reproducible failure requires a tested fix.

**Interfaces:**
- Consumes: package scripts, linked Supabase project, Sites project, dedicated test accounts
- Produces: fresh verification evidence for local source and public deployment

- [ ] **Step 1: Run full tests, typecheck, lint, production dependency audit, secret scan, and Sites build**
- [ ] **Step 2: Apply the reviewed Supabase migration and verify the runtime contract**
- [ ] **Step 3: Publish the validated source to the existing public Sites project**
- [ ] **Step 4: Run remote health/smoke and browser checks at desktop and mobile widths**
- [ ] **Step 5: Run two-account hosted isolation verification when dedicated credentials are available and clean test data**
