import { describe, expect, it } from "vitest";
import { composeJob, type Job, type PackageTemplate } from "@/lib/domain";
import { monthlySummary } from "./monthly";
import { thisMonthMoney } from "./this-month-money";

const TZ = "Asia/Seoul";
const basicPackage: PackageTemplate = {
  id: "pkg_basic",
  name: "Basic 홈페이지",
  price: 790_000,
  estimatedCost: 95_000,
  durationDays: 7,
  revisionLimit: 1,
  tasks: [{ taskKey: "brief", title: "의뢰서 확인", relativeDay: 0, order: 0 }],
};

function makeJob(id: string, overrides: Partial<Job> = {}): Job {
  const job = composeJob({ jobId: id, clientLabel: `고객 ${id}`, startDate: "2026-11-01", package: basicPackage, now: "2026-11-01T00:00:00.000Z" });
  return { ...job, ...overrides };
}

function completed(id: string, completedAt: string, overrides: Partial<Job> = {}): Job {
  return { ...makeJob(id, { status: "completed", updatedAt: completedAt, ...overrides }), completedAt };
}

describe("오늘 화면 '이번 달 돈' 카드 숫자", () => {
  it("작업 중 = 월별 정리의 진행 중 합계, 완료 = 그달 완료 합계, 받을 돈 = 둘을 더한 값(수수료 없으면 그대로)", () => {
    const jobs = [
      makeJob("a1", { amount: 1_580_000 }),
      makeJob("a2", { amount: 200_000 }),
      completed("c1", "2026-11-02T01:00:00Z", { amount: 790_000 }),
      // 다른 달 완료·보관한 일감은 넣지 않는다(월별 정리와 같은 규칙).
      completed("oct", "2026-10-15T01:00:00Z", { amount: 9_000_000 }),
      completed("archived", "2026-11-05T01:00:00Z", { status: "archived", amount: 7_000_000 }),
    ];
    const summary = monthlySummary(jobs, "2026-11", TZ);
    const money = thisMonthMoney(jobs, "2026-11", TZ);
    expect(money.inProgress).toEqual({ amount: summary.inProgress.amount, count: 2 });
    expect(money.completed).toEqual({ amount: summary.totals.amount, count: 1 });
    expect(money.fee).toBe(0);
    expect(money.total).toBe(1_580_000 + 200_000 + 790_000);
  });

  it("수수료가 있으면 받을 돈은 수수료 빼고(진행 중은 일감마다 jobFee, 완료는 월별 정리의 수수료)", () => {
    const jobs = [
      makeJob("a1", { amount: 1_000_000, feeRate: 20 }),
      makeJob("a2", { amount: 500_000 }),
      completed("c1", "2026-11-02T01:00:00Z", { amount: 1_410_000, feeRate: 20 }),
    ];
    const money = thisMonthMoney(jobs, "2026-11", TZ);
    expect(money.inProgress.amount).toBe(1_500_000);
    expect(money.completed.amount).toBe(1_410_000);
    // 진행 중 200,000 + 완료 282,000(월별 정리 수수료와 같음)
    expect(money.fee).toBe(200_000 + monthlySummary(jobs, "2026-11", TZ).totals.fee);
    expect(money.fee).toBe(482_000);
    expect(money.total).toBe(1_500_000 + 1_410_000 - 482_000);
  });

  it("일감이 없으면 모두 0", () => {
    expect(thisMonthMoney([], "2026-11", TZ)).toEqual({
      total: 0, inProgress: { amount: 0, count: 0 }, completed: { amount: 0, count: 0 }, fee: 0,
    });
  });
});
