import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

import { completeRevision, composeJob, recordRevision, type PackageTemplate } from "@/lib/domain";
import { JobDetail } from "./job-detail";
import { useWorkspace } from "./workspace-provider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./workspace-provider", async () => {
  const actual = await vi.importActual<typeof import("./workspace-provider")>("./workspace-provider");
  return { ...actual, useWorkspace: vi.fn() };
});

const template: PackageTemplate = {
  id: "pkg_send",
  name: "보내기 패키지",
  price: 500_000,
  estimatedCost: 0,
  durationDays: 5,
  revisionLimit: 2,
  tasks: [{ taskKey: "brief", title: "브리프 확인", relativeDay: 0, order: 0 }],
};

function job(enabled = true, usedRevisions = 0) {
  let composed = composeJob({ jobId: "job_send", revisionPortalToken: "token_send", clientLabel: "보내기 고객", startDate: "2026-10-30", package: template, now: "2026-10-30T00:00:00.000Z" });
  // 수정 횟수는 작업자가 '수정 완료'를 눌러야 쓰인다. 접수만 한 요청은 남은 횟수를 줄이지 않는다.
  for (let index = 0; index < usedRevisions; index += 1) {
    const recorded = recordRevision(composed, { source: "public", body: `수정 요청 ${index + 1}`, submittedAt: `2026-10-31T0${index}:00:00.000Z` });
    composed = completeRevision(recorded.job, recorded.revision.id, `2026-10-31T0${index}:30:00.000Z`);
  }
  return { ...composed, revisionPortalEnabled: enabled };
}

function renderAt(url: string, options: { runtimeMode?: "local" | "hosted"; saveStatus?: "saved" | "saving"; enabled?: boolean; usedRevisions?: number } = {}) {
  jsdom.reconfigure({ url });
  vi.mocked(useWorkspace).mockReturnValue({
    jobs: [job(options.enabled ?? true, options.usedRevisions ?? 0)],
    hydrated: true,
    runtimeMode: options.runtimeMode ?? "hosted",
    saveStatus: options.saveStatus ?? "saved",
  } as unknown as ReturnType<typeof useWorkspace>);
  return render(<JobDetail jobId="job_send" />);
}

const originalUrl = window.location.href;
afterEach(() => {
  jsdom.reconfigure({ url: originalUrl });
});

describe("일감 저장 직후 상세", () => {
  it("?created=1이면 헤더 바로 아래에 보내기 안내를 띄우고 실제 고객 링크를 담는다", () => {
    renderAt("https://ilgam.example/jobs/job_send?created=1");
    const banner = screen.getByTestId("send-to-client-banner");
    expect(screen.getByTestId("send-to-client-link")).toHaveValue("https://ilgam.example/r/token_send");
    // 모바일에서도 첫 화면에 보이도록 핵심 정보 띠보다 앞에 둔다.
    const rail = screen.getByRole("region", { name: "일감 핵심 정보" });
    expect(banner.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("send-copy-link")).toBeEnabled();
  });

  it("체크리스트에서 온 ?send=1도 같은 안내를 띄운다", () => {
    renderAt("https://ilgam.example/jobs/job_send?send=1");
    expect(screen.getByTestId("send-to-client-banner")).toBeInTheDocument();
  });

  // 일감의 실제 남은 횟수가 카톡 문구까지 전달돼야 다 쓴 주문에 "1회씩 세요"라고 보내지 않는다.
  it("포함 수정을 다 쓴 일감이면 카톡 문구가 추가 작업으로 따로 말한다고 쓴다", () => {
    renderAt("https://ilgam.example/jobs/job_send?send=1", { usedRevisions: 2 });
    const preview = screen.getByTestId("send-message-preview");
    expect(preview).toHaveTextContent("포함된 수정 2회를 모두 써서, 새 요청은 추가 작업으로 따로 말씀드릴게요.");
    expect(preview).not.toHaveTextContent("1회씩 세요");
  });

  it("남은 수정이 있는 일감이면 카톡 문구가 '수정을 마칠 때마다 1회씩 세요'라고 쓴다", () => {
    renderAt("https://ilgam.example/jobs/job_send?send=1", { usedRevisions: 1 });
    const preview = screen.getByTestId("send-message-preview");
    expect(preview).toHaveTextContent("제가 수정을 마칠 때마다 1회씩 세요.");
  });

  it("표시가 없으면 띄우지 않는다", () => {
    renderAt("https://ilgam.example/jobs/job_send");
    expect(screen.queryByTestId("send-to-client-banner")).not.toBeInTheDocument();
  });

  it("서버 저장 중이거나 링크가 꺼져 있으면 보내기를 막고 이유를 말한다", () => {
    renderAt("https://ilgam.example/jobs/job_send?created=1", { saveStatus: "saving" });
    expect(screen.getByTestId("send-copy-link")).toBeDisabled();
    expect(screen.getByText(/저장이 끝나면 보낼 수 있어요/)).toBeInTheDocument();
  });

  it("닫으면 사라지고 주소의 표시만 지운다(목록 복귀 정보는 남김)", () => {
    renderAt("https://ilgam.example/jobs/job_send?list=%2Fjobs%3Ffilter%3Dactive&created=1");
    fireEvent.click(screen.getByRole("button", { name: "고객에게 보내기 안내 닫기" }));
    expect(screen.queryByTestId("send-to-client-banner")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?list=%2Fjobs%3Ffilter%3Dactive");
  });
});

// 무기 2 '시작 안내 한 방': 받을 자료와 착수 전 질문을 카톡 문구 하나로 보내고, 작업자는 옮겨 적지 않고 체크만 한다.
describe("시작 전 받을 자료·착수 전 질문", () => {
  const briefTemplate: PackageTemplate = {
    ...template,
    intakeItems: ["로고 원본 파일"],
    briefQuestions: ["이 작업으로 가장 하고 싶은 일은 무엇인가요?", "참고 예시가 있나요?"],
  };

  function renderBrief(url: string, answerFirst = false) {
    jsdom.reconfigure({ url });
    const toggleBriefQuestion = vi.fn();
    const updateBriefNote = vi.fn();
    let composed = composeJob({ jobId: "job_send", revisionPortalToken: "token_send", clientLabel: "보내기 고객", startDate: "2026-10-30", package: briefTemplate, now: "2026-10-30T00:00:00.000Z" });
    if (answerFirst) composed = toggleBriefQuestion_(composed);
    vi.mocked(useWorkspace).mockReturnValue({
      jobs: [{ ...composed, revisionPortalEnabled: true }],
      hydrated: true,
      runtimeMode: "hosted",
      saveStatus: "saved",
      toggleBriefQuestion,
      updateBriefNote,
    } as unknown as ReturnType<typeof useWorkspace>);
    render(<JobDetail jobId="job_send" />);
    return { toggleBriefQuestion, updateBriefNote };
  }

  function toggleBriefQuestion_(composed: ReturnType<typeof composeJob>) {
    return { ...composed, briefQuestions: composed.briefQuestions!.map((item, index) => (index === 0 ? { ...item, answeredAt: "2026-10-30T01:00:00.000Z" } : item)) };
  }

  it("보내기 카톡 문구에 아직 못 받은 자료와 질문이 들어가고, 답 받은 질문은 빠진다", () => {
    renderBrief("https://ilgam.example/jobs/job_send?send=1");
    const preview = screen.getByTestId("send-message-preview");
    expect(preview).toHaveTextContent("[보내 주실 자료] - 로고 원본 파일 [알려 주실 것] 1. 이 작업으로 가장 하고 싶은 일은 무엇인가요? 2. 참고 예시가 있나요?");
    cleanup();
    renderBrief("https://ilgam.example/jobs/job_send?send=1", true);
    const answered = screen.getByTestId("send-message-preview");
    expect(answered).toHaveTextContent("[알려 주실 것] 1. 참고 예시가 있나요?");
    expect(answered).not.toHaveTextContent("가장 하고 싶은 일");
  });

  it("질문 체크는 답 받음으로 저장하고, 메모는 칸을 벗어날 때만 저장한다", () => {
    const { toggleBriefQuestion, updateBriefNote } = renderBrief("https://ilgam.example/jobs/job_send");
    expect(screen.getByTestId("brief-section")).toHaveTextContent("0/2 답 받음");
    fireEvent.click(screen.getByTestId("brief-toggle-job_send_brief_1"));
    expect(toggleBriefQuestion).toHaveBeenCalledWith("job_send", "job_send_brief_1");
    const note = screen.getByTestId("brief-note-job_send_brief_2");
    fireEvent.change(note, { target: { value: "인스타 계정 참고" } });
    expect(updateBriefNote).not.toHaveBeenCalled();
    fireEvent.blur(note);
    expect(updateBriefNote).toHaveBeenCalledWith("job_send", "job_send_brief_2", "인스타 계정 참고");
  });

  // 남은 것 다시 보내기는 '고객에게 보낼 말'의 '남은 것 요청' 칩으로 옮겼다(복사 버튼이 두 군데 생기지 않게).
  it("'고객에게 보낼 말'의 남은 것 요청은 인사와 남은 자료·질문만 복사하고, 복사가 막히면 문구를 그대로 보여 준다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderBrief("https://ilgam.example/jobs/job_send");
    // 착수 전 질문 구획에는 따로 복사 버튼을 두지 않는다.
    expect(within(screen.getByTestId("brief-section")).queryByRole("button", { name: /복사/ })).not.toBeInTheDocument();
    // 아직 못 받은 자료·질문이 있으면 '남은 것 요청'이 처음부터 골라져 있다.
    expect(screen.getByTestId("client-message-chip-remaining")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("client-message-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe(
      "안녕하세요, 보내기 고객님.\n작업을 시작하기 전에 아래 내용만 이 대화로 보내 주세요. 모르는 건 '모름'이라고 적어 주셔도 괜찮아요.\n[보내 주실 자료]\n- 로고 원본 파일\n[알려 주실 것]\n1. 이 작업으로 가장 하고 싶은 일은 무엇인가요?\n2. 참고 예시가 있나요?",
    );
    await waitFor(() => expect(screen.getByTestId("client-message-copy")).toHaveTextContent("복사했어요"));

    cleanup();
    writeText.mockRejectedValueOnce(new Error("blocked"));
    renderBrief("https://ilgam.example/jobs/job_send");
    fireEvent.click(screen.getByTestId("client-message-copy"));
    await waitFor(() => expect(screen.getByTestId("client-message-text")).toHaveValue(writeText.mock.calls[0][0]));
  });

  it("안내 띠를 닫아도 '고객에게 보낼 말'에서 같은 시작 안내 문구를 다시 복사할 수 있다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderBrief("https://ilgam.example/jobs/job_send?created=1");
    const bannerMessage = screen.getByTestId("send-message-preview").textContent;
    fireEvent.click(screen.getByRole("button", { name: "고객에게 보내기 안내 닫기" }));
    expect(screen.queryByTestId("send-to-client-banner")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("client-message-chip-start"));
    expect(screen.getByTestId("client-message-preview").textContent).toBe(bannerMessage);
    fireEvent.click(screen.getByTestId("client-message-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(bannerMessage));
  });
});
