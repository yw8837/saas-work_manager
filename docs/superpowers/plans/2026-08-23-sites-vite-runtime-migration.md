# Sites Vite Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing 일감체크 SaaS on a private Sites URL first, while keeping Supabase as the only user-data and authentication system, then allow a safe custom-domain cutover.

**Architecture:** Add a Vite Worker entry point alongside the existing Next source. A React Router application reuses the present UI and Supabase browser adapter through small `next/*` compatibility modules; a Sites Worker owns only the health and account-deletion API boundaries. The new output is `dist/server/index.js`, not a renamed OpenNext artifact.

**Tech Stack:** React 19, Vite 8, `@openai/sites-vite-plugin@0.2.0`, React Router, Supabase JS, TypeScript, Vitest, Sites.

**Spec:** `docs/superpowers/specs/2026-08-23-sites-runtime-migration-design.md`

## Global Constraints

- Supabase project is Seoul and is the only persistent user-data store; do not add D1 or R2.
- The current database is initialized with migrations through `202608230008`; applied migrations are append-only.
- `SUPABASE_SERVICE_ROLE_KEY` is Worker-only and must never be bundled or committed.
- Deploy a Sites owner-only URL first. Update Supabase Auth URLs only after that exact URL passes verification.
- Keep the existing Next development path during the migration; do not delete it until Sites verification is complete.
- Preserve the route contract `/`, `/today`, `/jobs`, `/jobs/new`, `/jobs/:id`, `/packages`, `/settings`, `/feedback`, `/auth/reset`, `/r/:token`, `/privacy`, `/terms`, `/api/health`, and `/api/account/delete`.

---

### Task 1: Establish a supported Sites/Vite build boundary

**Files:**
- Modify: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`
- Create: `vite.config.ts`, `src/sites/entry-client.tsx`, `src/sites/entry-server.tsx`, `src/sites/site-shell.tsx`, `src/sites/site-shell.test.tsx`

**Interfaces:**
- Produces: `npm run build:sites` that emits `dist/server/index.js`.
- Produces: `<SiteShell />`, the root that wraps all browser routes in `WorkspaceProvider`.

- [ ] **Step 1: Write a failing output contract test**

```ts
it("declares a Sites build that emits dist/server/index.js", () => {
  expect(readFileSync("package.json", "utf8")).toContain("build:sites");
  expect(readFileSync("vite.config.ts", "utf8")).toContain("sites()");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/sites/site-shell.test.tsx`

Expected: FAIL because the Vite entry and build script do not exist.

- [ ] **Step 3: Add the minimal supported runtime**

```ts
// vite.config.ts
export default defineConfig({ plugins: [react(), sites()] });

// src/sites/site-shell.tsx
export function SiteShell() {
  return <WorkspaceProvider><AppRoutes /></WorkspaceProvider>;
}
```

Add `vite@^8`, `@openai/sites-vite-plugin@0.2.0`, and `react-router-dom`; use a dedicated `build:sites` script. Keep `build` as the existing Next build until the Sites release gate passes.

- [ ] **Step 4: Run the contract test and build**

Run: `npm test -- src/sites/site-shell.test.tsx && npm run build:sites`

Expected: test passes and `dist/server/index.js` exists.

### Task 2: Preserve browser routes with a narrow Next compatibility layer

**Files:**
- Create: `src/sites/routes.tsx`, `src/sites/next-compat/link.tsx`, `src/sites/next-compat/navigation.ts`, `src/sites/routes.test.tsx`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: existing screen components and `<SiteShell />`.
- Produces: `AppRoutes` and aliases for `next/link` and `next/navigation` used by current components.

- [ ] **Step 1: Write failing route coverage tests**

```tsx
it.each(["/", "/today", "/jobs", "/jobs/new", "/jobs/job-1", "/packages", "/settings", "/feedback", "/auth/reset", "/r/token", "/privacy", "/terms"])(
  "renders the route %s", (path) => {
    render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
    expect(screen.getByRole("main")).toBeInTheDocument();
  },
);
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `npm test -- src/sites/routes.test.tsx`

Expected: FAIL because `AppRoutes` does not exist.

- [ ] **Step 3: Implement route and compatibility modules**

```tsx
// src/sites/next-compat/link.tsx
export default function Link({ href, ...props }: LinkProps) {
  return <RouterLink to={typeof href === "string" ? href : href.pathname ?? "/"} {...props} />;
}

// src/sites/next-compat/navigation.ts
export function usePathname() { return useLocation().pathname; }
export function useRouter() { const navigate = useNavigate(); return { push: navigate, replace: (to: string) => navigate(to, { replace: true }), back: () => navigate(-1), refresh: () => window.location.reload() }; }
```

Render existing components directly: `MarketingHome`, `TodayDashboard`, `JobsOverview`, `NewJobForm`, `JobDetail`, `PackageManager`, `SettingsPanel`, `FeedbackPanel`, `PasswordResetForm`, `PublicRevisionForm`, and `PolicyPage`. Put workspace routes inside `WorkspaceAuthGate` and `AppShell`.

- [ ] **Step 4: Verify all routes**

Run: `npm test -- src/sites/routes.test.tsx && npm run build:sites`

Expected: all routes compile with no `next/*` runtime import.

### Task 3: Move server-only API behavior into the Sites Worker

**Files:**
- Create: `src/sites/api/health.ts`, `src/sites/api/account-delete.ts`, `src/sites/api/health.test.ts`, `src/sites/api/account-delete.test.ts`
- Modify: `src/sites/entry-server.tsx`, `src/lib/supabase/server-admin.ts`, `src/lib/supabase/server-runtime-contract.ts`

**Interfaces:**
- Consumes: `Request`, Sites Worker environment, existing Supabase contract probes.
- Produces: `handleHealth(request, env)` and `handleAccountDelete(request, env)` returning `Response`.

- [ ] **Step 1: Write failing parity tests**

```ts
it("health fails closed when the Worker has no service-role key", async () => {
  const response = await handleHealth(new Request("https://site.test/api/health"), hostedEnvWithoutServiceKey);
  expect(response.status).toBe(503);
});

it("account deletion rejects a cross-origin request", async () => {
  const response = await handleAccountDelete(crossOriginDeleteRequest, hostedEnv);
  expect(response.status).toBe(403);
});
```

- [ ] **Step 2: Run API tests to verify they fail**

Run: `npm test -- src/sites/api/health.test.ts src/sites/api/account-delete.test.ts`

Expected: FAIL because Worker handlers do not exist.

- [ ] **Step 3: Implement Worker handlers without browser secrets**

Move the existing response logic from `src/app/api/health/route.ts` and `src/app/api/account/delete/route.ts` into pure handlers that accept explicit environment values. Route only `/api/health` and `/api/account/delete` in `entry-server.tsx`; pass all other requests to the Vite app. Retain request-size limits, same-origin enforcement, verified token ownership, recent password authentication, and `Cache-Control: no-store`.

- [ ] **Step 4: Verify API parity and secret boundary**

Run: `npm test -- src/sites/api/health.test.ts src/sites/api/account-delete.test.ts && npm run build:sites`

Expected: handlers preserve current rejection statuses and a `rg -n "SUPABASE_SERVICE_ROLE_KEY" dist` check returns no browser asset hit.

### Task 4: Make the deployment and future-domain configuration explicit

**Files:**
- Create: `.openai/hosting.json`, `scripts/sites-preflight.mjs`, `scripts/sites-preflight.test.mjs`
- Modify: `.env.example`, `.env.hosted.example`, `README.md`, `docs/SITES-DEPLOYMENT-RUNBOOK.md`, `GATES.md`, `package.json`

**Interfaces:**
- Produces: `npm run check:sites` and a hosted environment checklist.
- Consumes: Sites environment keys and exact deployed origin passed only at deployment time.

- [ ] **Step 1: Write a failing preflight test**

```js
it("requires a private Sites origin before Auth URLs can be changed", () => {
  expect(preflight({ origin: "", finalDomain: "" }).authUpdateAllowed).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- scripts/sites-preflight.test.mjs`

Expected: FAIL because no Sites preflight exists.

- [ ] **Step 3: Implement environment and preflight policy**

Use the public Supabase URL and anon key for browser build values. Mark `SUPABASE_SERVICE_ROLE_KEY` as a Sites secret only. Require a successful private Sites URL health check before generating the exact Supabase Auth Site URL and `/auth/reset` redirect update instruction. Keep the future custom-domain phase as a second explicit cutover, never as a build-time constant.

- [ ] **Step 4: Verify policy**

Run: `npm test -- scripts/sites-preflight.test.mjs && npm run check:sites`

Expected: empty origin blocks Auth mutation; a valid private origin permits only the exact reset redirect.

### Task 5: Create, configure, and privately deploy the Sites project

**Files:**
- Modify: `.openai/hosting.json`, `docs/SITES-DEPLOYMENT-RUNBOOK.md`, `GATES.md`

**Interfaces:**
- Consumes: validated `dist/`, Sites project ID, server-only and browser-safe environment variables.
- Produces: a private Sites deployment URL.

- [ ] **Step 1: Run release build and package validation**

Run: `npm run check:sites && bash C:/Users/최용우/.codex/plugins/cache/openai-bundled/sites/0.1.43/scripts/package-site.sh . <temporary-archive>`

Expected: archive contains `dist/server/index.js` and `dist/.openai/hosting.json`.

- [ ] **Step 2: Create one Sites project and store only its project ID**

Call the Sites `create_site` tool once, then write its returned opaque ID to `.openai/hosting.json`. Do not store tokens, URLs, Supabase keys, or DB credentials in that file.

- [ ] **Step 3: Set runtime environment variables and deploy privately**

Set public Supabase URL/anon values and private service-role value through Sites environment variables. Save the exact validated source version, deploy as owner-only, then poll until it succeeds.

- [ ] **Step 4: Verify private URL before changing Auth**

Run health, login, password reset, two-user RLS, public revision token, account deletion, and header checks against the exact Sites URL. Update Supabase Auth only after those checks pass.

### Task 6: Run beta on the Sites URL and perform the later custom-domain cutover

**Files:**
- Modify: `docs/SITES-DEPLOYMENT-RUNBOOK.md`, `GATES.md`, `docs/OPERATIONAL-EVIDENCE.md`

**Interfaces:**
- Consumes: private deployment URL, completed beta survey records, later user-provided domain.
- Produces: verified final-domain Auth configuration without data migration.

- [ ] **Step 1: Keep the private Sites URL as the beta origin**

Do not change the Supabase project, tables, Auth users, or customer revision tokens while collecting survey feedback. Record only beta evidence and survey outcomes.

- [ ] **Step 2: Stage the final domain only after the user provides it**

Add the domain to Sites, wait for DNS/HTTPS verification, and retain the private URL until the final-domain health endpoint responds successfully.

- [ ] **Step 3: Update Auth in a single controlled cutover**

Set Supabase Auth Site URL to the final HTTPS origin and allow only `${finalOrigin}/auth/reset`; preserve the prior private URL only for an explicitly chosen rollback window.

- [ ] **Step 4: Re-run external behavior checks and document the result**

Run the same health, login, reset, RLS, public revision, account deletion, and header checks on the final domain. Confirm the user-data counts and UUIDs remain in the same Supabase project before declaring cutover complete.

### Task 7: Build the 모두의 창업 application alongside the MVP evidence

**Files:**
- Create: `docs/applications/modoo-2026-evidence-ledger.md`, `docs/applications/modoo-2026-draft.md`
- Modify: `docs/SITES-DEPLOYMENT-RUNBOOK.md`

**Interfaces:**
- Consumes: verified MVP behavior, beta survey questions/results, anonymized usability observations, and the current 모두의 창업 application form.
- Produces: a Korean application draft, 30–60 second demo-video outline, and no-unverified-claim evidence ledger.

- [ ] **Step 1: Record only verifiable application facts**

Create a ledger with four columns: claim, evidence URL/file, verification date, and application section. Begin with the implemented package-to-task flow, public revision link with automatic count/log, manual urgent-request count, plan limits, and the Sites private-beta deployment status. Do not add user counts, conversion rates, saved-time claims, paid revenue, or AI capabilities until evidence exists.

- [ ] **Step 2: Write the application narrative from the product problem**

Use this factual framing as the starting point: `1인 사업자는 작업도 하고, 운영도 하고, 고객 응대도 합니다. 일감체크는 주문이 들어오는 순간부터 고객 수정 요청까지, 혼자 하던 운영 업무를 편하게 처리하도록 돕습니다.` Explain why Notion-style setup work is not sufficient, what the product automatically creates, and how beta feedback will validate the pricing and workflow assumptions. Do not claim that the product replaces a worker or guarantees revenue.

- [ ] **Step 3: Produce evidence-first media assets**

Capture up to 10 factual interface images and draft a 30–60 second Korean demo outline: order/package selection → generated work checklist/deadline → customer revision link → logged revision count → beta feedback. The video must use the current MVP and label planned features as planned.

- [ ] **Step 4: Run StoryScope copy review before submission**

Review each public narrative section against the supplied source text, purpose (`모두의 창업 일반/기술트랙 신청서`), and reader (`멘토기관 및 창업 심사자`). Preserve facts and numbers; quote evidence for every editorial judgment; mark any unsupported judgment as `확인 불가`. Replace only supported AI-like phrasing and keep the final five-line beginner summary in the review record.

- [ ] **Step 5: Complete the form only after its current fields are checked**

Compare `modoo-2026-draft.md` line by line with the live form’s current WHY/WHAT/HOW/READY or equivalent fields. Verify applicant eligibility, concurrent-support restrictions, selected mentor institution, final submission status, and the received application confirmation. The application date is separate from domain purchase and custom-domain cutover.
