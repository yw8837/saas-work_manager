import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { completeRevision, composeJob, markStartShared, recordRevision, toggleIntakeItem, updateTaskStatus, type Job, type PackageTemplate } from "@/lib/domain";
import { ClientMessages } from "./client-messages";

const LINK = "https://ilgam.example/r/token_cm";
const TODAY = "2026-11-02";
// 이 기기 시간대와 상관없이 TODAY에 드는 시각(로컬 정오).
const TODAY_NOON = new Date(2026, 10, 2, 12, 0, 0).toISOString();
const writeText = vi.fn<(value: string) => Promise<void>>();

const chipLabels = () => within(screen.getByRole("group", { name: "보낼 상황" })).getAllByRole("button").map((chip) => chip.textContent);

const template: PackageTemplate = {
  id: "pkg_cm",
  name: "Basic 홈페이지",
  price: 790_000,
  estimatedCost: 95_000,
  durationDays: 7,
  revisionLimit: 2,
  tasks: [{ taskKey: "brief", title: "요청서 확인", relativeDay: 0, order: 0 }],
  intakeItems: ["로고 파일"],
};

/** 시작 안내를 이미 보낸 일감. 안 보낸 일감은 `notSentYet()`으로 만든다. */
function job(overrides: Partial<Job> = {}): Job {
  return {
    ...composeJob({ jobId: "job_cm", revisionPortalToken: "token_cm", clientLabel: "카페 모라", startDate: "2026-10-30", package: template, now: "2026-10-30T00:00:00.000Z" }),
    startSharedAt: "2026-10-30T00:10:00.000Z",
    ...overrides,
  };
}

function notSentYet(): Job {
  const copy = job();
  delete copy.startSharedAt;
  return copy;
}

beforeEach(() => {
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("고객에게 보낼 말", () => {
  it("지금 상태에 맞는 칩만 보이고 첫 칩이 골라져 있다", () => {
    render(<ClientMessages job={job()} link={LINK} today={TODAY} />);
    expect(screen.getByRole("heading", { name: "고객에게 보낼 말" })).toBeInTheDocument();
    const chips = within(screen.getByRole("group", { name: "보낼 상황" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["남은 것 요청", "시안 확인 부탁", "시작 안내", "납품 안내"]);
    expect(screen.getByTestId("client-message-chip-remaining")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "false");
    // 납품 안내는 완료 전에도 보이지만 기본으로 골라져 있지 않다.
    expect(screen.getByTestId("client-message-chip-delivery")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("client-message-preview")).toHaveTextContent("[보내 주실 자료] - 로고 파일");
  });

  it("'문구 복사'는 구획 머리 오른쪽에 있어 머리가 보이면 복사도 보인다", () => {
    render(<ClientMessages job={job()} link={LINK} today={TODAY} />);
    const copy = screen.getByTestId("client-message-copy");
    const headingRow = screen.getByRole("heading", { name: "고객에게 보낼 말" }).closest(".sectionHeadingRow");
    expect(headingRow).toContainElement(copy);
    // 칩·말풍선보다 앞에 둔다.
    expect(copy.compareDocumentPosition(screen.getByRole("group", { name: "보낼 상황" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(copy.compareDocumentPosition(screen.getByTestId("client-message-preview")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("칩을 누르면 미리보기가 바뀐다", () => {
    render(<ClientMessages job={job()} link={LINK} today={TODAY} />);
    fireEvent.click(screen.getByTestId("client-message-chip-start"));
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("client-message-chip-remaining")).toHaveAttribute("aria-pressed", "false");
    const preview = screen.getByTestId("client-message-preview");
    expect(preview).toHaveTextContent("Basic 홈페이지 작업은 11월 6일 완성 예정이에요.");
    expect(preview).toHaveTextContent("수정 요청은 아래 링크에 한 번에 남겨 주세요.");
    expect(preview).toHaveTextContent(LINK);
  });

  it("문구 복사는 미리보기 글을 그대로 클립보드에 쓴다", async () => {
    writeText.mockResolvedValue();
    render(<ClientMessages job={job()} link={LINK} today={TODAY} />);
    fireEvent.click(screen.getByTestId("client-message-chip-review"));
    const shown = screen.getByTestId("client-message-preview").textContent;
    fireEvent.click(screen.getByTestId("client-message-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(shown);
    await waitFor(() => expect(screen.getByTestId("client-message-copy")).toHaveTextContent("복사했어요"));
  });

  it("클립보드가 막히면 읽기 전용 글상자에 문구를 선택해 둔다", async () => {
    writeText.mockRejectedValue(new Error("blocked"));
    render(<ClientMessages job={job()} link={LINK} today={TODAY} />);
    const shown = screen.getByTestId("client-message-preview").textContent ?? "";
    await act(async () => { fireEvent.click(screen.getByTestId("client-message-copy")); });
    expect(screen.getByRole("alert")).toHaveTextContent("자동 복사를 막았어요");
    const text = screen.getByTestId("client-message-text") as HTMLTextAreaElement;
    expect(text).toBeVisible();
    expect(text).toHaveAttribute("readonly");
    expect(text).toHaveValue(shown);
    expect(document.activeElement).toBe(text);
    expect(text.selectionStart).toBe(0);
    expect(text.selectionEnd).toBe(shown.length);
  });

  it("링크가 없으면 문구에 링크를 넣지 않는다", () => {
    render(<ClientMessages job={job()} link={null} today={TODAY} />);
    fireEvent.click(screen.getByTestId("client-message-chip-start"));
    expect(screen.getByTestId("client-message-preview")).not.toHaveTextContent("http");
  });

  it("시작 안내를 아직 안 보낸 일감은 '시작 안내'가 처음부터 골라져 있다", () => {
    render(<ClientMessages job={notSentYet()} link={LINK} today={TODAY} />);
    const chips = within(screen.getByRole("group", { name: "보낼 상황" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["시작 안내", "남은 것 요청", "시안 확인 부탁", "납품 안내"]);
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("client-message-preview")).toHaveTextContent("수정 요청은 아래 링크에 한 번에 남겨 주세요.");
  });

  it("'시작 안내'를 복사했을 때만 보낸 것으로 알린다(다른 칩·복사 실패는 알리지 않는다)", async () => {
    const onStartShared = vi.fn();
    writeText.mockResolvedValue();
    const view = render(<ClientMessages job={notSentYet()} link={LINK} today={TODAY} onStartShared={onStartShared} />);
    fireEvent.click(screen.getByTestId("client-message-chip-remaining"));
    fireEvent.click(screen.getByTestId("client-message-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(onStartShared).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("client-message-chip-start"));
    fireEvent.click(screen.getByTestId("client-message-copy"));
    await waitFor(() => expect(onStartShared).toHaveBeenCalledTimes(1));
    view.unmount();

    writeText.mockRejectedValue(new Error("blocked"));
    render(<ClientMessages job={notSentYet()} link={LINK} today={TODAY} onStartShared={onStartShared} />);
    await act(async () => { fireEvent.click(screen.getByTestId("client-message-copy")); });
    expect(screen.getByTestId("client-message-text")).toBeVisible();
    expect(onStartShared).toHaveBeenCalledTimes(1);
  });

  it("'시작 안내' 기록이 실패해도 복사는 됐으니 '복사했어요'만 보이고 복사 실패 글상자는 안 뜬다", async () => {
    writeText.mockResolvedValue();
    const onStartShared = vi.fn(() => { throw new Error("저장 실패"); });
    render(<ClientMessages job={notSentYet()} link={LINK} today={TODAY} onStartShared={onStartShared} />);
    fireEvent.click(screen.getByTestId("client-message-copy"));
    await waitFor(() => expect(screen.getByTestId("client-message-copy")).toHaveTextContent("복사했어요"));
    expect(onStartShared).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByTestId("client-message-text")).not.toBeInTheDocument();
    expect(screen.getByTestId("client-message-preview")).toBeInTheDocument();
  });

  it("'시작 안내'를 처음 복사해 칩 순서가 바뀌어도, 복사한 칩과 글이 그대로 남는다", async () => {
    writeText.mockResolvedValue();
    // 일감 화면처럼 복사하면 일감에 보낸 시각이 생기고 다시 그린다.
    function Screen() {
      const [current, setCurrent] = useState(notSentYet);
      return (
        <ClientMessages
          job={current}
          link={LINK}
          today={TODAY}
          onStartShared={() => setCurrent((value) => markStartShared(value, "2026-11-02T03:00:00.000Z"))}
        />
      );
    }
    render(<Screen />);
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "true");
    const shown = screen.getByTestId("client-message-preview").textContent;

    fireEvent.click(screen.getByTestId("client-message-copy"));
    await waitFor(() => expect(screen.getByTestId("client-message-copy")).toHaveTextContent("복사했어요"));
    expect(writeText).toHaveBeenCalledWith(shown);
    // 보낸 기록이 생겨 칩은 설계 순서로 돌아가지만, 화면은 방금 복사한 '시작 안내'에 머문다.
    const chips = within(screen.getByRole("group", { name: "보낼 상황" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["남은 것 요청", "시안 확인 부탁", "시작 안내", "납품 안내"]);
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("client-message-chip-remaining")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("client-message-preview").textContent).toBe(shown);
  });

  it("복사해 고정한 칩은 순서만 바뀌면 그대로 두고, 그 뒤 새 상황이 생기면 고정을 풀어 맨 앞 상황으로 돌아간다", async () => {
    writeText.mockResolvedValue();
    const fresh = notSentYet();
    const view = render(<ClientMessages job={fresh} link={LINK} today={TODAY} />);
    fireEvent.click(screen.getByTestId("client-message-copy"));
    await waitFor(() => expect(screen.getByTestId("client-message-copy")).toHaveTextContent("복사했어요"));

    // ① 처음 보낸 기록이 생겨 '시작 안내'가 뒤로 갔다(순서만 바뀜): 복사한 '시작 안내'에 머문다.
    const shared = markStartShared(fresh, "2026-11-02T03:00:00.000Z");
    view.rerender(<ClientMessages job={shared} link={LINK} today={TODAY} />);
    expect(chipLabels()).toEqual(["남은 것 요청", "시안 확인 부탁", "시작 안내", "납품 안내"]);
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "true");

    // ② 오늘 '수정 완료'를 눌러 '수정 반영 알림'이 새로 생겼다: 고정을 풀고 맨 앞 상황을 고른다.
    const revised = completeRevision(
      recordRevision(shared, { revisionId: "r_today", source: "public", body: "사진 교체", submittedAt: TODAY_NOON }).job,
      "r_today",
      TODAY_NOON,
    );
    view.rerender(<ClientMessages job={revised} link={LINK} today={TODAY} />);
    expect(chipLabels()).toEqual(["수정 반영 알림", "남은 것 요청", "시안 확인 부탁", "시작 안내", "납품 안내"]);
    expect(screen.getByTestId("client-message-chip-revision-done")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("client-message-preview")).toHaveTextContent("요청하신 수정을 반영했어요.");

    // 한 번 푼 고정은 그 상황이 다시 사라져도(다음 날) 되살리지 않는다.
    view.rerender(<ClientMessages job={revised} link={LINK} today="2026-11-03" />);
    expect(chipLabels()).toEqual(["남은 것 요청", "시안 확인 부탁", "시작 안내", "납품 안내"]);
    expect(screen.getByTestId("client-message-chip-remaining")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "false");
  });

  it("사용자가 누른 칩도 상황이 줄기만 하면 그대로 두고, 새 상황이 생기면 고정을 풀어 맨 앞 상황으로 돌아간다", () => {
    const sent = job();
    const view = render(<ClientMessages job={sent} link={LINK} today={TODAY} />);
    fireEvent.click(screen.getByTestId("client-message-chip-start"));

    // 받을 자료를 다 받아 '남은 것 요청'이 사라졌다(새 상황 없음): 누른 '시작 안내'에 머문다.
    const received = toggleIntakeItem(sent, sent.intakeItems![0].id, TODAY_NOON);
    view.rerender(<ClientMessages job={received} link={LINK} today={TODAY} />);
    expect(chipLabels()).toEqual(["시안 확인 부탁", "시작 안내", "납품 안내"]);
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "true");

    // 할 일을 '고객 대기'로 바꿔 '답 기다림'이 새로 생겼다: 맨 앞 상황으로 돌아간다.
    const waiting = updateTaskStatus(received, received.tasks[0].id, "waiting", TODAY_NOON);
    view.rerender(<ClientMessages job={waiting} link={LINK} today={TODAY} />);
    expect(chipLabels()).toEqual(["답 기다림", "시안 확인 부탁", "시작 안내", "납품 안내"]);
    expect(screen.getByTestId("client-message-chip-waiting")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "false");
  });

  it("완료한 일감은 '납품 안내'가 맨 앞이고 처음부터 골라져 있다", () => {
    render(<ClientMessages job={job({ status: "completed" })} link={LINK} today={TODAY} />);
    expect(chipLabels()).toEqual(["납품 안내"]);
    expect(screen.getByTestId("client-message-chip-delivery")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("client-message-preview")).toHaveTextContent("작업을 모두 마쳤어요.");
  });

  // 납품 안내는 완료 전에도 있어서 '새 상황'이 아니다. 완료로 맨 앞에 오면 고정을 풀고 납품 안내를 고른다.
  it("다른 칩을 복사해 고정한 뒤 일감을 완료하면 고정을 풀고 '납품 안내'를 고른다", async () => {
    writeText.mockResolvedValue();
    const sent = job();
    const view = render(<ClientMessages job={sent} link={LINK} today={TODAY} />);
    fireEvent.click(screen.getByTestId("client-message-chip-review"));
    fireEvent.click(screen.getByTestId("client-message-copy"));
    await waitFor(() => expect(screen.getByTestId("client-message-copy")).toHaveTextContent("복사했어요"));
    expect(screen.getByTestId("client-message-chip-review")).toHaveAttribute("aria-pressed", "true");

    view.rerender(<ClientMessages job={{ ...sent, status: "completed" }} link={LINK} today={TODAY} />);
    expect(chipLabels()).toEqual(["납품 안내"]);
    expect(screen.getByTestId("client-message-chip-delivery")).toHaveAttribute("aria-pressed", "true");

    // 할 일을 다 끝내 납품 안내가 맨 앞으로 온 경우도 같다.
    const view2 = render(<ClientMessages job={sent} link={LINK} today={TODAY} />);
    fireEvent.click(within(view2.container).getByTestId("client-message-chip-start"));
    const done = updateTaskStatus(sent, sent.tasks[0].id, "done", TODAY_NOON);
    view2.rerender(<ClientMessages job={done} link={LINK} today={TODAY} />);
    expect(within(view2.container).getByTestId("client-message-chip-delivery")).toHaveAttribute("aria-pressed", "true");
  });

  it("보낼 상황이 없으면 그리지 않는다", () => {
    const { container } = render(<ClientMessages job={job({ status: "archived" })} link={LINK} today={TODAY} />);
    expect(container).toBeEmptyDOMElement();
  });
});
