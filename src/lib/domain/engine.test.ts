import { describe, expect, it } from "vitest";
import {
  cancelAddon,
  completeRevision,
  composeJob,
  confirmAddon,
  createAddon,
  DomainValidationError,
  getRevisionSummary,
  markRevisionExtraScope,
  normalizeIntakeLabels,
  pendingIntakeLabels,
  recordRevision,
  toggleIntakeItem,
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

  it("받은 곳을 주면 일감에 남기고, 안 주면 칸을 만들지 않는다", () => {
    const input = {
      jobId: "job_source",
      revisionPortalToken: "token_source",
      clientLabel: "받은 곳 고객",
      startDate: "2026-08-01",
      package: packageTemplate,
      now: "2026-08-01T00:00:00.000Z",
    };
    expect(composeJob({ ...input, source: "soomgo" }).source).toBe("soomgo");
    expect("source" in composeJob(input)).toBe(false);
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
  function revisionJob(revisionLimit: number, jobId = "job_revision") {
    return composeJob({
      jobId,
      clientLabel: "수정 고객",
      startDate: "2026-08-01",
      package: { ...packageTemplate, revisionLimit },
    });
  }

  it("고객 링크와 수동 기록은 같은 로그로 접수되고, 접수만으로는 횟수를 쓰지 않는다(확인 대기)", () => {
    let job = revisionJob(1);
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

    expect(publicResult.revision).toMatchObject({ usage: "pending", status: "new", sequence: null });
    expect(publicResult.receipt.usage).toBe("pending");
    expect(manualResult.revision.usage).toBe("pending");
    expect(getRevisionSummary(job)).toEqual({ included: 1, used: 0, remaining: 1, extraScope: 0, pending: 2 });
    expect(job.revisions.map((revision) => revision.source)).toEqual(["public", "manual"]);
  });

  it("작업자가 '수정 완료'를 누르면 그때 1회를 쓰고 회차 번호를 붙인다", () => {
    let job = recordRevision(revisionJob(3), { revisionId: "r1", source: "public", body: "글자를 키워주세요." }).job;
    job = completeRevision(job, "r1", "2026-08-03T00:00:00.000Z");

    expect(job.revisions[0]).toMatchObject({ usage: "used", status: "done", sequence: 1, completedAt: "2026-08-03T00:00:00.000Z" });
    expect(getRevisionSummary(job)).toMatchObject({ used: 1, remaining: 2, pending: 0 });
    expect(() => completeRevision(job, "r1")).toThrow(DomainValidationError);
  });

  it("남은 포함 수정이 없으면 '수정 완료'를 막고, 추가 작업으로만 처리할 수 있다", () => {
    let job = recordRevision(revisionJob(1), { revisionId: "r1", source: "public", body: "첫 요청" }).job;
    job = completeRevision(job, "r1");
    job = recordRevision(job, { revisionId: "r2", source: "public", body: "둘째 요청" }).job;

    expect(() => completeRevision(job, "r2")).toThrow(expect.objectContaining({ code: "REVISION_LIMIT_REACHED" }));
    job = markRevisionExtraScope(job, "r2");

    expect(job.revisions[1]).toMatchObject({ usage: "extra_scope", status: "extra_scope", sequence: null });
    expect(getRevisionSummary(job)).toMatchObject({ used: 1, remaining: 0, extraScope: 1, pending: 0 });
    // 확인 대기가 아닌 요청은 다시 추가 작업으로 바꾸지 않는다.
    expect(() => markRevisionExtraScope(job, "r1")).toThrow(DomainValidationError);
  });

  it("이미 고친 뒤 적는 수동 기록은 접수와 동시에 '수정 완료'로 1회를 쓴다", () => {
    const result = recordRevision(revisionJob(2), {
      revisionId: "manual_done",
      source: "manual",
      channel: "kakao",
      body: "전화로 받은 문구 수정, 반영 완료",
      submittedAt: "2026-08-04T00:00:00.000Z",
      completed: true,
    });

    expect(result.revision).toMatchObject({ usage: "used", status: "done", sequence: 1, completedAt: "2026-08-04T00:00:00.000Z" });
    expect(result.receipt.usage).toBe("used");
    expect(result.receipt.summary.remaining).toBe(1);
    // 남은 횟수가 없으면 완료 기록 자체를 막는다.
    const full = completeRevision(recordRevision(revisionJob(1), { revisionId: "x", source: "public", body: "요청" }).job, "x");
    expect(() => recordRevision(full, { source: "manual", channel: "kakao", body: "또 고침", completed: true })).toThrow(DomainValidationError);
  });

  it("확인 대기 요청을 반려하면 원문은 남고 횟수는 그대로다", () => {
    const recorded = recordRevision(revisionJob(1, "job_reject"), {
      revisionId: "question",
      source: "public",
      body: "이건 질문인데요, 폰트 이름이 뭐예요?",
    }).job;
    const rejected = revertRevision(recorded, "question", "질문이라 대화창으로 답함");

    expect(rejected.revisions[0]).toMatchObject({ body: "이건 질문인데요, 폰트 이름이 뭐예요?", revertReason: "질문이라 대화창으로 답함", status: "void", usage: "pending" });
    expect(getRevisionSummary(rejected)).toMatchObject({ used: 0, remaining: 1, pending: 0 });
    expect(() => completeRevision(rejected, "question")).toThrow(DomainValidationError);
  });

  it("수정 완료로 셌던 요청을 되돌리면 그 1회가 빠지고 원문은 남는다(사유는 선택)", () => {
    let job = recordRevision(revisionJob(2, "job_revert"), { revisionId: "done_1", source: "manual", channel: "kakao", body: "중복으로 두 번 기록했어요." }).job;
    job = completeRevision(job, "done_1");
    expect(getRevisionSummary(job).remaining).toBe(1);

    const reverted = revertRevision(job, "done_1");

    expect(reverted.revisions[0].body).toBe("중복으로 두 번 기록했어요.");
    expect(reverted.revisions[0].revertReason).toBeUndefined();
    expect(reverted.revisions[0].revertedAt).toBeTruthy();
    expect(reverted.revisions[0].status).toBe("void");
    expect(getRevisionSummary(reverted).remaining).toBe(2);
    expect(() => revertRevision(reverted, "done_1", "또 되돌림")).toThrow(DomainValidationError);
  });

  it("되돌려도 추가 작업 요청을 저절로 포함 수정으로 바꾸지 않고, 작업자가 '수정 완료'로 정한다", () => {
    let job = recordRevision(revisionJob(1, "job_no_regrade"), { revisionId: "first", source: "public", body: "오접수된 요청" }).job;
    job = completeRevision(job, "first");
    job = recordRevision(job, { revisionId: "second", source: "public", body: "진짜 요청" }).job;
    job = markRevisionExtraScope(job, "second");

    job = revertRevision(job, "first", "오접수");
    expect(getRevisionSummary(job)).toMatchObject({ used: 0, remaining: 1, extraScope: 1 });
    expect(job.revisions.find((item) => item.id === "second")?.usage).toBe("extra_scope");

    job = completeRevision(job, "second");
    const promoted = job.revisions.find((item) => item.id === "second")!;
    expect(promoted.usage).toBe("used");
    // 회차 번호는 되돌린 1번을 다시 쓰지 않는다.
    expect(promoted.sequence).toBe(2);
    expect(getRevisionSummary(job)).toMatchObject({ used: 1, remaining: 0, extraScope: 0 });
  });

  it("추가 작업으로 분류한 요청을 되돌려도 남은 횟수는 그대로다", () => {
    let job = recordRevision(revisionJob(1, "job_revert_extra"), { revisionId: "extra_1", source: "public", body: "범위 밖 요청" }).job;
    job = markRevisionExtraScope(job, "extra_1");
    const reverted = revertRevision(job, "extra_1", "중복 접수");

    expect(getRevisionSummary(reverted)).toMatchObject({ extraScope: 0, remaining: 1 });
    expect(reverted.revisions[0].body).toBe("범위 밖 요청");
    expect(reverted.revisions[0].revertReason).toBe("중복 접수");
  });

  it("되돌린 뒤에도 이미 쓴 회차 번호를 다시 쓰지 않는다", () => {
    let job = revisionJob(3, "job_sequence");
    for (const id of ["r1", "r2"]) {
      job = completeRevision(recordRevision(job, { revisionId: id, source: "public", body: `${id} 요청` }).job, id);
    }
    job = revertRevision(job, "r1", "오접수");
    job = completeRevision(recordRevision(job, { revisionId: "r3", source: "public", body: "셋째 요청" }).job, "r3");

    expect(job.revisions.map((item) => item.sequence)).toEqual([1, 2, 3]);
  });
});

describe("시작 전 받을 자료", () => {
  it("패키지 목록을 정리해서(공백·빈 줄·중복 제거, 60자, 10개) 일감에 복사한다", () => {
    const labels = ["  로고 원본 파일 ", "", "로고 원본 파일", "가".repeat(80), ...Array.from({ length: 12 }, (_, index) => `참고 이미지 ${index + 1}`)];
    const job = composeJob({ jobId: "job_intake", clientLabel: "자료 고객", startDate: "2026-08-01", package: { ...packageTemplate, intakeItems: labels } });

    expect(job.intakeItems).toHaveLength(10);
    expect(job.intakeItems?.[0]).toEqual({ id: "job_intake_intake_1", label: "로고 원본 파일" });
    expect(job.intakeItems?.[1].label).toBe("가".repeat(60));
    expect(pendingIntakeLabels(job)).toHaveLength(10);
  });

  it("목록이 없는 패키지는 일감에 필드를 만들지 않는다", () => {
    const job = composeJob({ jobId: "job_no_intake", clientLabel: "고객", startDate: "2026-08-01", package: packageTemplate });
    expect(job).not.toHaveProperty("intakeItems");
    expect(pendingIntakeLabels(job)).toEqual([]);
  });

  it("받음을 체크하면 고객에게 보일 목록에서 빠지고, 다시 누르면 돌아온다", () => {
    const job = composeJob({ jobId: "job_toggle", clientLabel: "고객", startDate: "2026-08-01", package: { ...packageTemplate, intakeItems: ["상호명", "참고 이미지"] } });
    const received = toggleIntakeItem(job, "job_toggle_intake_1", "2026-08-02T00:00:00.000Z");

    expect(received.intakeItems?.[0].receivedAt).toBe("2026-08-02T00:00:00.000Z");
    expect(pendingIntakeLabels(received)).toEqual(["참고 이미지"]);
    expect(pendingIntakeLabels(toggleIntakeItem(received, "job_toggle_intake_1"))).toEqual(["상호명", "참고 이미지"]);
    expect(toggleIntakeItem(job, "없는_항목")).toBe(job);
  });

  it("문자열이 아닌 값은 버린다", () => {
    expect(normalizeIntakeLabels(["가", 3, null, { label: "나" }, "다"])).toEqual(["가", "다"]);
    expect(normalizeIntakeLabels("가")).toEqual([]);
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
