import { describe, expect, it } from "vitest";
import {
  cancelAddon,
  composeJob,
  confirmAddon,
  createAddon,
  DomainValidationError,
  getRevisionSummary,
  recordRevision,
  revertRevision,
  toggleJobCompletion,
  updateTaskStatus,
  type OptionTemplate,
  type PackageTemplate,
} from ".";

const packageTemplate: PackageTemplate = {
  id: "package_standard",
  name: "스탠다드",
  price: 1_100_000,
  estimatedCost: 100_000,
  durationDays: 14,
  revisionLimit: 2,
  tasks: [
    { taskKey: "brief", title: "의뢰서 확인", relativeDay: 0, order: 0 },
    { taskKey: "design", title: "디자인", relativeDay: 5, order: 1 },
    { taskKey: "launch", title: "납품", relativeDay: 14, order: 2 },
  ],
};

const pagesOption: OptionTemplate = {
  id: "option_pages",
  name: "추가 페이지",
  priceDelta: 150_000,
  estimatedCostDelta: 25_000,
  durationDaysDelta: 3,
  revisionLimitDelta: 0,
  taskDeltas: [
    {
      kind: "add",
      task: { taskKey: "pages", title: "추가 페이지 제작", relativeDay: 12, order: 0 },
    },
  ],
};

const suppliedDesignOption: OptionTemplate = {
  id: "option_supplied_design",
  name: "디자인 제공",
  priceDelta: 0,
  estimatedCostDelta: 0,
  durationDaysDelta: 1,
  revisionLimitDelta: 1,
  taskDeltas: [{ kind: "remove", taskKey: "design" }],
};

describe("composeJob", () => {
  it("패키지+옵션을 금액·기간·수정·업무로 한 번에 합성한다", () => {
    const job = composeJob({
      jobId: "job_1",
      revisionPortalToken: "token_1",
      clientLabel: "테스트 고객",
      startDate: "2026-08-01",
      package: packageTemplate,
      options: [pagesOption, suppliedDesignOption],
      now: "2026-08-01T00:00:00.000Z",
    });

    expect(job.amount).toBe(1_250_000);
    expect(job.estimatedCost).toBe(125_000);
    expect(job.margin).toBe(1_125_000);
    expect(job.revisionLimit).toBe(3);
    expect(job.dueDate).toBe("2026-08-19");
    expect(job.tasks.map((task) => task.taskKey)).toEqual(["brief", "launch", "pages"]);
    expect(job.tasks.find((task) => task.taskKey === "pages")?.dueDate).toBe("2026-08-13");
  });

  it("옵션 업무가 일감 마감을 넘으면 마감일로 당겨진다", () => {
    const shortPackage: PackageTemplate = {
      ...packageTemplate,
      durationDays: 7,
      tasks: [
        { taskKey: "brief", title: "의뢰서 확인", relativeDay: 0, order: 0 },
        { taskKey: "launch", title: "납품", relativeDay: 7, order: 1 },
      ],
    };
    const job = composeJob({
      jobId: "job_clamp",
      revisionPortalToken: "token_clamp",
      clientLabel: "테스트 고객",
      startDate: "2026-08-01",
      package: shortPackage,
      options: [pagesOption],
      now: "2026-08-01T00:00:00.000Z",
    });

    // 7일 + 옵션 3일 = 10일 마감. 옵션 업무 상대일 12는 10으로 잘린다.
    expect(job.dueDate).toBe("2026-08-11");
    const pages = job.tasks.find((task) => task.taskKey === "pages");
    expect(pages?.relativeDay).toBe(10);
    expect(pages?.dueDate).toBe("2026-08-11");
    for (const task of job.tasks) {
      expect(task.dueDate <= job.dueDate).toBe(true);
    }
    // 납품(패키지 마감일 업무)은 늘어난 마감을 따라가야 추가 작업보다 뒤에 놓인다.
    expect(job.tasks.find((task) => task.taskKey === "launch")?.dueDate).toBe("2026-08-11");
  });

  it("옵션 선택 순서가 바뀌어도 결과와 스냅샷이 같다", () => {
    const base = {
      jobId: "job_order",
      revisionPortalToken: "token_order",
      clientLabel: "순서 검증",
      startDate: "2026-08-01",
      package: packageTemplate,
      now: "2026-08-01T00:00:00.000Z",
    } as const;
    const first = composeJob({ ...base, options: [pagesOption, suppliedDesignOption] });
    const second = composeJob({ ...base, options: [suppliedDesignOption, pagesOption] });

    expect(second).toEqual(first);
    expect(first.optionIds).toEqual(["option_pages", "option_supplied_design"]);
  });

  it("중복 업무 키는 묵은 채 진행하지 않고 정확히 막는다", () => {
    const duplicateOption: OptionTemplate = {
      ...pagesOption,
      id: "option_duplicate",
      taskDeltas: [
        {
          kind: "add",
          task: { taskKey: "brief", title: "또 의뢰서", relativeDay: 1, order: 0 },
        },
      ],
    };

    expect(() =>
      composeJob({
        clientLabel: "중복 검증",
        startDate: "2026-08-01",
        package: packageTemplate,
        options: [duplicateOption],
      }),
    ).toThrowError(DomainValidationError);
  });

  it("생성 후 원본 템플릿을 바꿔도 일감 스냅샷은 변하지 않는다", () => {
    const source: PackageTemplate = {
      ...packageTemplate,
      tasks: packageTemplate.tasks.map((task) => ({ ...task })),
    };
    const job = composeJob({
      jobId: "job_snapshot",
      clientLabel: "스냅샷",
      startDate: "2026-08-01",
      package: source,
    });
    source.price = 9_999_999;
    source.tasks[0].title = "바뀐 제목";

    expect(job.packageSnapshot.price).toBe(1_100_000);
    expect(job.packageSnapshot.tasks[0].title).toBe("의뢰서 확인");
    expect(job.amount).toBe(1_100_000);
  });
});

describe("revision intake", () => {
  it("고객 링크와 수동 기록을 같은 로그·카운터로 처리하고 0회에서는 추가작업으로 보낸다", () => {
    let job = composeJob({
      jobId: "job_revision",
      clientLabel: "수정 고객",
      startDate: "2026-08-01",
      package: { ...packageTemplate, revisionLimit: 1 },
    });

    const publicResult = recordRevision(job, {
      revisionId: "revision_public",
      source: "public",
      body: "메인 문구를 바꿔주세요.",
      submittedAt: "2026-08-02T00:00:00.000Z",
    });
    job = publicResult.job;
    const manualResult = recordRevision(job, {
      revisionId: "revision_manual",
      source: "manual",
      channel: "kakao",
      body: "로고 크기도 조절해주세요.",
      submittedAt: "2026-08-02T01:00:00.000Z",
    });
    job = manualResult.job;

    expect(publicResult.revision.usage).toBe("used");
    expect(manualResult.revision.usage).toBe("extra_scope");
    expect(manualResult.revision.sequence).toBeNull();
    expect(getRevisionSummary(job)).toEqual({ included: 1, used: 1, remaining: 0, extraScope: 1 });
    expect(job.revisions.map((revision) => revision.source)).toEqual(["public", "manual"]);
  });

  it("수정 횟수를 되돌려도 요청 원문은 지우지 않는다", () => {
    const job = composeJob({
      jobId: "job_revert",
      clientLabel: "되돌림 고객",
      startDate: "2026-08-01",
      package: { ...packageTemplate, revisionLimit: 1 },
    });
    const recorded = recordRevision(job, {
      revisionId: "revision_to_revert",
      source: "public",
      body: "잘못 접수했어요.",
    }).job;
    const reverted = revertRevision(recorded, "revision_to_revert", "고객이 오접수 확인");

    expect(reverted.revisions[0].body).toBe("잘못 접수했어요.");
    expect(reverted.revisions[0].revertReason).toBe("고객이 오접수 확인");
    expect(getRevisionSummary(reverted).remaining).toBe(1);
  });

  it("사유 없이 되돌려도 원문과 회차 복구는 똑같이 동작한다", () => {
    const job = composeJob({
      jobId: "job_revert_no_reason",
      clientLabel: "사유 없는 되돌림",
      startDate: "2026-08-01",
      package: { ...packageTemplate, revisionLimit: 2 },
    });
    const recorded = recordRevision(job, {
      revisionId: "revision_no_reason",
      source: "manual",
      channel: "kakao",
      body: "중복으로 두 번 접수했어요.",
    }).job;
    expect(getRevisionSummary(recorded).remaining).toBe(1);

    const reverted = revertRevision(recorded, "revision_no_reason");

    expect(reverted.revisions[0].body).toBe("중복으로 두 번 접수했어요.");
    expect(reverted.revisions[0].revertReason).toBeUndefined();
    expect(reverted.revisions[0].revertedAt).toBeTruthy();
    expect(reverted.revisions[0].status).toBe("void");
    expect(getRevisionSummary(reverted).remaining).toBe(2);
  });

  it("이미 되돌린 수정은 다시 되돌리지 못한다", () => {
    const job = composeJob({
      jobId: "job_double_revert",
      clientLabel: "중복 되돌림",
      startDate: "2026-08-01",
      package: packageTemplate,
    });
    const recorded = recordRevision(job, { revisionId: "rev_once", source: "public", body: "요청" }).job;
    const reverted = revertRevision(recorded, "rev_once", "오접수");

    expect(() => revertRevision(reverted, "rev_once", "또 오접수")).toThrow(DomainValidationError);
  });

  it("한도를 넘겨 접수된 추가작업 요청도 되돌릴 수 있다", () => {
    let job = composeJob({
      jobId: "job_revert_extra",
      clientLabel: "초과 고객",
      startDate: "2026-08-01",
      package: { ...packageTemplate, revisionLimit: 1 },
    });
    job = recordRevision(job, { revisionId: "used_1", source: "public", body: "한도 안 요청" }).job;
    job = recordRevision(job, { revisionId: "extra_1", source: "public", body: "한도 넘은 요청" }).job;

    const before = getRevisionSummary(job);
    expect(before.extraScope).toBe(1);

    // 오접수는 한도 안이든 밖이든 똑같이 되돌릴 수 있어야 한다.
    const reverted = revertRevision(job, "extra_1", "중복 접수");
    const after = getRevisionSummary(reverted);

    expect(after.extraScope).toBe(0);
    // 한도를 소모하지 않았으므로 남은 횟수는 그대로다.
    expect(after.remaining).toBe(before.remaining);
    // 원문은 지우지 않는다.
    expect(reverted.revisions.find((item) => item.id === "extra_1")?.body).toBe("한도 넘은 요청");
    expect(reverted.revisions.find((item) => item.id === "extra_1")?.revertReason).toBe("중복 접수");
  });

  it("한도 안 수정을 되돌리면 뒤에 밀렸던 추가작업이 한도 안으로 들어온다", () => {
    let job = composeJob({
      jobId: "job_regrade",
      clientLabel: "재판정 고객",
      startDate: "2026-08-01",
      package: { ...packageTemplate, revisionLimit: 1 },
    });
    job = recordRevision(job, { revisionId: "used_1", source: "public", body: "오접수된 요청" }).job;
    job = recordRevision(job, { revisionId: "extra_1", source: "public", body: "진짜 첫 요청" }).job;
    expect(getRevisionSummary(job).extraScope).toBe(1);

    // 작업자 실수로 잡힌 1회차를 되돌리면, 그 뒤 요청이 추가금으로 남으면 안 된다.
    job = revertRevision(job, "used_1", "오접수");

    const summary = getRevisionSummary(job);
    expect(summary.used).toBe(1);
    expect(summary.extraScope).toBe(0);
    expect(summary.remaining).toBe(0);

    const promoted = job.revisions.find((item) => item.id === "extra_1")!;
    expect(promoted.usage).toBe("used");
    expect(promoted.status).toBe("new");
    // 회차 번호는 되돌린 1번을 다시 쓰지 않는다.
    expect(promoted.sequence).toBe(2);
  });

  it("수정 되돌림 뒤에도 이미 쓴 회차 번호를 다시 사용하지 않는다", () => {
    let job = composeJob({
      jobId: "job_sequence",
      clientLabel: "회차 고객",
      startDate: "2026-08-01",
      package: { ...packageTemplate, revisionLimit: 3 },
    });
    job = recordRevision(job, { revisionId: "r1", source: "public", body: "첫 요청" }).job;
    job = recordRevision(job, { revisionId: "r2", source: "public", body: "둘째 요청" }).job;
    job = revertRevision(job, "r1", "오접수");
    job = recordRevision(job, { revisionId: "r3", source: "public", body: "셋째 요청" }).job;

    expect(job.revisions.map((item) => item.sequence)).toEqual([1, 2, 3]);
  });
});

describe("addon confirmation", () => {
  it("추가요청을 확정하면 납품도 늘어난 마감을 따라가고, 취소하면 정확히 되돌아온다", () => {
    const shortPackage: PackageTemplate = {
      ...packageTemplate,
      durationDays: 7,
      tasks: [
        { taskKey: "kickoff", title: "킥오프", relativeDay: 0, order: 0 },
        { taskKey: "launch", title: "납품", relativeDay: 7, order: 1 },
      ],
    };
    const job = composeJob({
      jobId: "job_addon_shift",
      clientLabel: "추가 고객",
      startDate: "2026-01-01",
      package: shortPackage,
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(job.dueDate).toBe("2026-01-08");

    const addon = createAddon(job, {
      addonId: "addon_shift",
      title: "추가 작업",
      amountDelta: 100_000,
      durationDaysDelta: 3,
      tasks: [{ taskKey: "extra", title: "추가 페이지", relativeDay: 10, order: 0 }],
    });
    const confirmed = confirmAddon(
      { ...job, addons: [addon] },
      "addon_shift",
      "2026-01-02T00:00:00.000Z",
    );

    expect(confirmed.dueDate).toBe("2026-01-11");
    // 납품이 추가 작업보다 앞에 놓이면 안 된다.
    expect(confirmed.tasks.find((task) => task.taskKey === "launch")?.dueDate).toBe("2026-01-11");
    for (const task of confirmed.tasks) {
      expect(task.dueDate <= confirmed.dueDate).toBe(true);
    }

    const cancelled = cancelAddon(confirmed, "addon_shift", "2026-01-03T00:00:00.000Z");
    expect(cancelled.dueDate).toBe("2026-01-08");
    expect(cancelled.tasks.find((task) => task.taskKey === "launch")?.dueDate).toBe("2026-01-08");
  });

  it("추가요청은 확정 전에는 일감 합계·마감·Todo를 바꾸지 않고, 확정 시에만 반영한다", () => {
    const job = composeJob({
      jobId: "job_addon",
      clientLabel: "추가요청 고객",
      startDate: "2026-08-01",
      package: packageTemplate,
    });
    const draft = createAddon(job, {
      addonId: "addon_landing",
      title: "이벤트 랜딩 페이지",
      amountDelta: 220_000,
      estimatedCostDelta: 40_000,
      durationDaysDelta: 2,
      tasks: [{ taskKey: "event-landing", title: "이벤트 랜딩 페이지 제작", relativeDay: 11, order: 0 }],
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    const withDraft = { ...job, addons: [draft] };

    expect(withDraft.amount).toBe(1_100_000);
    expect(withDraft.dueDate).toBe("2026-08-15");
    expect(withDraft.tasks).toHaveLength(3);

    const confirmed = confirmAddon(withDraft, draft.id, "2026-08-03T00:00:00.000Z");
    expect(confirmed.amount).toBe(1_320_000);
    expect(confirmed.estimatedCost).toBe(140_000);
    expect(confirmed.margin).toBe(1_180_000);
    expect(confirmed.dueDate).toBe("2026-08-17");
    expect(confirmed.tasks.find((task) => task.taskKey === "event-landing")).toMatchObject({
      source: "addon",
      dueDate: "2026-08-12",
    });
    expect(confirmed.addons[0]).toMatchObject({ status: "confirmed", confirmedAt: "2026-08-03T00:00:00.000Z" });
  });
});

describe("addon cancellation", () => {
  const baseJob = () =>
    composeJob({
      jobId: "job_cancel",
      clientLabel: "취소 고객",
      startDate: "2026-08-01",
      package: packageTemplate,
    });

  const draftInput = {
    addonId: "addon_cancel",
    title: "배너 3종",
    amountDelta: 220_000,
    estimatedCostDelta: 40_000,
    durationDaysDelta: 2,
    tasks: [{ taskKey: "banner", title: "배너 제작", relativeDay: 11, order: 0 }],
    createdAt: "2026-08-02T00:00:00.000Z",
  };

  it("초안 취소는 상태만 바꾸고 합계·마감·할 일에 손대지 않는다", () => {
    const job = baseJob();
    const withDraft = { ...job, addons: [createAddon(job, draftInput)] };

    const cancelled = cancelAddon(withDraft, "addon_cancel", "2026-08-03T00:00:00.000Z");

    expect(cancelled.addons[0]).toMatchObject({ status: "cancelled", cancelledAt: "2026-08-03T00:00:00.000Z" });
    expect(cancelled.amount).toBe(job.amount);
    expect(cancelled.estimatedCost).toBe(job.estimatedCost);
    expect(cancelled.margin).toBe(job.margin);
    expect(cancelled.dueDate).toBe(job.dueDate);
    expect(cancelled.tasks).toHaveLength(job.tasks.length);
  });

  it("확정 취소는 금액·원가·마진·마감일·할 일 반영분을 확정 이전 값으로 정확히 되돌린다", () => {
    const job = baseJob();
    const withDraft = { ...job, addons: [createAddon(job, draftInput)] };
    const confirmed = confirmAddon(withDraft, "addon_cancel", "2026-08-03T00:00:00.000Z");
    expect(confirmed.amount).toBe(1_320_000);
    expect(confirmed.tasks).toHaveLength(4);

    const cancelled = cancelAddon(confirmed, "addon_cancel", "2026-08-04T00:00:00.000Z");

    expect(cancelled.amount).toBe(job.amount);
    expect(cancelled.estimatedCost).toBe(job.estimatedCost);
    expect(cancelled.margin).toBe(job.margin);
    expect(cancelled.dueDate).toBe(job.dueDate);
    expect(cancelled.calculatedDueDate).toBe(job.calculatedDueDate);
    expect(cancelled.tasks.map((task) => task.taskKey)).toEqual(job.tasks.map((task) => task.taskKey));
    expect(cancelled.tasks.map((task) => task.order)).toEqual([0, 1, 2]);
    // 취소 이력은 감추지 않는다.
    expect(cancelled.addons[0]).toMatchObject({ status: "cancelled", title: "배너 3종", amountDelta: 220_000 });
  });

  it("확정 취소해도 이미 처리한 할 일 기록은 남긴다", () => {
    const job = baseJob();
    const withDraft = { ...job, addons: [createAddon(job, draftInput)] };
    const confirmed = confirmAddon(withDraft, "addon_cancel", "2026-08-03T00:00:00.000Z");
    const addonTask = confirmed.tasks.find((task) => task.source === "addon");
    expect(addonTask).toBeDefined();

    // 사용자가 그 할 일을 실제로 끝냈다.
    const worked = updateTaskStatus(confirmed, addonTask!.id, "done", "2026-08-03T05:00:00.000Z");
    const cancelled = cancelAddon(worked, "addon_cancel", "2026-08-04T00:00:00.000Z");

    // 범위를 취소해도 "이미 한 일"의 기록까지 지워서는 안 된다.
    const survivor = cancelled.tasks.find((task) => task.id === addonTask!.id);
    expect(survivor).toBeDefined();
    expect(survivor?.status).toBe("done");
    // 금액·마감은 그대로 되돌아간다.
    expect(cancelled.amount).toBe(job.amount);
    expect(cancelled.dueDate).toBe(job.dueDate);
    expect(cancelled.tasks.map((task) => task.order)).toEqual([0, 1, 2, 3]);
  });

  it("확정 취소는 손대지 않은 할 일만 걷어낸다", () => {
    const job = baseJob();
    const withDraft = { ...job, addons: [createAddon(job, draftInput)] };
    const confirmed = confirmAddon(withDraft, "addon_cancel", "2026-08-03T00:00:00.000Z");
    const cancelled = cancelAddon(confirmed, "addon_cancel", "2026-08-04T00:00:00.000Z");

    expect(cancelled.tasks.map((task) => task.taskKey)).toEqual(job.tasks.map((task) => task.taskKey));
  });

  it("취소한 추가요청은 다시 취소하거나 확정할 수 없다", () => {
    const job = baseJob();
    const withDraft = { ...job, addons: [createAddon(job, draftInput)] };
    const cancelled = cancelAddon(withDraft, "addon_cancel");

    expect(() => cancelAddon(cancelled, "addon_cancel")).toThrow(DomainValidationError);
    expect(() => confirmAddon(cancelled, "addon_cancel")).toThrow(DomainValidationError);
    expect(() => cancelAddon(cancelled, "addon_missing")).toThrow(DomainValidationError);
  });
});

describe("job completion", () => {
  it("일감 완료와 재진행이 기존 업무 상태를 바꾸지 않는다", () => {
    const active = composeJob({
      jobId: "job_completion",
      clientLabel: "완료 고객",
      startDate: "2026-08-01",
      package: packageTemplate,
    });
    active.tasks[0].status = "done";
    active.tasks[1].status = "waiting";

    const completed = toggleJobCompletion(active, "2026-08-02T00:00:00.000Z");
    const reopened = toggleJobCompletion(completed, "2026-08-03T00:00:00.000Z");

    expect(completed.status).toBe("completed");
    expect(reopened.status).toBe("active");
    expect(reopened.tasks.map((task) => task.status)).toEqual(active.tasks.map((task) => task.status));
  });
});
