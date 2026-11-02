import { describe, expect, it } from "vitest";
import { composeJob, type Job, type OrderSource, type PackageTemplate } from "@/lib/domain";
import {
  monthKeyOf,
  monthlySummary,
  shiftMonth,
  summaryCsv,
  summaryCsvFileName,
} from "./monthly";

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

type JobOverrides = Partial<Job> & { source?: OrderSource };

function makeJob(id: string, overrides: JobOverrides = {}): Job {
  const job = composeJob({
    jobId: id,
    clientLabel: overrides.clientLabel ?? `고객 ${id}`,
    startDate: "2026-11-01",
    package: basicPackage,
    now: "2026-11-01T00:00:00.000Z",
  });
  return { ...job, ...overrides };
}

function completed(id: string, completedAt: string | undefined, overrides: JobOverrides = {}): Job {
  const job = makeJob(id, { status: "completed", updatedAt: completedAt ?? "2026-11-01T00:00:00.000Z", ...overrides });
  if (completedAt) job.completedAt = completedAt;
  return job;
}

describe("월별 정리", () => {
  it("달 경계는 넘겨받은 시간대로 나눈다", () => {
    // 서울 11/30 23:30 → 11월, 서울 12/1 00:10 → 12월. 시스템 시간대(CI는 UTC)에 기대지 않는다.
    expect(monthKeyOf("2026-11-30T14:30:00Z", TZ)).toBe("2026-11");
    expect(monthKeyOf("2026-11-30T15:10:00Z", TZ)).toBe("2026-12");
    expect(monthKeyOf("2026-11-30T15:10:00Z", "UTC")).toBe("2026-11");

    const late = completed("late", "2026-11-30T14:30:00Z");
    const early = completed("early", "2026-11-30T15:10:00Z");
    expect(monthlySummary([late, early], "2026-11", TZ).rows.map((row) => row.job.id)).toEqual(["late"]);
    expect(monthlySummary([late, early], "2026-12", TZ).rows.map((row) => row.job.id)).toEqual(["early"]);
  });

  it("예전 완료 일감은 마지막 수정 시각으로 넣고 추정 표시", () => {
    const legacy = completed("legacy", undefined, { updatedAt: "2026-11-12T03:00:00.000Z" });
    expect("completedAt" in legacy).toBe(false);
    // 10월에 완료하고 11월에 받은 곳만 고친 일감은 완료 시각(10월)으로 들어간다.
    const editedLater = completed("edited", "2026-10-31T05:00:00.000Z", { updatedAt: "2026-11-03T00:00:00.000Z" });

    const november = monthlySummary([legacy, editedLater], "2026-11", TZ);
    expect(november.rows).toEqual([
      { job: legacy, completedAt: "2026-11-12T03:00:00.000Z", completedAtEstimated: true },
    ]);
    const october = monthlySummary([legacy, editedLater], "2026-10", TZ);
    expect(october.rows).toEqual([
      { job: editedLater, completedAt: "2026-10-31T05:00:00.000Z", completedAtEstimated: false },
    ]);
  });

  it("받은 곳별 합계와 진행 중 합계를 따로 낸다", () => {
    const jobs = [
      completed("k1", "2026-11-02T01:00:00Z", { source: "kmong", amount: 790_000, estimatedCost: 95_000 }),
      completed("k2", "2026-11-20T01:00:00Z", { source: "kmong", amount: 1_290_000, estimatedCost: 180_000 }),
      completed("r1", "2026-11-10T01:00:00Z", { source: "referral", amount: 500_000, estimatedCost: 50_000 }),
      completed("n1", "2026-11-15T01:00:00Z", { amount: 300_000, estimatedCost: 0 }),
      // 다른 달 완료·보관한 일감은 이달 합계에 넣지 않는다.
      completed("oct", "2026-10-15T01:00:00Z", { source: "kmong", amount: 9_000_000 }),
      completed("archived", "2026-11-05T01:00:00Z", { status: "archived", amount: 7_000_000 }),
      // 진행 중 일감은 따로 한 줄(합계에 안 넣음).
      makeJob("a1", { status: "active", source: "soomgo", amount: 1_580_000 }),
      makeJob("a2", { status: "active", amount: 200_000 }),
    ];

    const summary = monthlySummary(jobs, "2026-11", TZ);

    expect(summary.month).toBe("2026-11");
    expect(summary.totals).toEqual({ amount: 2_880_000, estimatedCost: 325_000, margin: 2_555_000, count: 4 });
    expect(summary.bySource).toEqual([
      { source: "kmong", label: "크몽", amount: 2_080_000, count: 2 },
      { source: "referral", label: "소개", amount: 500_000, count: 1 },
      { source: "none", label: "받은 곳 없음", amount: 300_000, count: 1 },
    ]);
    expect(summary.inProgress).toEqual({ amount: 1_780_000, count: 2 });
    // 목록은 늦게 완료한 것부터.
    expect(summary.rows.map((row) => row.job.id)).toEqual(["k2", "n1", "r1", "k1"]);
  });

  it("완료한 일감이 없는 달은 0으로 비어 있다", () => {
    const summary = monthlySummary([makeJob("a1", { status: "active" })], "2026-11", TZ);
    expect(summary.totals).toEqual({ amount: 0, estimatedCost: 0, margin: 0, count: 0 });
    expect(summary.bySource).toEqual([]);
    expect(summary.rows).toEqual([]);
    expect(summary.inProgress.count).toBe(1);
  });

  it("CSV는 따옴표로 감싸고 수식 시작 문자를 무력화한다", () => {
    const jobs = [
      completed("formula", "2026-11-03T01:00:00Z", {
        clientLabel: "=SUM(A1)", title: "=SUM(A1) · Basic 홈페이지", source: "kmong",
        amount: 790_000, estimatedCost: 95_000, startDate: "2026-10-27", dueDate: "2026-11-03",
        revisionPortalToken: "secret-portal-token",
        revisions: [{
          id: "rev_1", jobId: "formula", source: "public", body: "비밀 수정 요청 내용", status: "new",
          usage: "pending", sequence: null, submittedAt: "2026-11-02T00:00:00Z",
        }],
      }),
      completed("quote", "2026-11-05T01:00:00Z", {
        clientLabel: "카페 \"모라\", 2호점", title: "메뉴판\n리뉴얼", amount: 300_000, estimatedCost: 310_000,
      }),
      completed("signs", "2026-11-07T01:00:00Z", { clientLabel: "+82 고객", title: "-할인 @이벤트" }),
      completed("at", "2026-11-08T01:00:00Z", { clientLabel: "@모라" }),
    ];

    const csv = summaryCsv(jobs, { kind: "month", month: "2026-11" }, TZ);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // 무슨 금액인지 열 이름에 밝힌다(주문 금액·예상 원가·남는 돈(예상)).
    expect(csv.slice(1).startsWith("완료일,고객,일감,받은 곳,패키지,주문 금액,예상 원가,남는 돈(예상),시작일,마감일\r\n")).toBe(true);
    // 줄바꿈은 CRLF. 따옴표 밖에 맨 LF가 없다(글 칸 안 줄바꿈은 따옴표 안에 남는다).
    const outsideQuotes = csv.replace(/"(?:[^"]|"")*"/g, "");
    expect(outsideQuotes).toContain("\r\n");
    expect(/(^|[^\r])\n/.test(outsideQuotes)).toBe(false);
    expect(csv.endsWith("\r\n")).toBe(true);

    expect(csv).toContain("\"'=SUM(A1)\"");
    expect(csv).toContain("\"카페 \"\"모라\"\", 2호점\"");
    expect(csv).toContain("\"메뉴판\n리뉴얼\"");
    expect(csv).toContain("\"'+82 고객\"");
    expect(csv).toContain("\"'-할인 @이벤트\"");
    expect(csv).toContain("\"'@모라\"");
    // 숫자 칸은 따옴표 없이 숫자로 둔다. 손해(음수)도 수식이 아니라 숫자다.
    expect(csv).toContain(",300000,310000,-10000,");

    const lines = csv.slice(1).split("\r\n");
    expect(lines[1]).toBe(
      "\"2026-11-03\",\"'=SUM(A1)\",\"Basic 홈페이지\",\"크몽\",\"Basic 홈페이지\",790000,95000,695000,\"2026-10-27\",\"2026-11-03\"",
    );
    // 링크 토큰·수정 요청 내용은 넣지 않는다.
    expect(csv).not.toContain("secret-portal-token");
    expect(csv).not.toContain("비밀 수정 요청 내용");
  });

  it("CSV는 그달 또는 그해 완료 일감만 완료일 순으로 담고 완료일은 넘겨받은 시간대로 적는다", () => {
    const jobs = [
      completed("nov", "2026-11-30T15:10:00Z"),
      completed("oct", "2026-10-02T01:00:00Z"),
      completed("last-year", "2025-12-31T14:59:00Z"),
      completed("new-year", "2025-12-31T15:00:00Z"),
      makeJob("active", { status: "active" }),
    ];
    const rowsOf = (csv: string) => csv.slice(1).split("\r\n").slice(1, -1).map((line) => line.split(",")[0]);

    expect(rowsOf(summaryCsv(jobs, { kind: "year", year: "2026" }, TZ))).toEqual([
      "\"2026-01-01\"", "\"2026-10-02\"", "\"2026-12-01\"",
    ]);
    expect(rowsOf(summaryCsv(jobs, { kind: "month", month: "2025-12" }, TZ))).toEqual(["\"2025-12-31\""]);
    expect(rowsOf(summaryCsv(jobs, { kind: "month", month: "2026-09" }, TZ))).toEqual([]);
  });

  it("파일 이름과 달 옮기기", () => {
    expect(summaryCsvFileName({ kind: "month", month: "2026-11" })).toBe("ilgamcheck-매출-2026-11.csv");
    expect(summaryCsvFileName({ kind: "year", year: "2026" })).toBe("ilgamcheck-매출-2026.csv");
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
