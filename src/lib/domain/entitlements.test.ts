import { describe, expect, it } from "vitest";
import {
  activeJobCount,
  BETA_GRANT_DAYS,
  betaExpiresAt,
  canActivateJob,
  canCreateJob,
  canCreateOption,
  canCreatePackage,
  jobLimitReached,
  PLAN_LIMITS,
  PLAN_PRICES,
  resolvePlanAccess,
  TRIAL_DAYS,
  trialExpiresAt,
  type Plan,
} from "./entitlements";
import type { Job, JobStatus, OptionTemplate, PackageTemplate } from "./types";

const DAY_MS = 86_400_000;
const NOW = "2026-08-20T00:00:00.000Z";

function daysFromNow(days: number): string {
  return new Date(Date.parse(NOW) + days * DAY_MS).toISOString();
}

function jobWith(status: JobStatus): Job {
  return { id: `job_${status}_${Math.random()}`, status } as unknown as Job;
}

function jobs(...statuses: JobStatus[]): Job[] {
  return statuses.map(jobWith);
}

function packages(count: number, archived = 0): PackageTemplate[] {
  return Array.from({ length: count + archived }, (_, index) => ({
    id: `pkg_${index}`,
    ...(index >= count ? { archivedAt: new Date().toISOString() } : {}),
  } as unknown as PackageTemplate));
}

function options(count: number, archived = 0): OptionTemplate[] {
  return Array.from({ length: count + archived }, (_, index) => ({
    id: `opt_${index}`,
    ...(index >= count ? { archivedAt: new Date().toISOString() } : {}),
  } as unknown as OptionTemplate));
}

describe("entitlements — active job counting", () => {
  it("counts only active jobs, ignoring completed and archived", () => {
    expect(activeJobCount(jobs("active", "active", "completed", "archived"))).toBe(2);
    expect(activeJobCount([])).toBe(0);
    expect(activeJobCount(jobs("completed", "archived"))).toBe(0);
  });
});

describe("entitlements — free plan concurrent boundary", () => {
  const plan: Plan = "free";

  it("allows creating a job up to the limit and blocks at 2 active jobs", () => {
    expect(canCreateJob(plan, jobs("active"), 1)).toBe(true); // 1 active -> 2nd allowed
    expect(canCreateJob(plan, jobs("active", "active"), 2)).toBe(false); // 2 active -> blocked
  });

  it("does not count completed or archived jobs toward the active limit", () => {
    const withHistory = jobs("active", "completed", "completed", "archived");
    expect(canCreateJob(plan, withHistory, 4)).toBe(true); // still only 1 active
  });

  it("blocks reopening a completed job once the active limit is full", () => {
    // 완료 → 새 일감 생성 → 다시 진행 순서로 한도를 넘기던 우회 경로를 막는다.
    expect(canActivateJob(plan, jobs("active", "active", "completed"))).toBe(false);
    expect(canActivateJob(plan, jobs("active", "completed"))).toBe(true);
  });

  it("never blocks reopening on the cumulative wall — reopening creates no new job", () => {
    // 누적 카운터는 재진행으로 늘지 않으므로 누적 한도로 막지 않는다.
    const atCumulativeWall = jobs("completed", "completed");
    expect(canCreateJob(plan, atCumulativeWall, PLAN_LIMITS.free.totalJobs)).toBe(false);
    expect(canActivateJob(plan, atCumulativeWall)).toBe(true);
  });

  it("blocks package creation at 5 packages", () => {
    // 기본 제공 패키지가 3개라 한도는 그보다 커야 첫 방문에 막히지 않는다.
    expect(canCreatePackage(plan, packages(3))).toBe(true);
    expect(canCreatePackage(plan, packages(4))).toBe(true);
    expect(canCreatePackage(plan, packages(5))).toBe(false);
  });

  it("ignores archived packages against the package limit", () => {
    expect(canCreatePackage(plan, packages(2, 5))).toBe(true); // 2 active, 5 archived
  });

  it("blocks option creation at 10 options", () => {
    expect(canCreateOption(plan, options(9))).toBe(true);
    expect(canCreateOption(plan, options(10))).toBe(false);
  });

  it("ignores archived options against the option limit", () => {
    expect(canCreateOption(plan, options(9, 8))).toBe(true);
  });
});

describe("entitlements — free plan cumulative wall", () => {
  const plan: Plan = "free";
  const wall = PLAN_LIMITS.free.totalJobs;

  it("allows the 10th job and blocks the 11th even with no active jobs", () => {
    expect(canCreateJob(plan, [], wall - 1)).toBe(true);
    expect(canCreateJob(plan, [], wall)).toBe(false);
  });

  it("stays blocked after every job is completed or deleted", () => {
    // 누적 벽은 일감 배열과 무관하게 서 있다.
    expect(canCreateJob(plan, jobs("completed", "completed"), wall)).toBe(false);
    expect(canCreateJob(plan, [], wall)).toBe(false);
  });

  it("reports which limit was hit so the UI can say the right thing", () => {
    expect(jobLimitReached(plan, [], 3)).toBeNull();
    expect(jobLimitReached(plan, jobs("active", "active"), 3)).toBe("activeJobs");
    expect(jobLimitReached(plan, [], wall)).toBe("totalJobs");
    // 둘 다 걸리면 되돌릴 수 없는 누적 벽을 먼저 알린다.
    expect(jobLimitReached(plan, jobs("active", "active"), wall)).toBe("totalJobs");
  });
});

describe("entitlements — Basic plan", () => {
  const plan: Plan = "basic";

  it("caps concurrent jobs at 5 but never on cumulative count", () => {
    expect(canCreateJob(plan, jobs("active", "active", "active", "active"), 500)).toBe(true);
    expect(canCreateJob(plan, jobs(...Array(5).fill("active" as JobStatus)), 0)).toBe(false);
    expect(jobLimitReached(plan, jobs(...Array(5).fill("active" as JobStatus)), 500)).toBe("activeJobs");
  });

  it("has unlimited packages, options, and cumulative jobs", () => {
    expect(PLAN_LIMITS.basic.totalJobs).toBe(Infinity);
    expect(canCreatePackage(plan, packages(50))).toBe(true);
    expect(canCreateOption(plan, options(50))).toBe(true);
  });
});

describe("entitlements — pro plan is unlimited", () => {
  const plan: Plan = "pro";

  it("never blocks jobs, packages, or options", () => {
    expect(canCreateJob(plan, jobs(...Array(50).fill("active" as JobStatus)), 5_000)).toBe(true);
    expect(canCreatePackage(plan, packages(50))).toBe(true);
    expect(canCreateOption(plan, options(50))).toBe(true);
  });

  it("exposes Infinity limits", () => {
    expect(PLAN_LIMITS.pro.activeJobs).toBe(Infinity);
    expect(PLAN_LIMITS.pro.totalJobs).toBe(Infinity);
    expect(PLAN_LIMITS.pro.packages).toBe(Infinity);
    expect(PLAN_LIMITS.pro.options).toBe(Infinity);
  });
});

describe("entitlements — display prices", () => {
  it("keeps the announced Basic and Pro prices in one place", () => {
    expect(PLAN_PRICES.free.monthlyWon).toBe(0);
    expect(PLAN_PRICES.basic.monthlyWon).toBe(14_900);
    expect(PLAN_PRICES.pro.monthlyWon).toBe(24_900);
    expect(PLAN_PRICES.basic.label).toBe("₩14,900/월");
    expect(PLAN_PRICES.pro.label).toBe("₩24,900/월");
  });
});

describe("entitlements — Basic plan", () => {
  it("uses Basic, not a solo-only label, for the five-job paid tier", () => {
    expect(PLAN_LIMITS.basic.activeJobs).toBe(5);
    expect("solo" in PLAN_LIMITS).toBe(false);
  });
});

describe("entitlements — effective plan resolution", () => {
  it("stays on the base plan with no trial and no beta code", () => {
    const access = resolvePlanAccess({ basePlan: "free", now: NOW });
    expect(access.plan).toBe("free");
    expect(access.source).toBe("base");
    expect(access.expiresAt).toBeNull();
    expect(access.remainingDays).toBe(0);
    expect(access.trialExpired).toBe(false);
    expect(access.betaExpired).toBe(false);
  });

  it("gives Pro for 7 days from the first job and reports remaining days", () => {
    const access = resolvePlanAccess({ trialStartedAt: daysFromNow(-2), now: NOW });
    expect(access.plan).toBe("pro");
    expect(access.source).toBe("trial");
    expect(access.remainingDays).toBe(TRIAL_DAYS - 2);
    expect(access.expiresAt).toBe(daysFromNow(TRIAL_DAYS - 2));
  });

  it("falls back to free once the trial expires", () => {
    const access = resolvePlanAccess({ trialStartedAt: daysFromNow(-TRIAL_DAYS - 1), now: NOW });
    expect(access.plan).toBe("free");
    expect(access.source).toBe("base");
    expect(access.trialExpired).toBe(true);
    expect(access.remainingDays).toBe(0);
  });

  it("treats the exact expiry instant as expired", () => {
    const access = resolvePlanAccess({ trialStartedAt: daysFromNow(-TRIAL_DAYS), now: NOW });
    expect(access.plan).toBe("free");
    expect(access.trialExpired).toBe(true);
  });

  it("gives Pro for 30 days from a beta code and falls back when it lapses", () => {
    const active = resolvePlanAccess({
      betaAccess: { code: "BETA2026", grantedAt: daysFromNow(-7), expiresAt: daysFromNow(BETA_GRANT_DAYS - 7) },
      now: NOW,
    });
    expect(active.plan).toBe("pro");
    expect(active.source).toBe("beta");
    expect(active.remainingDays).toBe(BETA_GRANT_DAYS - 7);

    const lapsed = resolvePlanAccess({
      betaAccess: { code: "BETA2026", grantedAt: daysFromNow(-40), expiresAt: daysFromNow(-10) },
      now: NOW,
    });
    expect(lapsed.plan).toBe("free");
    expect(lapsed.source).toBe("base");
    expect(lapsed.betaExpired).toBe(true);
  });

  it("takes whichever of trial and beta lasts longer when both exist", () => {
    const betaWins = resolvePlanAccess({
      trialStartedAt: daysFromNow(-6), // 1일 남음
      betaAccess: { code: "BETA2026", grantedAt: daysFromNow(-1), expiresAt: daysFromNow(29) },
      now: NOW,
    });
    expect(betaWins.source).toBe("beta");
    expect(betaWins.remainingDays).toBe(29);

    const trialWins = resolvePlanAccess({
      trialStartedAt: daysFromNow(-1), // 6일 남음
      betaAccess: { code: "BETA2026", grantedAt: daysFromNow(-29), expiresAt: daysFromNow(1) },
      now: NOW,
    });
    expect(trialWins.source).toBe("trial");
    expect(trialWins.remainingDays).toBe(TRIAL_DAYS - 1);
  });

  it("keeps Pro from a live beta code even after the trial expired", () => {
    const access = resolvePlanAccess({
      trialStartedAt: daysFromNow(-30),
      betaAccess: { code: "KMONG2026", grantedAt: daysFromNow(-2), expiresAt: daysFromNow(28) },
      now: NOW,
    });
    expect(access.plan).toBe("pro");
    expect(access.source).toBe("beta");
    expect(access.trialExpired).toBe(true);
  });

  it("ignores unparsable timestamps instead of granting access", () => {
    const access = resolvePlanAccess({
      trialStartedAt: "언젠가",
      betaAccess: { code: "BETA2026", grantedAt: "언젠가", expiresAt: "곧" },
      now: NOW,
    });
    expect(access.plan).toBe("free");
    expect(access.source).toBe("base");
    expect(access.trialExpired).toBe(false);
    expect(access.betaExpired).toBe(false);
  });

  it("computes grant windows from the start instant", () => {
    expect(trialExpiresAt(NOW)).toBe(daysFromNow(TRIAL_DAYS));
    expect(betaExpiresAt(NOW)).toBe(daysFromNow(BETA_GRANT_DAYS));
    expect(trialExpiresAt(null)).toBeNull();
  });
});
