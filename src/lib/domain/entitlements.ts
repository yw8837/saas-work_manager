import type { Job, OptionTemplate, PackageTemplate } from "./types";

export type Plan = "free" | "solo" | "pro";

export interface PlanLimits {
  /** 동시에 진행(active) 중일 수 있는 일감 수. 완료하면 다시 자리가 난다. */
  activeJobs: number;
  /** 지금까지 만든 일감 누적 수. 완료·삭제·초기화로 절대 줄지 않는다. */
  totalJobs: number;
  packages: number;
  options: number;
}

/**
 * 3단계 플랜.
 * 무료는 "동시 2건"과 "누적 10건"을 함께 본다. 동시 한도는 완료하면 풀리지만
 * 누적 한도는 되돌아오지 않는 벽이라, 어느 쪽에 걸렸는지 화면에서 구분해 알려준다.
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  // 패키지 한도는 기본 제공 패키지 3개보다 커야 첫 방문에 바로 막히지 않는다.
  free: { activeJobs: 2, totalJobs: 10, packages: 5, options: 10 },
  solo: { activeJobs: 5, totalJobs: Infinity, packages: Infinity, options: Infinity },
  pro: { activeJobs: Infinity, totalJobs: Infinity, packages: Infinity, options: Infinity },
};

export interface PlanPrice {
  monthlyWon: number;
  /** 화면에 그대로 쓰는 표기 */
  label: string;
}

/**
 * 표시 전용 가격. 아직 결제 연동이 없어 어떤 금액도 실제로 청구되지 않는다.
 * 화면에서 금액을 직접 적지 말고 항상 여기를 참조한다.
 */
export const PLAN_PRICES: Record<Plan, PlanPrice> = {
  free: { monthlyWon: 0, label: "무료" },
  solo: { monthlyWon: 9_900, label: "₩9,900/월" },
  pro: { monthlyWon: 24_900, label: "₩24,900/월" },
};

export const PLAN_NAMES: Record<Plan, string> = {
  free: "무료",
  solo: "Solo",
  pro: "Pro",
};

/** 진행 중(active)인 의뢰 수. 완료·보관은 한도에 포함하지 않는다. */
export function activeJobCount(jobs: Job[]): number {
  return jobs.reduce((count, job) => (job.status === "active" ? count + 1 : count), 0);
}

/** 보관하지 않은 패키지 수. 한도 판단의 기준이 된다. */
export function activePackageCount(packages: PackageTemplate[]): number {
  return packages.reduce((count, item) => (item.archivedAt ? count : count + 1), 0);
}

/** 보관하지 않은 옵션 수. 한도 판단의 기준이 된다. */
export function activeOptionCount(options: OptionTemplate[]): number {
  return options.reduce((count, item) => (item.archivedAt ? count : count + 1), 0);
}

/** 어떤 한도에 걸렸는지. 문구가 달라야 해서 boolean 대신 종류를 돌려준다. */
export type JobLimitKind = "activeJobs" | "totalJobs";

/**
 * 새 일감을 막는 한도를 돌려준다. 걸린 곳이 없으면 null.
 * 누적 한도를 먼저 본다 — 완료해도 풀리지 않는 벽이라 안내가 달라야 한다.
 */
export function jobLimitReached(
  plan: Plan,
  jobs: Job[],
  jobsCreatedTotal: number,
): JobLimitKind | null {
  const limits = PLAN_LIMITS[plan];
  if (Math.max(jobsCreatedTotal, 0) >= limits.totalJobs) return "totalJobs";
  if (activeJobCount(jobs) >= limits.activeJobs) return "activeJobs";
  return null;
}

/** 새 일감을 만들 수 있는지. 동시 한도와 누적 한도 중 하나라도 차면 막는다. */
export function canCreateJob(plan: Plan, jobs: Job[], jobsCreatedTotal: number): boolean {
  return jobLimitReached(plan, jobs, jobsCreatedTotal) === null;
}

/**
 * 완료 → 재진행처럼 새 일감을 만들지 않는 활성화는 동시 진행 한도만 본다.
 * 누적 수는 늘지 않으므로 누적 한도로 막지 않는다.
 */
export function canActivateJob(plan: Plan, jobs: Job[]): boolean {
  return activeJobCount(jobs) < PLAN_LIMITS[plan].activeJobs;
}

export function canCreatePackage(plan: Plan, packages: PackageTemplate[]): boolean {
  return activePackageCount(packages) < PLAN_LIMITS[plan].packages;
}

export function canCreateOption(plan: Plan, options: OptionTemplate[]): boolean {
  return activeOptionCount(options) < PLAN_LIMITS[plan].options;
}

const DAY_MS = 86_400_000;

/** 첫 일감을 만든 순간 시작되는 무제한 체험 기간(일). */
export const TRIAL_DAYS = 7;
/** 베타 초대 코드가 열어주는 Pro 기간(일). */
export const BETA_GRANT_DAYS = 30;

/** 베타 초대 코드로 받은 Pro 권한. 클라이언트 저장분이라 위조 가능하다. */
export interface BetaAccess {
  code: string;
  grantedAt: string;
  expiresAt: string;
}

export type PlanSource = "base" | "trial" | "beta";

export interface PlanAccess {
  /** 실제로 적용되는 플랜 */
  plan: Plan;
  /** 승급이 없을 때의 플랜 */
  basePlan: Plan;
  source: PlanSource;
  /** 승급이 끝나는 시각. 승급이 없으면 null. */
  expiresAt: string | null;
  /** 남은 일수(올림). 승급이 없으면 0. */
  remainingDays: number;
  /** 체험을 쓴 적이 있고 이미 끝났는지 */
  trialExpired: boolean;
  /** 베타 코드를 넣은 적이 있고 이미 끝났는지 */
  betaExpired: boolean;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** 체험 시작 시각에서 7일 뒤. 값이 이상하면 null. */
export function trialExpiresAt(trialStartedAt: string | null): string | null {
  const started = parseTime(trialStartedAt);
  if (started === null) return null;
  return new Date(started + TRIAL_DAYS * DAY_MS).toISOString();
}

/** 베타 코드를 넣은 시각에서 30일 뒤. */
export function betaExpiresAt(grantedAt: string): string {
  const granted = parseTime(grantedAt) ?? Date.now();
  return new Date(granted + BETA_GRANT_DAYS * DAY_MS).toISOString();
}

/**
 * 지금 적용되는 플랜을 계산한다.
 * 체험과 베타 코드는 함께 가질 수 있고, 더 늦게 끝나는 쪽을 따른다.
 * 둘 다 끝났으면 기본 플랜(무료)으로 조용히 되돌아간다.
 */
export function resolvePlanAccess({
  basePlan = "free",
  trialStartedAt = null,
  betaAccess = null,
  now = new Date().toISOString(),
}: {
  basePlan?: Plan;
  trialStartedAt?: string | null;
  betaAccess?: BetaAccess | null;
  now?: string;
}): PlanAccess {
  const nowTime = parseTime(now) ?? Date.now();
  const trialEnd = parseTime(trialExpiresAt(trialStartedAt));
  const betaEnd = parseTime(betaAccess?.expiresAt);

  const grants: Array<{ source: PlanSource; end: number }> = [];
  if (trialEnd !== null && trialEnd > nowTime) grants.push({ source: "trial", end: trialEnd });
  if (betaEnd !== null && betaEnd > nowTime) grants.push({ source: "beta", end: betaEnd });
  grants.sort((left, right) => right.end - left.end);
  const best = grants[0];

  return {
    plan: best ? "pro" : basePlan,
    basePlan,
    source: best?.source ?? "base",
    expiresAt: best ? new Date(best.end).toISOString() : null,
    remainingDays: best ? Math.max(Math.ceil((best.end - nowTime) / DAY_MS), 0) : 0,
    trialExpired: trialEnd !== null && trialEnd <= nowTime,
    betaExpired: betaEnd !== null && betaEnd <= nowTime,
  };
}
