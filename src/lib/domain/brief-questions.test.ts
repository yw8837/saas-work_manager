import { describe, expect, it } from "vitest";

import {
  BRIEF_NOTE_MAX,
  composeJob,
  DEFAULT_BRIEF_QUESTIONS,
  normalizeBriefQuestions,
  pendingBriefQuestions,
  setBriefQuestionNote,
  toggleBriefQuestion,
  type PackageTemplate,
} from "@/lib/domain";

const template: PackageTemplate = {
  id: "pkg_brief",
  name: "질문 패키지",
  price: 300_000,
  estimatedCost: 0,
  durationDays: 3,
  revisionLimit: 1,
  tasks: [{ taskKey: "start", title: "시작", relativeDay: 0, order: 0 }],
  briefQuestions: ["하고 싶은 일은?", "참고 예시는?"],
};

function job(overrides: Partial<PackageTemplate> = {}) {
  return composeJob({ jobId: "job_b", clientLabel: "고객", startDate: "2026-11-02", package: { ...template, ...overrides }, now: "2026-11-02T00:00:00.000Z" });
}

describe("착수 전 질문", () => {
  it("빈 줄·중복을 빼고 질문은 80자, 목록은 5개까지 남긴다", () => {
    const long = "가".repeat(90);
    expect(normalizeBriefQuestions([" 하나 ", "", "하나", "둘", long, "넷", "다섯", "여섯", 7])).toEqual(["하나", "둘", "가".repeat(80), "넷", "다섯"]);
    expect(normalizeBriefQuestions("문자열")).toEqual([]);
  });

  it("기본 질문 3개는 업무 용어 없이 목적·예시·넣고 뺄 것을 묻고, 각각 80자 안이다", () => {
    expect(DEFAULT_BRIEF_QUESTIONS).toHaveLength(3);
    expect(DEFAULT_BRIEF_QUESTIONS.every((question) => question.length <= 80)).toBe(true);
    expect(normalizeBriefQuestions([...DEFAULT_BRIEF_QUESTIONS])).toEqual([...DEFAULT_BRIEF_QUESTIONS]);
  });

  it("일감을 만들 때 패키지 질문을 복사하고, 질문이 없으면 칸을 만들지 않는다", () => {
    expect(job().briefQuestions).toEqual([
      { id: "job_b_brief_1", question: "하고 싶은 일은?" },
      { id: "job_b_brief_2", question: "참고 예시는?" },
    ]);
    expect("briefQuestions" in job({ briefQuestions: undefined })).toBe(false);
  });

  it("답 받음을 체크하면 남은 질문에서 빠지고, 다시 누르면 돌아오며 메모는 그대로다", () => {
    let current = setBriefQuestionNote(job(), "job_b_brief_1", " 예약 받기 ", "2026-11-02T01:00:00.000Z");
    current = toggleBriefQuestion(current, "job_b_brief_1", "2026-11-02T02:00:00.000Z");
    expect(pendingBriefQuestions(current)).toEqual(["참고 예시는?"]);
    expect(current.briefQuestions?.[0]).toEqual({ id: "job_b_brief_1", question: "하고 싶은 일은?", note: "예약 받기", answeredAt: "2026-11-02T02:00:00.000Z" });
    current = toggleBriefQuestion(current, "job_b_brief_1", "2026-11-02T03:00:00.000Z");
    expect(pendingBriefQuestions(current)).toEqual(["하고 싶은 일은?", "참고 예시는?"]);
    expect(current.briefQuestions?.[0]).toEqual({ id: "job_b_brief_1", question: "하고 싶은 일은?", note: "예약 받기" });
  });

  it("메모는 300자로 자르고, 비우면 지우고, 없는 질문은 건드리지 않는다", () => {
    const base = job();
    const long = setBriefQuestionNote(base, "job_b_brief_2", "나".repeat(400));
    expect(long.briefQuestions?.[1].note).toHaveLength(BRIEF_NOTE_MAX);
    expect(setBriefQuestionNote(long, "job_b_brief_2", "  ").briefQuestions?.[1]).toEqual({ id: "job_b_brief_2", question: "참고 예시는?" });
    expect(setBriefQuestionNote(base, "없는_질문", "메모")).toBe(base);
    expect(toggleBriefQuestion(base, "없는_질문")).toBe(base);
  });
});
