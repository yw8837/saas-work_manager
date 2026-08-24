# 일감체크 베타 가격·설문·Sites 출시 준비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 베타 사용자가 30일 Pro 체험을 받고, 종료 뒤 파운더 Basic 월 9,900원/12개월 제안을 이해하며, 일반 공개 가격과 가격 설문을 일관되게 경험하게 한다. Sites 배포는 기존 Next 런타임과의 호환성을 검증한 뒤에만 진행한다.

**Architecture:** 권한의 내부 식별자는 `free | basic | pro`로 통일하고, 서버의 `plan_limits`와 클라이언트의 한도를 계약 테스트로 묶는다. 베타 코드는 계속 30일 Pro 권한만 부여하며, 파운더 9,900원은 결제 기능이 구현되기 전까지 문서화된 수동 운영 혜택으로만 고지한다. 설문은 Google Form URL prefill에 구조화된 선택지 외 개인정보나 작업 데이터를 넣지 않는다.

**Tech Stack:** Next.js 16, React, TypeScript, Vitest, Supabase SQL migrations, Google Forms URL prefill, Sites deployment connector.

**Spec:** `../../PRODUCT.md`, `../../README.md`, `../../../product/README.md`, `../../../validation/2026-08-13_beta_program.md`

## Global Constraints

- 사용자 공개 플랜은 Free(동시 2건), Basic(월 14,900원·동시 5건), Pro(월 24,900원·무제한)이다.
- 베타 초대 코드는 30일 Pro 체험만 부여한다. 결제·웹훅이 없는 상태에서 실제 과금을 표시하거나 처리하지 않는다.
- 베타 종료 뒤 파운더 혜택은 Basic 월 9,900원·12개월 유지이며, 포트원 결제 구현 전에는 운영자가 검증해 부여하는 정책이다.
- 정가·할인 표기는 실제 일반 판매 가격과 기간이 확정된 경우에만 사용한다. 현재는 “출시 후 월 14,900원 예정”으로 쓴다.
- 기존 사용자/DB가 있을 가능성을 고려해 `solo` 엔타이틀먼트는 SQL migration으로 `basic`으로 승격한다.
- 설문 URL에는 자유 서술, 이메일, 작업공간, 고객·일감 데이터를 넣지 않는다.
- 외부 계정·도메인·Supabase·PortOne 비밀값은 코드·Git·문서 예시에 기록하지 않는다.

---

### Task 1: 플랜 명칭·가격·서버 계약을 Basic으로 통일

**Files:**
- Modify: `src/lib/domain/entitlements.ts`
- Modify: `src/lib/domain/entitlements.test.ts`
- Modify: `src/lib/domain/plan-limits-contract.test.ts`
- Create: `supabase/migrations/202608230008_basic_plan.sql`
- Modify: `README.md`
- Modify: `PRODUCT.md`
- Modify: `docs/server-entitlement-plan.md`

**Interfaces:**
- Consumes: `Plan`, `PLAN_LIMITS`, `PLAN_PRICES`, `PLAN_NAMES` from `src/lib/domain/entitlements.ts`.
- Produces: `Plan = "free" | "basic" | "pro"`, `PLAN_PRICES.basic.monthlyWon === 14900`, server `plan_limits` rows with the same keys and values.

- [ ] **Step 1: Write the failing entitlement tests**

```ts
it("names the five-job paid tier Basic at 14,900 won", () => {
  expect(PLAN_NAMES.basic).toBe("Basic");
  expect(PLAN_PRICES.basic.monthlyWon).toBe(14_900);
  expect(PLAN_LIMITS.basic.activeJobs).toBe(5);
});

it("does not expose the retired solo plan", () => {
  expect("solo" in PLAN_LIMITS).toBe(false);
});
```

- [ ] **Step 2: Run the entitlement tests and verify RED**

Run: `npm test -- src/lib/domain/entitlements.test.ts`

Expected: FAIL because `basic` is absent and `solo` remains.

- [ ] **Step 3: Change the TypeScript entitlement contract minimally**

```ts
export type Plan = "free" | "basic" | "pro";

export const PLAN_PRICES: Record<Plan, PlanPrice> = {
  free: { monthlyWon: 0, label: "무료" },
  basic: { monthlyWon: 14_900, label: "₩14,900/월" },
  pro: { monthlyWon: 24_900, label: "₩24,900/월" },
};
```

Replace every internal `solo` branch with `basic`; retain the existing limits except for the key name.

- [ ] **Step 4: Run the entitlement tests and verify GREEN**

Run: `npm test -- src/lib/domain/entitlements.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing SQL contract assertion**

Extend `plan-limits-contract.test.ts` so it requires a 008 migration that inserts `basic`, migrates subscriptions from `solo`, and removes `solo` only after the subscription rows change.

- [ ] **Step 6: Run the SQL contract test and verify RED**

Run: `npm test -- src/lib/domain/plan-limits-contract.test.ts`

Expected: FAIL because migration 008 does not exist.

- [ ] **Step 7: Add the forward-only migration**

The migration must insert the `basic` five-job row before `subscriptions.plan` is updated, update existing `subscriptions.plan = 'solo'` to `basic`, then delete the `solo` plan-limit row. It must be idempotent and must not alter `beta_ends_at` or `current_period_end`.

- [ ] **Step 8: Run the SQL contract test and verify GREEN**

Run: `npm test -- src/lib/domain/plan-limits-contract.test.ts`

Expected: PASS.

- [ ] **Step 9: Update product-facing documentation**

State the three public prices, 30-day Pro beta code, and the post-beta founder Basic offer. Label PortOne payment/webhook as unimplemented; do not suggest that 9,900 won is automatically charged or enforceable yet.

- [ ] **Step 10: Run focused regression tests**

Run: `npm test -- src/lib/domain/entitlements.test.ts src/lib/domain/plan-limits-contract.test.ts src/components/workspace-provider-plan.test.tsx`

Expected: PASS.

### Task 2: 베타 가격 설문을 개인정보 보존 방식으로 확장

**Files:**
- Modify: `src/components/feedback-panel.tsx`
- Modify: `src/components/feedback-panel.test.tsx`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: current Google Form URL and per-question `NEXT_PUBLIC_FEEDBACK_ENTRY_*` IDs.
- Produces: optional `priceFit` and `founderIntent` values in `FeedbackAnswers`, only prefills whose matching env entry ID exists, and copies both answers in the plain-text handoff.

- [ ] **Step 1: Write failing feedback URL and text tests**

```tsx
const answers = {
  ...baseAnswers,
  priceFit: "14,900원",
  founderIntent: "네, 계속 사용하겠다",
};

expect(buildFeedbackFormUrl("https://forms.gle/example", {
  ...entryIds,
  price: "555",
  founder: "666",
}, answers)).toContain("entry.555=14%2C900%EC%9B%90");
expect(buildFeedbackPlainText(answers, "general")).toContain("가격 적정성: 14,900원");
```

- [ ] **Step 2: Run the feedback tests and verify RED**

Run: `npm test -- src/components/feedback-panel.test.tsx`

Expected: FAIL because the answer fields and entry IDs are missing.

- [ ] **Step 3: Implement the smallest survey extension**

Add two optional radio groups after usage duration:

1. “이 기능이라면 월 얼마가 가장 적절한가요?” with `무료만 사용 / 4,900원 이하 / 9,900원 / 14,900원 / 19,900원 이상 / 기능을 더 보고 결정`.
2. “베타 종료 뒤 Basic 월 9,900원을 12개월 유지할 수 있다면?” with `계속 사용 / 조금 더 써본 뒤 결정 / 사용하지 않음`.

Keep all choices optional. Add `NEXT_PUBLIC_FEEDBACK_ENTRY_PRICE` and `NEXT_PUBLIC_FEEDBACK_ENTRY_FOUNDER` to the form configuration and `.env.example` with empty values.

- [ ] **Step 4: Run the feedback tests and verify GREEN**

Run: `npm test -- src/components/feedback-panel.test.tsx`

Expected: PASS; tests must still prove free-text and email never enter the URL.

- [ ] **Step 5: Document form setup**

List the two new Google Form questions and their entry ID env names. State that an empty form URL leaves the app in copy-only mode and does not claim a submission happened.

### Task 3: UI와 카피의 출시 전 감사

**Files:**
- Modify only confirmed UI/copy files under `src/app`, `src/components`, and `src/styles`.
- Modify: `README.md` only if user-visible flow changes.

**Interfaces:**
- Consumes: current landing page, pricing cards, feedback panel, and the Korean product positioning.
- Produces: one clear first action, Basic/Pro distinction that never promises missing features, and copy that preserves factual limits and beta conditions.

- [ ] **Step 1: Install and load the user-selected design/copy review skills**

Install Impeccable, Taste Skill, unlazy, gstack, Chrome DevTools MCP, and the custom `storyscope-korean-editor` skill. Record that gstack and Chrome DevTools MCP are available but not automatically run; use Impeccable as primary, Taste only for a second opinion, StoryScope only on user-facing Korean copy.

- [ ] **Step 2: Capture the current landing, pricing, settings, and feedback routes**

Use the local preview; record only visible UX issues that block first-use comprehension, pricing comprehension, or mobile action reach.

- [ ] **Step 3: Apply only evidence-backed changes**

Examples of allowed changes: clarify the 30-day Pro code vs post-beta Basic offer, make the primary CTA unambiguous, correct hierarchy/spacing/touch-target regressions, and remove generic AI-sounding copy. Do not add promised Pro features, fake scarcity, dashboards, or analytics.

- [ ] **Step 4: Verify copy against the StoryScope editing checklist**

Ensure every claim about price, duration, feature availability, and beta condition has a source in the product policy. Mark unsupported stylistic judgments as unavailable rather than fabricating evidence.

- [ ] **Step 5: Run focused UI tests and an accessible browser walkthrough**

Run: `npm test -- src/components/feedback-panel.test.tsx src/components/workspace-provider-plan.test.tsx`

Walkthrough: landing → pricing/CTA → beta-code explanation → feedback price questions. Verify desktop and a narrow mobile viewport with keyboard-visible focus.

### Task 4: Sites 배포 호환성 및 외부 설정 준비

**Files:**
- Create or modify: `.openai/hosting.json` only after a Sites project is created.
- Modify: `docs/DEPLOYMENT.md`, `docs/final-delivery.md`, `README.md`.
- Create: `docs/SITES-DEPLOYMENT-RUNBOOK.md`.

**Interfaces:**
- Consumes: Next build output, Supabase hosted environment variables, Sites project ID, and a future canonical origin.
- Produces: a verified Sites-hostable artifact or an explicit compatibility blocker; a domain handoff checklist that updates Supabase Auth Site URL and `/auth/reset` allow-list after the custom domain is ready.

- [ ] **Step 1: Prove or reject direct Sites compatibility before creating a public Site**

Run the existing production build and inspect whether the project can generate the Cloudflare Worker-compatible ESM artifact Sites requires without changing auth/API behavior. Do not add `.openai/hosting.json`, create a Sites project, or publish until this check passes.

- [ ] **Step 2: If direct compatibility fails, isolate the smallest migration path**

Document the exact incompatibility and choose an adapter/migration only if it preserves Next routes, security headers, hosted Supabase calls, and server-only service-role boundaries. Do not replace the dynamic SaaS with a static landing page or silently move to Vercel.

- [ ] **Step 3: Create a Sites project and store only its opaque project ID**

After compatibility passes, create the site once, set a non-public preview access policy for founder testing, and add runtime variables through Sites secrets. Never commit runtime values or source write credentials.

- [ ] **Step 4: Build, save, and deploy the exact validated source**

Use a Git commit that contains the validated source. Deploy the saved Sites version and record the Sites URL as the temporary Supabase Auth Site URL only after the URL is live.

- [ ] **Step 5: Perform hosted smoke tests before external invites**

Verify sign-in/reset redirect, owner isolation, public revision link, security headers, and feedback form in the deployed environment. Do not send beta invites or collect payments until Supabase, SMTP, policy finalization, and manual operational evidence are completed.

- [ ] **Step 6: Prepare the custom-domain handoff**

When the user supplies a domain, attach it in Sites, use the returned DNS records, wait for HTTPS readiness, then change Supabase Auth Site URL and the sole `/auth/reset` redirect to the final canonical origin. Re-run remote smoke tests before opening beta.

### Task 5: Full regression and release evidence

**Files:**
- Modify: `docs/final-delivery.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the completed source, test results, Site URL, and externally verified status.
- Produces: a truthful release status that separates code-complete from `BLOCKED_EXTERNAL` operations.

- [ ] **Step 1: Run the complete release suite**

Run: `npm run check:release`

Expected: zero test, lint, typecheck, audit, build, and configured E2E failures.

- [ ] **Step 2: Run unlazy only after the product suite is green**

Treat its findings as a review queue; fix reproducible defects with a failing test first, then re-run the relevant test and full release suite.

- [ ] **Step 3: Update the handoff honestly**

Replace Vercel-only claims with the verified Sites path. Keep PortOne checkout/webhook, custom SMTP evidence, policy finalization, real Supabase project, and custom domain marked blocked until independently completed.

- [ ] **Step 4: Commit the verified source**

Run `git status --short` first. Stage only files attributable to this release; preserve the pre-existing generated `next-env.d.ts` change unless it is proven necessary and reviewed.

## Self-Review

- Pricing, plan limits, beta code duration, and founder offer each have an implementation task or explicit external boundary.
- Survey has structured entry IDs and retains the existing privacy rule for free text/email.
- The plan does not present PortOne, SMTP, Supabase, Sites, or custom-domain actions as completed without credentials and runtime evidence.
- Sites creation is gated on compatibility, preventing accidental public deployment of a different/static product.
