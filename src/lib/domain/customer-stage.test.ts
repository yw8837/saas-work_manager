import { describe, expect, it } from "vitest";

import { completeRevision, composeJob, markRevisionExtraScope, recordRevision, revertRevision, toggleIntakeItem, updateTaskStatus } from "./engine";
import {
  CUSTOMER_STAGE_LABELS,
  customerCompletedLabel,
  customerDueLabel,
  customerProgressOf,
  customerRequestsOf,
  customerStageFromProgress,
  customerStageOf,
} from "./customer-stage";
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

// 단계 번호: 0 자료 받는 중, 1 작업 중, 2 시안 확인, 3 수정, 4 납품
function withIntake(value: ReturnType<typeof job>) {
  return {
    ...value,
    intakeItems: [
      { id: "i1", label: "로고 원본" },
      { id: "i2", label: "소개 글" },
    ],
  };
}

describe("고객 화면 진행 단계", () => {
  it("단계 이름은 자료 받는 중부터 납품까지 다섯 개", () => {
    expect(CUSTOMER_STAGE_LABELS).toEqual(["자료 받는 중", "작업 중", "시안 확인", "수정", "납품"]);
  });

  it("시작 직후는 작업 중, 절반을 끝내면 시안 확인", () => {
    expect(customerStageOf(job())).toBe(1);
    expect(customerStageOf(finish(job(), 1))).toBe(1);
    expect(customerStageOf(finish(job(), 2))).toBe(2);
  });

  it("되돌리지 않은 수정 요청이 있으면 수정, 되돌리면 다시 앞 단계", () => {
    const { job: revised } = recordRevision(job(), { source: "public", body: "수정", revisionId: "rev_1", submittedAt: "2026-10-30T02:00:00.000Z" });
    expect(customerStageOf(revised)).toBe(3);
    const reverted = revertRevision(revised, "rev_1", "중복", "2026-10-30T03:00:00.000Z");
    expect(customerStageOf(reverted)).toBe(1);
  });

  // 운영 점검: 할 일 0/7, 자료도 안 왔는데 고객 요청 하나로 '수정 · 지금'이 떴다.
  it("받을 자료가 남았으면 수정 요청이 있어도 자료 받는 중, 다 받으면 원래 규칙", () => {
    const { job: revised } = recordRevision(withIntake(job()), { source: "public", body: "수정", revisionId: "rev_1", submittedAt: "2026-10-30T02:00:00.000Z" });
    expect(customerStageOf(withIntake(job()))).toBe(0);
    expect(customerStageOf(revised)).toBe(0);
    const received = toggleIntakeItem(toggleIntakeItem(revised, "i1", "2026-10-30T04:00:00.000Z"), "i2", "2026-10-30T04:00:00.000Z");
    expect(customerStageOf(received)).toBe(3);
  });

  it("할 일을 모두 끝내거나 일감을 완료하면 받을 자료가 남아도 납품", () => {
    expect(customerStageOf(finish(job(), 4))).toBe(4);
    expect(customerStageOf({ ...job(), status: "completed" })).toBe(4);
    expect(customerStageOf({ ...withIntake(job()), status: "completed" })).toBe(4);
  });

  it("서버가 내려 준 개수로 계산해도 같은 단계", () => {
    for (const value of [job(), finish(job(), 2), finish(job(), 4), withIntake(job())]) {
      expect(customerStageFromProgress(customerProgressOf(value))).toBe(customerStageOf(value));
    }
    expect(customerStageFromProgress({ total: 0, done: 0, hasOpenRevision: false })).toBe(1);
    expect(customerStageFromProgress({ total: 4, done: 1, hasOpenRevision: true })).toBe(3);
    expect(customerStageFromProgress({ total: 7, done: 0, hasOpenRevision: true, intakePending: 3 })).toBe(0);
  });
});

describe("고객이 남긴 요청 목록", () => {
  it("고객 링크로 남긴 요청만, 최근 것부터, 상태(접수·반영 회차·추가 작업·반려)와 원문만 돌려준다", () => {
    let value = job();
    for (const [id, minute] of [["r1", "01"], ["r2", "02"], ["r3", "03"], ["r4", "04"]] as const) {
      value = recordRevision(value, { source: "public", body: `요청 ${id}`, clientLabel: "김담당", revisionId: id, submittedAt: `2026-10-30T02:${minute}:00.000Z` }).job;
    }
    value = recordRevision(value, { source: "manual", channel: "kakao", body: "작업자가 옮겨 적은 메모", revisionId: "m1", submittedAt: "2026-10-30T02:05:00.000Z" }).job;
    value = completeRevision(value, "r1", "2026-10-30T03:00:00.000Z");
    value = markRevisionExtraScope(value, "r2", "2026-10-30T03:01:00.000Z");
    value = revertRevision(value, "r3", "질문이라 대화창으로 답함", "2026-10-30T03:02:00.000Z");

    const requests = customerRequestsOf(value);
    expect(requests).toEqual([
      { status: "pending", submittedAt: "2026-10-30T02:04:00.000Z", body: "요청 r4" },
      { status: "rejected", submittedAt: "2026-10-30T02:03:00.000Z", body: "요청 r3" },
      { status: "extra", submittedAt: "2026-10-30T02:02:00.000Z", body: "요청 r2" },
      { status: "done", sequence: 1, submittedAt: "2026-10-30T02:01:00.000Z", body: "요청 r1" },
    ]);
    // 작업자 메모(반려 사유)·이름·수동 기록은 내보내지 않는다.
    expect(JSON.stringify(requests)).not.toMatch(/질문이라|김담당|옮겨 적은/);
  });

  it("최대 20건까지만 돌려준다", () => {
    let value = job();
    for (let index = 0; index < 25; index += 1) {
      value = recordRevision(value, { source: "public", body: `요청 ${index}`, revisionId: `r${index}`, submittedAt: `2026-10-30T02:${String(index).padStart(2, "0")}:00.000Z` }).job;
    }
    const requests = customerRequestsOf(value);
    expect(requests).toHaveLength(20);
    expect(requests[0].body).toBe("요청 24");
  });
});

describe("고객 화면 완료 날짜", () => {
  it("완료 시각을 'O월 O일'로, 형식이 틀리면 비운다", () => {
    expect(customerCompletedLabel("2026-11-03T05:00:00.000Z")).toBe("11월 3일");
    expect(customerCompletedLabel(undefined)).toBeUndefined();
    expect(customerCompletedLabel("어제")).toBeUndefined();
  });
});

describe("고객 화면 마감 표시", () => {
  it("남은 날, 오늘, 지난 마감을 구분한다", () => {
    expect(customerDueLabel("2026-11-12", "2026-11-07")).toBe("11월 12일 · 5일 남음");
    expect(customerDueLabel("2026-11-07", "2026-11-07")).toBe("11월 7일 · 오늘");
    expect(customerDueLabel("2026-11-01", "2026-11-07")).toBe("11월 1일");
  });

  it("형식이 틀린 날짜는 표시하지 않는다", () => {
    expect(customerDueLabel("", "2026-11-07")).toBeUndefined();
    expect(customerDueLabel("2026/11/07", "2026-11-07")).toBeUndefined();
  });
});
