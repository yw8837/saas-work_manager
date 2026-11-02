import { describe, expect, it } from "vitest";

import {
  availableSituations,
  situationMessage,
  SITUATION_LABELS,
  type MessageSituation,
} from "./client-messages";
import { clientShareMessage } from "./client-share";
import {
  completeRevision,
  composeJob,
  createAddon,
  displayJobTitle,
  markRevisionExtraScope,
  markStartShared,
  recordRevision,
  revertRevision,
  toggleBriefQuestion,
  toggleIntakeItem,
  updateTaskStatus,
  type Job,
  type PackageTemplate,
} from "./domain";

const TODAY = "2026-11-02";
// 이 기기 시간대와 상관없이 TODAY에 드는 시각(로컬 정오).
const TODAY_NOON = new Date(2026, 10, 2, 12, 0, 0).toISOString();
const LINK = "https://ilgam.example/r/token_msg";
const ALL = Object.keys(SITUATION_LABELS) as MessageSituation[];

const template: PackageTemplate = {
  id: "pkg_msg",
  name: "Basic 홈페이지",
  price: 790_000,
  estimatedCost: 95_000,
  durationDays: 7,
  revisionLimit: 2,
  tasks: [
    { taskKey: "brief", title: "요청서 확인", relativeDay: 0, order: 0 },
    { taskKey: "draft", title: "시안 공유", relativeDay: 3, order: 1 },
    { taskKey: "deliver", title: "납품", relativeDay: 7, order: 2 },
  ],
  intakeItems: ["로고 파일"],
  briefQuestions: ["가장 하고 싶은 일은 무엇인가요?"],
};

/** 시작 안내를 이미 보낸 일감(설계 B2 순서를 본다). 안 보낸 일감은 `notSentYet`으로 만든다. */
function baseJob(overrides: Partial<PackageTemplate> = {}): Job {
  const job = composeJob({
    jobId: "job_msg",
    revisionPortalToken: "token_msg",
    clientLabel: "카페 모라",
    startDate: "2026-10-30",
    package: { ...template, ...overrides },
    now: "2026-10-30T00:00:00.000Z",
  });
  return { ...job, startSharedAt: "2026-10-30T00:10:00.000Z" };
}

function notSentYet(job: Job): Job {
  const copy = { ...job };
  delete copy.startSharedAt;
  return copy;
}

function withDoneRevision(job: Job, id: string, at = TODAY_NOON): Job {
  return completeRevision(recordRevision(job, { revisionId: id, source: "public", body: `${id} 요청`, submittedAt: at }).job, id, at);
}

function allTasksDone(job: Job): Job {
  return job.tasks.reduce((current, task) => updateTaskStatus(current, task.id, "done", TODAY_NOON), job);
}

describe("고객에게 보낼 말 — 상황 고르기", () => {
  it("상황 이름은 7개다", () => {
    expect(SITUATION_LABELS).toEqual({
      "revision-done": "수정 반영 알림",
      remaining: "남은 것 요청",
      waiting: "답 기다림",
      review: "시안 확인 부탁",
      start: "시작 안내",
      "out-of-scope": "범위 밖 안내",
      delivery: "납품 안내",
    });
  });

  it("상태에 맞는 상황만 우선순위대로 나온다", () => {
    let job = withDoneRevision(baseJob(), "r1");
    job = updateTaskStatus(job, job.tasks[1].id, "waiting", TODAY_NOON);
    expect(availableSituations(job, TODAY)).toEqual(["revision-done", "remaining", "waiting", "review", "start"]);
    // 수정 완료가 다른 날이면 수정 반영 알림은 없다.
    expect(availableSituations(job, "2026-11-03")).toEqual(["remaining", "waiting", "review", "start"]);
    // 되돌린 수정은 반영 알림을 띄우지 않는다.
    expect(availableSituations(revertRevision(withDoneRevision(baseJob(), "r2"), "r2", "중복", TODAY_NOON), TODAY)).toEqual(["remaining", "review", "start"]);

    // 완료 일감은 납품 안내만(범위 밖이 있으면 범위 밖 안내도).
    expect(availableSituations({ ...baseJob(), status: "completed" }, TODAY)).toEqual(["delivery"]);
    expect(availableSituations({ ...withDoneRevision(baseJob(), "r3"), status: "completed" }, TODAY)).toEqual(["delivery"]);
    const extra = markRevisionExtraScope(recordRevision(baseJob(), { revisionId: "r4", source: "public", body: "페이지 추가", submittedAt: TODAY_NOON }).job, "r4", TODAY_NOON);
    expect(availableSituations({ ...extra, status: "completed" }, TODAY)).toEqual(["out-of-scope", "delivery"]);
  });

  it("시작 안내를 아직 안 보낸 진행 중 일감은 시작 안내가 맨 앞이고, 보낸 뒤에는 설계 순서로 돌아간다", () => {
    const fresh = notSentYet(baseJob());
    expect(availableSituations(fresh, TODAY)).toEqual(["start", "remaining", "review"]);
    // 메신저로 받아 작업자가 직접 적은 요청도 이미 진행된 흔적이다. 보낸 기록이 없어도 설계 순서 그대로다.
    const manual = recordRevision(fresh, { revisionId: "r1", source: "manual", channel: "kakao", body: "전화로 받은 요청", submittedAt: TODAY_NOON }).job;
    let busy = completeRevision(manual, "r1", TODAY_NOON);
    busy = updateTaskStatus(busy, busy.tasks[1].id, "waiting", TODAY_NOON);
    expect(availableSituations(busy, TODAY)).toEqual(["revision-done", "remaining", "waiting", "review", "start"]);
    // 한 번 보내면 남은 것 요청이 앞선다.
    expect(availableSituations(markStartShared(fresh, TODAY_NOON), TODAY)).toEqual(["remaining", "review", "start"]);
    // 끝난 일감에는 시작 안내가 없다.
    expect(availableSituations({ ...fresh, status: "completed" }, TODAY)).toEqual(["delivery"]);
  });

  it("고객이 링크로 요청을 남긴 일감은 보낸 기록이 없어도 시작 안내를 맨 앞에 두지 않는다", () => {
    const fresh = notSentYet(baseJob());
    // 첫 실행 체크리스트의 '고객이 링크를 썼다'와 같은 기준: 고객 링크로 들어온 요청이 하나라도 있다.
    const fromLink = recordRevision(fresh, { revisionId: "r_link", source: "public", body: "사진 교체", submittedAt: TODAY_NOON }).job;
    expect(availableSituations(fromLink, TODAY)).toEqual(["remaining", "review", "start"]);
    // 반려한 요청이어도 고객은 링크를 받은 것이다.
    const rejected = revertRevision(fromLink, "r_link", "질문이라 대화창으로 답함", TODAY_NOON);
    expect(availableSituations(rejected, TODAY)).toEqual(["remaining", "review", "start"]);
  });

  it("보낸 기록 칸이 생기기 전에 만든 일감도, 이미 진행된 흔적이 하나라도 있으면 시작 안내를 맨 앞에 두지 않는다", () => {
    const fresh = notSentYet(baseJob());
    // 아무 흔적 없는 새 일감은 그대로 시작 안내가 맨 앞이다.
    expect(availableSituations(fresh, TODAY)).toEqual(["start", "remaining", "review"]);
    // 고객 대기 할 일은 흔적이 아니다(고객에게 아직 아무것도 안 보냈을 수 있다).
    expect(availableSituations(updateTaskStatus(fresh, fresh.tasks[1].id, "waiting", TODAY_NOON), TODAY)[0]).toBe("start");

    const draft = createAddon(fresh, { addonId: "addon_trace", title: "배너 추가", amountDelta: 100_000, durationDaysDelta: 1, createdAt: TODAY_NOON });
    const traces: Array<[string, Job, MessageSituation[]]> = [
      ["받은 자료 하나", toggleIntakeItem(fresh, fresh.intakeItems![0].id, TODAY_NOON), ["remaining", "review", "start"]],
      ["답 받은 질문 하나", toggleBriefQuestion(fresh, fresh.briefQuestions![0].id, TODAY_NOON), ["remaining", "review", "start"]],
      ["끝낸 할 일 하나", updateTaskStatus(fresh, fresh.tasks[0].id, "done", TODAY_NOON), ["remaining", "review", "start"]],
      [
        "직접 적은 수정 기록 하나(확인 대기)",
        recordRevision(fresh, { revisionId: "r_manual", source: "manual", channel: "phone", body: "전화로 받은 요청", submittedAt: TODAY_NOON }).job,
        ["remaining", "review", "start"],
      ],
      ["추가요청 하나", { ...fresh, addons: [draft] }, ["remaining", "review", "start", "out-of-scope"]],
    ];
    for (const [trace, job, expected] of traces) {
      expect(job.startSharedAt, trace).toBeUndefined();
      expect(availableSituations(job, TODAY), trace).toEqual(expected);
    }
  });

  it("초안 추가요청이 있으면 범위 밖 안내, 할 일을 다 끝내면 납품 안내가 나온다", () => {
    const plain = baseJob({ intakeItems: [], briefQuestions: [] });
    expect(availableSituations(plain, TODAY)).toEqual(["review", "start"]);
    const draft = createAddon(plain, { addonId: "addon_msg", title: "배너 추가", amountDelta: 100_000, durationDaysDelta: 1, createdAt: TODAY_NOON });
    expect(availableSituations({ ...plain, addons: [draft] }, TODAY)).toEqual(["review", "start", "out-of-scope"]);
    expect(availableSituations(allTasksDone(plain), TODAY)).toEqual(["review", "start", "delivery"]);
  });
});

describe("고객에게 보낼 말 — 문구", () => {
  it("어떤 문구에도 금액·원가가 들어가지 않는다", () => {
    const job = withDoneRevision(baseJob(), "r1");
    expect(job.amount).toBe(790_000);
    expect(job.estimatedCost).toBe(95_000);
    expect(ALL).toHaveLength(7);
    for (const situation of ALL) {
      for (const link of [LINK, null]) {
        const message = situationMessage(situation, { job, link });
        expect(message.split("\n")[0]).toBe("안녕하세요, 카페 모라님.");
        expect(message).not.toMatch(/\d{1,3}(,\d{3})*원|₩/);
        expect(message).not.toMatch(/790|95,?000|695/);
      }
    }
  });

  it("받은 곳 이름은 고객 문구에 안 나간다", () => {
    const job: Job = { ...withDoneRevision(baseJob(), "r1"), source: "kmong" };
    for (const situation of ALL) {
      for (const link of [LINK, null]) {
        expect(situationMessage(situation, { job, link })).not.toContain("크몽");
      }
    }
    const revision = { included: job.revisionLimit, remaining: job.revisionLimit - 1 };
    for (const link of [LINK, null]) {
      const shared = clientShareMessage({
        clientLabel: job.clientLabel,
        title: displayJobTitle(job),
        ...revision,
        link,
        pendingIntake: ["로고 파일"],
        pendingQuestions: ["가장 하고 싶은 일은 무엇인가요?"],
      });
      expect(shared).not.toContain("크몽");
    }
  });

  it("시작 안내는 저장 직후 안내와 같은 문구이고 제목에서 고객 이름을 뗀다", () => {
    const message = situationMessage("start", { job: baseJob(), link: LINK });
    expect(message).toContain("Basic 홈페이지 작업의 수정 요청은 아래 링크에 한 번에 남겨주세요.");
    expect(message).not.toContain("카페 모라 · Basic 홈페이지");
    expect(message).toContain("[보내 주실 자료]\n- 로고 파일");
    expect(message.split("\n").at(-1)).toBe(LINK);
    expect(situationMessage("remaining", { job: baseJob(), link: LINK })).toBe(
      "안녕하세요, 카페 모라님.\n작업을 시작하기 전에 아래 내용만 이 대화로 보내 주세요. 모르는 건 '모름'이라고 적어 주셔도 괜찮아요.\n[보내 주실 자료]\n- 로고 파일\n[알려 주실 것]\n1. 가장 하고 싶은 일은 무엇인가요?",
    );
  });

  it("링크가 없으면 링크 줄을 빼고 남은 수정 0회면 횟수 안내를 바꾼다", () => {
    const job = withDoneRevision(baseJob(), "r1");
    // 링크를 말하는 문구는 링크가 있을 때만 마지막 줄에 링크를 붙인다.
    for (const situation of ["revision-done", "review", "start"] as const) {
      expect(situationMessage(situation, { job, link: LINK }).split("\n").at(-1)).toBe(LINK);
    }
    expect(situationMessage("revision-done", { job, link: LINK })).toContain("포함 수정 2회 중 1회를 썼고, 남은 수정은 1회예요.");
    expect(situationMessage("review", { job, link: LINK })).toContain("남은 포함 수정은 1회예요.");

    // 링크가 꺼졌거나 저장 중이면(link=null) 링크 줄도, '링크' 말도 없다. 대신 이 대화로 받는다.
    for (const situation of ALL) {
      const message = situationMessage(situation, { job, link: null });
      expect(message).not.toContain("http");
      expect(message).not.toContain("링크");
    }
    expect(situationMessage("revision-done", { job, link: null })).toContain("이 대화로 한 번에 말씀해 주세요.");
    expect(situationMessage("review", { job, link: null })).toContain("이 대화로 한 번에 말씀해 주세요.");
    expect(situationMessage("start", { job, link: null })).toContain("Basic 홈페이지 작업의 수정 요청은 이 대화로 한 번에 모아 주세요.");

    // 완료한 일감은 고객 링크가 서버에서 막히므로 링크를 넘겨도 넣지 않는다.
    for (const situation of ALL) {
      expect(situationMessage(situation, { job: { ...job, status: "completed" }, link: LINK })).not.toContain(LINK);
    }

    // 포함 수정을 다 쓴 주문: "1회씩 세요"·"링크에 남겨 주세요" 대신 추가 작업으로 따로 말한다.
    const used = withDoneRevision(job, "r2");
    for (const situation of ALL) {
      const message = situationMessage(situation, { job: used, link: LINK });
      expect(message).not.toContain("1회씩 세요");
    }
    for (const situation of ["revision-done", "review"] as const) {
      const message = situationMessage(situation, { job: used, link: LINK });
      expect(message).toContain("다음 요청부터는 추가 작업으로 따로 말씀드릴게요.");
      expect(message).not.toMatch(/링크에 한 번에 남겨/);
      expect(message).not.toContain(LINK);
    }
    expect(situationMessage("revision-done", { job: used, link: LINK })).toContain("남은 수정은 0회예요.");
  });

  it("납품 안내는 포함 수정이 남아 있으면 남은 횟수를 알리고, 없으면 지금 문장 그대로 쓴다", () => {
    const lastLine = (job: Job) => situationMessage("delivery", { job, link: LINK }).split("\n").at(-1);
    expect(lastLine(baseJob())).toBe("맡겨 주셔서 감사합니다. 포함 수정이 2회 남아 있으니, 고칠 부분이 보이면 이 대화로 말씀해 주세요.");
    expect(lastLine({ ...withDoneRevision(baseJob(), "r1"), status: "completed" })).toBe(
      "맡겨 주셔서 감사합니다. 포함 수정이 1회 남아 있으니, 고칠 부분이 보이면 이 대화로 말씀해 주세요.",
    );
    // 다 썼거나 포함 수정이 없는 주문은 지금 문장 그대로.
    const used = withDoneRevision(withDoneRevision(baseJob(), "r1"), "r2");
    expect(lastLine(used)).toBe("맡겨 주셔서 감사합니다. 더 필요한 게 생기면 이 대화로 편하게 말씀해 주세요.");
    expect(lastLine(baseJob({ revisionLimit: 0 }))).toBe("맡겨 주셔서 감사합니다. 더 필요한 게 생기면 이 대화로 편하게 말씀해 주세요.");
  });

  it("상황마다 설계의 뜻대로 쓴다", () => {
    const job = baseJob();
    expect(situationMessage("waiting", { job, link: LINK })).toContain("혹시 앞서 여쭤본 내용 보셨을까요?");
    expect(situationMessage("out-of-scope", { job, link: LINK })).toContain("처음 정한 작업 범위 밖이라 추가 작업으로 따로 진행돼요.");
    expect(situationMessage("delivery", { job, link: LINK })).toContain("Basic 홈페이지 작업을 모두 마쳤어요.");
    expect(situationMessage("review", { job, link: LINK })).toContain("작업한 것을 보내 드려요.");
  });
});
