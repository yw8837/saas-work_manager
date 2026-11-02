import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { composeJob, type Job, type PackageTemplate } from "@/lib/domain";
import { ClientMessages } from "./client-messages";

const LINK = "https://ilgam.example/r/token_cm";
const TODAY = "2026-11-02";
const writeText = vi.fn<(value: string) => Promise<void>>();

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

function job(overrides: Partial<Job> = {}): Job {
  return {
    ...composeJob({ jobId: "job_cm", revisionPortalToken: "token_cm", clientLabel: "카페 모라", startDate: "2026-10-30", package: template, now: "2026-10-30T00:00:00.000Z" }),
    ...overrides,
  };
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
    expect(chips.map((chip) => chip.textContent)).toEqual(["남은 것 요청", "시안 확인 부탁", "시작 안내"]);
    expect(screen.getByTestId("client-message-chip-remaining")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("client-message-chip-start")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("client-message-chip-delivery")).not.toBeInTheDocument();
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
    expect(preview).toHaveTextContent("Basic 홈페이지 작업의 수정 요청은 아래 링크에 한 번에 남겨주세요.");
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

  it("보낼 상황이 없으면 그리지 않는다", () => {
    const { container } = render(<ClientMessages job={job({ status: "archived" })} link={LINK} today={TODAY} />);
    expect(container).toBeEmptyDOMElement();
  });
});
