import { describe, expect, it } from "vitest";

import { composeJob, recordRevision, revertRevision, updateTaskStatus } from "./engine";
import { customerStageOf } from "./customer-stage";
import type { PackageTemplate } from "./types";

const template: PackageTemplate = {
  id: "pkg_stage",
  name: "단계 패키지",
  price: 100_000,
  estimatedCost: 0,
  durationDays: 4,
  revisionLimit: 2,
  tasks: [
    { taskKey: "a", title: "하나", relativeDay: 0, order: 0 },
    { taskKey: "b", title: "둘", relativeDay: 1, order: 1 },
    { taskKey: "c", title: "셋", relativeDay: 2, order: 2 },
    { taskKey: "d", title: "넷", relativeDay: 4, order: 3 },
  ],
};

function job() {
  return composeJob({ jobId: "job_stage", clientLabel: "고객", startDate: "2026-10-30", package: template, now: "2026-10-30T00:00:00.000Z" });
}

function finish(value: ReturnType<typeof job>, count: number) {
  return value.tasks.slice(0, count).reduce((current, task) => updateTaskStatus(current, task.id, "done", "2026-10-30T01:00:00.000Z"), value);
}

describe("고객 화면 진행 단계", () => {
  it("시작 직후는 작업 중, 절반을 끝내면 시안 확인", () => {
    expect(customerStageOf(job())).toBe(0);
    expect(customerStageOf(finish(job(), 1))).toBe(0);
    expect(customerStageOf(finish(job(), 2))).toBe(1);
  });

  it("되돌리지 않은 수정 요청이 있으면 수정, 되돌리면 다시 앞 단계", () => {
    const { job: revised } = recordRevision(job(), { source: "public", body: "수정", revisionId: "rev_1", submittedAt: "2026-10-30T02:00:00.000Z" });
    expect(customerStageOf(revised)).toBe(2);
    const reverted = revertRevision(revised, "rev_1", "중복", "2026-10-30T03:00:00.000Z");
    expect(customerStageOf(reverted)).toBe(0);
  });

  it("할 일을 모두 끝내거나 일감을 완료하면 납품", () => {
    expect(customerStageOf(finish(job(), 4))).toBe(3);
    expect(customerStageOf({ ...job(), status: "completed" })).toBe(3);
  });
});
