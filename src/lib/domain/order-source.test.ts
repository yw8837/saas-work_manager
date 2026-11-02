import { describe, expect, it } from "vitest";

import { composeJob, type Job, type OrderSource, type PackageTemplate } from ".";
import {
  latestOrderSource,
  normalizeOrderSource,
  ORDER_SOURCE_LABELS,
  ORDER_SOURCES,
  orderSourceLabel,
  setJobSource,
} from "./order-source";

const template: PackageTemplate = {
  id: "pkg_source",
  name: "기본 패키지",
  price: 100_000,
  estimatedCost: 10_000,
  durationDays: 3,
  revisionLimit: 1,
  tasks: [{ taskKey: "brief", title: "의뢰서 확인", relativeDay: 0, order: 0 }],
};

function jobAt(id: string, createdAt: string, source?: OrderSource): Job {
  return composeJob({
    jobId: id,
    revisionPortalToken: `token_${id}`,
    clientLabel: "받은 곳 고객",
    startDate: "2026-11-01",
    package: template,
    now: createdAt,
    source,
  });
}

describe("받은 곳", () => {
  it("다섯 곳을 정한 순서와 이름으로 쓴다", () => {
    expect(ORDER_SOURCES).toEqual(["kmong", "soomgo", "referral", "direct", "other"]);
    expect(ORDER_SOURCE_LABELS).toEqual({ kmong: "크몽", soomgo: "숨고", referral: "소개", direct: "직접 문의", other: "기타" });
  });

  it("이상한 값은 받은 곳이 없는 것으로 본다", () => {
    expect(normalizeOrderSource("kmong")).toBe("kmong");
    for (const value of ["", "KMONG", "instagram", null, undefined, 3, {}]) {
      expect(normalizeOrderSource(value)).toBeUndefined();
    }
    expect(orderSourceLabel("direct")).toBe("직접 문의");
    expect(orderSourceLabel("instagram")).toBeUndefined();
    expect(orderSourceLabel(undefined)).toBeUndefined();
  });

  it("받은 곳을 바꾸면 수정 시각이 바뀌고, 없애면 칸 자체를 지운다", () => {
    const job = jobAt("job_a", "2026-11-01T00:00:00.000Z");
    expect("source" in job).toBe(false);

    const changed = setJobSource(job, "kmong", "2026-11-02T00:00:00.000Z");
    expect(changed.source).toBe("kmong");
    expect(changed.updatedAt).toBe("2026-11-02T00:00:00.000Z");

    const cleared = setJobSource(changed, undefined, "2026-11-03T00:00:00.000Z");
    expect("source" in cleared).toBe(false);
    expect(cleared.updatedAt).toBe("2026-11-03T00:00:00.000Z");

    // 같은 값이면 그대로 둔다(괜히 다시 저장하지 않게).
    expect(setJobSource(changed, "kmong", "2026-11-04T00:00:00.000Z")).toBe(changed);
    expect("source" in setJobSource(job, undefined)).toBe(false);
  });

  it("완료 시각이 없는 예전 완료 일감은 받은 곳을 바꾸기 전에 마지막 수정 시각을 완료 시각으로 굳힌다", () => {
    const legacy: Job = { ...jobAt("job_legacy", "2026-10-01T00:00:00.000Z"), status: "completed", updatedAt: "2026-10-15T03:00:00.000Z" };
    expect("completedAt" in legacy).toBe(false);

    const changed = setJobSource(legacy, "kmong", "2026-11-02T00:00:00.000Z");
    expect(changed.completedAt).toBe("2026-10-15T03:00:00.000Z");
    expect(changed.updatedAt).toBe("2026-11-02T00:00:00.000Z");

    // 완료 시각이 이미 있거나 진행 중인 일감은 완료 시각을 건드리지 않는다.
    const recorded: Job = { ...legacy, completedAt: "2026-10-10T00:00:00.000Z" };
    expect(setJobSource(recorded, "kmong", "2026-11-02T00:00:00.000Z").completedAt).toBe("2026-10-10T00:00:00.000Z");
    expect("completedAt" in setJobSource(jobAt("job_active", "2026-10-01T00:00:00.000Z"), "kmong", "2026-11-02T00:00:00.000Z")).toBe(false);
  });

  it("최근 받은 곳은 받은 곳 없는 일감을 건너뛰고 가장 늦게 만든 일감의 값을 준다", () => {
    expect(latestOrderSource([])).toBeUndefined();
    const jobs = [
      jobAt("job_old", "2026-10-01T00:00:00.000Z", "soomgo"),
      jobAt("job_newest_without_source", "2026-11-02T00:00:00.000Z"),
      jobAt("job_new", "2026-11-01T00:00:00.000Z", "kmong"),
    ];
    expect(latestOrderSource(jobs)).toBe("kmong");
    expect(latestOrderSource([jobAt("job_none", "2026-11-01T00:00:00.000Z")])).toBeUndefined();
  });
});
