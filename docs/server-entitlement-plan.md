# 서버측 한도 검증 설계

결제를 붙이기 전에 반드시 끝내야 하는 작업이다. 지금은 **한도가 전부 브라우저에만** 있어서,
개발자도구로 `jobsCreatedTotal`을 0으로 바꾸거나 `betaAccess.expiresAt`을 늘리면 그대로 통과한다.
hosted 모드에서도 마찬가지다 — 서버는 클라이언트가 준 JSON을 그대로 저장할 뿐이다.

돈을 받기 시작하면 이건 곧 매출 누수다.

## 지금 상태 (확인됨)

`supabase/migrations/202608150002_workspace_documents.sql`의 `validate_workspace_state`가 보는 것:

- `pg_column_size(p_state) > 5MB`
- `packages > 500`, `options > 1000`, `jobs > 1000`
- 일감 형식과 중복 id

즉 **크기와 형식만** 본다. `activeJobs: 2`나 `totalJobs: 10` 같은 플랜 한도는 DB에 개념 자체가 없다.

## 원칙

**엔타이틀먼트는 작업공간 JSON에서 읽지 않는다.** 사용자가 쓰는 문서를 권한의 근거로 삼으면
그 문서를 고칠 수 있는 사람이 자기 권한도 고칠 수 있다.
`docs/final-delivery.md`가 이미 같은 원칙을 적어뒀다 — "작업공간 JSON의 가격·상태는 결제·정산·구독 권한의 신뢰 원장이 아니다."

권한의 근거는 **service-role만 쓸 수 있는 별도 테이블**이다.

## 구조

```
결제 PG ──웹훅(서명검증)──> 서버 ──service_role──> subscriptions 테이블
                                                        │
                                                        │ auth.uid()로 조회
                                                        ▼
                          save_workspace_document ── 한도 검사 ── 저장 or 거부
```

### 1. 구독 테이블

```sql
create table public.subscriptions (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'solo', 'pro')),
  status text not null default 'active',
  -- 체험·베타도 여기서 관리한다. 클라이언트 상태를 믿지 않는다.
  trial_ends_at timestamptz,
  beta_ends_at timestamptz,
  current_period_end timestamptz,
  pg_customer_key text,
  pg_billing_key_ref text,          -- 빌링키 원문은 저장하지 않는다. 참조만.
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- 사용자는 자기 구독을 읽기만 한다. 쓰기는 service_role 전용.
create policy subscriptions_select_own on public.subscriptions
  for select using (owner_id = auth.uid());
revoke insert, update, delete on public.subscriptions from anon, authenticated;
```

**중요**: 브라우저는 이 테이블에 쓸 수 없다. 오직 서명 검증을 통과한 웹훅 처리기가 service_role로 쓴다.

### 2. 누적 카운터도 서버가 센다

클라이언트의 `jobsCreatedTotal`을 믿으면 안 된다. 서버가 직접 센다.

```sql
create table public.workspace_job_ledger (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_key text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, job_key)
);
```

일감을 만들 때마다 행이 하나 늘고, **삭제해도 지우지 않는다**. 누적 수 = `count(*)`.
이러면 클라이언트가 카운터를 조작해도 소용없고, 여러 기기 병합 문제도 사라진다
(지금 클라이언트에서 `local + remote - base`로 합산하는 로직이 필요 없어진다).

### 3. 저장 시 한도 검사

`save_workspace_document` 안에서, `validate_workspace_state` 직후:

```sql
declare
  v_plan text;
  v_active integer;
  v_total integer;
  v_now timestamptz := now();
begin
  select case
           when sub.plan <> 'free' and sub.current_period_end > v_now then sub.plan
           when sub.trial_ends_at > v_now or sub.beta_ends_at > v_now then 'pro'
           else 'free'
         end
    into v_plan
    from public.subscriptions as sub
   where sub.owner_id = v_owner;
  v_plan := coalesce(v_plan, 'free');

  if v_plan = 'free' then
    select count(*)::integer into v_active
      from jsonb_array_elements(p_state -> 'jobs') as job
     where job ->> 'status' = 'active';

    select count(*)::integer into v_total
      from public.workspace_job_ledger
     where owner_id = v_owner;

    if v_active > 2 then
      raise exception using errcode = '42501', message = 'plan_active_limit_exceeded';
    end if;
    if v_total > 10 then
      raise exception using errcode = '42501', message = 'plan_total_limit_exceeded';
    end if;
  elsif v_plan = 'solo' then
    -- solo는 동시 5건까지, 누적은 무제한
    ...
  end if;
end;
```

한도 값은 **DB와 `src/lib/domain/entitlements.ts`에 각각 존재**하게 된다.
두 곳이 어긋나면 사용자가 화면에서는 되는데 저장이 거부되는 최악의 경험이 나온다.
→ 한도를 담은 작은 마이그레이션 테이블(`plan_limits`)을 두고 DB가 그걸 읽게 하고,
빌드 시 `entitlements.ts`의 값과 일치하는지 검사하는 테스트를 둔다.

### 4. 초대 코드도 서버로

지금 코드는 JS 번들 안에 있어 누구나 읽을 수 있고, 만료 후 재사용은 클라이언트 이력으로만 막고 있다.

```sql
create table public.invite_codes (
  code text primary key,
  grant_days integer not null default 30,
  max_redemptions integer not null default 1,
  redeemed_count integer not null default 0,
  expires_at timestamptz
);

create table public.invite_redemptions (
  code text not null references public.invite_codes(code),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, owner_id)   -- 같은 사람이 같은 코드를 두 번 못 쓴다
);
```

코드 적용은 security-definer RPC로만. 성공하면 `subscriptions.beta_ends_at`을 갱신한다.

## 순서

1. **`subscriptions` + `workspace_job_ledger` 테이블과 한도 검사** ← PG 계약 전에도 할 수 있다
2. `invite_codes` 서버 이전
3. PG 웹훅 처리기 (PG 선택 후)
4. 클라이언트를 서버 값 우선으로 전환 — 클라이언트 한도는 "미리 알려주는 UX"로만 남기고,
   진짜 차단은 서버가 한다

## 남는 한계 (정직하게)

- **local 모드는 서버가 없어서 검증할 수 없다.** 브라우저에만 저장하는 모드는 구조상 우회가 가능하다.
  → 유료 플랜은 hosted(로그인) 모드에서만 제공하고, local은 무료 체험 경계로 유지하는 게 맞다.
- 서버 검증을 붙여도 **사용자가 자기 데이터를 조작하는 것 자체**는 막을 수 없다.
  막는 것은 "조작해서 유료 기능을 공짜로 쓰는 것"이다.
