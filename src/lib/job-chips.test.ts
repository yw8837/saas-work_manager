import { describe, expect, it } from "vitest";
import { composeJob, type Job, type PackageTemplate, type Revision } from "@/lib/domain";
import { hasMaterialWaiting, isNearRevisionLimit, jobChips } from "./job-chips";

const TODAY = "2026-11-03";
const pkg: PackageTemplate = {
  id: "pkg", name: "Basic", price: 500_000, estimatedCost: 0, durationDays: 7, revisionLimit: 2,
  tasks: [{ taskKey: "brief", title: "의뢰서 확인", relativeDay: 0, order: 0 }],
};

function job(overrides: Partial<Job> = {}): Job {
  return { ...composeJob({ jobId: "j1", clientLabel: "카페 모라", startDate: "2026-11-01", package: pkg, now: "2026-11-01T00:00:00.000Z" }), ...overrides };
}

function revision(id: string, usage: Revision["usage"]): Revision {
  return { id, jobId: "j1", source: "public", body: "요청", status: "new", usage, sequence: null, submittedAt: "2026-11-02T00:00:00Z" };
}

describe("일감 상태 칩(알약)", () => {
  it("주 상태: 완료(초록) > 고객 대기(주황) > 지연(빨강) > 작업 중(파랑)", () => {
    expect(jobChips(job({ status: "completed", dueDate: "2026-10-01" }), TODAY).status).toEqual({ label: "완료", tone: "green" });
    const waiting = job();
    waiting.tasks = waiting.tasks.map((task) => ({ ...task, status: "waiting" as const }));
    expect(jobChips(waiting, TODAY).status).toEqual({ label: "고객 대기", tone: "amber" });
    expect(jobChips(job({ dueDate: "2026-11-02" }), TODAY).status).toEqual({ label: "지연", tone: "red" });
    expect(jobChips(job({ dueDate: "2026-11-03" }), TODAY).status).toEqual({ label: "작업 중", tone: "blue" });
  });

  it("수정 n/m: 쓴 횟수/포함 횟수, 거의 다 쓰면 주황, 끝난 일감은 회색", () => {
    expect(jobChips(job(), TODAY).revision).toEqual({ label: "수정 0/2", tone: "blue" });
    expect(jobChips(job({ revisions: [revision("r1", "used")] }), TODAY).revision).toEqual({ label: "수정 1/2", tone: "amber" });
    expect(jobChips(job({ status: "completed", revisions: [revision("r1", "used")] }), TODAY).revision).toEqual({ label: "수정 1/2", tone: "gray" });
  });

  it("덧붙는 칩: 받을 자료·답이 남으면 자료 대기, 고객 요청이 확인 대기면 확인 대기 n건(둘 다 주황, 진행 중 일감만)", () => {
    const busy = job({
      intakeItems: [{ id: "i1", label: "로고 파일" }],
      revisions: [revision("r1", "pending"), revision("r2", "pending")],
    });
    expect(jobChips(busy, TODAY).extras).toEqual([
      { label: "자료 대기", tone: "amber" },
      { label: "확인 대기 2건", tone: "amber" },
    ]);
    expect(jobChips({ ...busy, status: "completed" }, TODAY).extras).toEqual([]);
    expect(jobChips(job(), TODAY).extras).toEqual([]);
  });
});

describe("오늘 화면과 같은 기준", () => {
  it("자료 대기: 못 받은 자료나 답 못 받은 질문이 남은 진행 중 일감", () => {
    expect(hasMaterialWaiting(job({ intakeItems: [{ id: "i1", label: "사진", receivedAt: "2026-11-01T00:00:00Z" }], briefQuestions: [] }))).toBe(false);
    expect(hasMaterialWaiting(job({ briefQuestions: [{ id: "q1", question: "목적은?" }] }))).toBe(true);
    expect(hasMaterialWaiting(job({ status: "completed", briefQuestions: [{ id: "q1", question: "목적은?" }] }))).toBe(false);
  });

  it("수정 거의 다 씀: 수정을 쓰기 시작했고(추가 작업 포함) 남은 수정이 1회 이하인 진행 중 일감", () => {
    expect(isNearRevisionLimit(job())).toBe(false);
    expect(isNearRevisionLimit(job({ revisions: [revision("r1", "used")] }))).toBe(true);
    expect(isNearRevisionLimit(job({ revisionLimit: 0, revisions: [revision("r1", "extra_scope")] }))).toBe(true);
    expect(isNearRevisionLimit(job({ status: "completed", revisions: [revision("r1", "used")] }))).toBe(false);
  });
});
