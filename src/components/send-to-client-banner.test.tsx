import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRST_RUN_STORAGE_KEY } from "@/lib/first-run";
import { SendToClientBanner } from "./send-to-client-banner";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const LINK = "https://ilgam.example/r/token_abc";
let storage: MemoryStorage;
const writeText = vi.fn<(value: string) => Promise<void>>();

function renderBanner(overrides: Partial<Parameters<typeof SendToClientBanner>[0]> = {}) {
  const onDismiss = vi.fn();
  render(
    <SendToClientBanner
      link={LINK}
      clientLabel="모라스튜디오"
      title="브랜드 사이트"
      included={2}
      ready
      pendingMessage="저장이 끝나면 보낼 수 있어요."
      localOnly={false}
      onDismiss={onDismiss}
      {...overrides}
    />,
  );
  return { onDismiss };
}

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("저장 직후 고객에게 보내기", () => {
  it("주 버튼은 카톡 문구 복사이고 문구 미리보기가 처음부터 보인다", () => {
    renderBanner();
    const messageButton = screen.getByTestId("send-copy-message");
    const linkButton = screen.getByTestId("send-copy-link");
    expect(messageButton).toHaveClass("primaryButton");
    expect(messageButton).toHaveTextContent("카톡 문구 복사");
    expect(linkButton).toHaveClass("secondaryButton");
    expect(linkButton).toHaveTextContent("링크만 복사");
    // 버튼 순서: 카톡 문구 복사(주) → 링크만 복사 → 고객 화면 미리보기
    expect(messageButton.compareDocumentPosition(linkButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(linkButton.compareDocumentPosition(screen.getByTestId("send-preview")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const preview = screen.getByTestId("send-message-preview");
    expect(preview).toBeVisible();
    expect(preview).toHaveTextContent("안녕하세요, 모라스튜디오님.");
    expect(preview).toHaveTextContent(LINK);
    expect(document.querySelector("details")).toBeNull();
  });

  it("주 버튼이 문구라서 링크 설명 줄과 긴 주소 칸은 처음부터 보이지 않는다", () => {
    renderBanner();
    expect(screen.queryByTestId("send-to-client-link")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("send-to-client-banner")).not.toHaveTextContent("로그인 없이 수정 요청을 남기고");
  });

  it("링크를 복사하면 주소를 그대로 복사하고 첫 실행 3단계 표시를 남긴다", async () => {
    writeText.mockResolvedValue();
    renderBanner();
    expect(screen.getByRole("heading", { name: /이제 고객에게 보내세요/ })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("send-copy-link"));
    await waitFor(() => expect(screen.getByTestId("send-copy-link")).toHaveTextContent("링크를 복사했어요"));
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(JSON.parse(storage.getItem(FIRST_RUN_STORAGE_KEY) ?? "{}").linkShared).toBe(true);
  });

  it("카톡 문구에는 링크가 들어가고 금액은 없다", async () => {
    writeText.mockResolvedValue();
    renderBanner();
    fireEvent.click(screen.getByTestId("send-copy-message"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain("모라스튜디오님");
    expect(copied).toContain(LINK);
    expect(copied).not.toMatch(/원|₩/);
  });

  it("자동 복사가 막히면 안내를 띄우고 그때 주소 칸을 보여 선택해 두어 직접 복사하게 한다", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 0; });
    renderBanner();
    expect(screen.queryByTestId("send-to-client-link")).not.toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByTestId("send-copy-link")); });
    const input = screen.getByTestId("send-to-client-link") as HTMLInputElement;
    expect(input).toHaveValue(LINK);
    expect(screen.getByRole("alert")).toHaveTextContent("자동 복사를 막았어요");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(LINK.length);
    expect(storage.getItem(FIRST_RUN_STORAGE_KEY)).toBeNull();
    frame.mockRestore();
  });

  it("카톡 문구 복사가 막히면 문구 글을 선택해 둔다", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 0; });
    renderBanner();
    const message = screen.getByTestId("send-message-preview").textContent ?? "";
    expect(screen.queryByTestId("send-message-text")).not.toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByTestId("send-copy-message")); });
    expect(screen.getByRole("alert")).toHaveTextContent("자동 복사를 막았어요");
    const text = screen.getByTestId("send-message-text") as HTMLTextAreaElement;
    expect(text).toBeVisible();
    expect(text).toHaveAttribute("readonly");
    expect(text).toHaveValue(message);
    // 링크 칸이 아니라 문구 글을 선택해 둔다.
    expect(document.activeElement).toBe(text);
    expect(text.selectionStart).toBe(0);
    expect(text.selectionEnd).toBe(message.length);
    expect(storage.getItem(FIRST_RUN_STORAGE_KEY)).toBeNull();
    frame.mockRestore();
  });

  it("카톡 문구나 링크를 복사하면 시작 안내를 보낸 것으로 알린다", async () => {
    const onShared = vi.fn();
    writeText.mockResolvedValue();
    renderBanner({ onShared });
    fireEvent.click(screen.getByTestId("send-copy-message"));
    await waitFor(() => expect(onShared).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("send-copy-link"));
    await waitFor(() => expect(onShared).toHaveBeenCalledTimes(2));
  });

  it("복사가 막혔거나 저장이 끝나기 전이면 보낸 것으로 알리지 않는다", async () => {
    const onShared = vi.fn();
    writeText.mockRejectedValue(new Error("denied"));
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 0; });
    renderBanner({ onShared });
    await act(async () => { fireEvent.click(screen.getByTestId("send-copy-message")); });
    expect(screen.getByRole("alert")).toHaveTextContent("자동 복사를 막았어요");
    frame.mockRestore();
    cleanup();

    renderBanner({ onShared, ready: false });
    fireEvent.click(screen.getByTestId("send-copy-message"));
    fireEvent.click(screen.getByTestId("send-copy-link"));
    expect(onShared).not.toHaveBeenCalled();
  });

  it("저장이 끝나기 전에는 보낼 수 없고 이유를 보여 준다", () => {
    renderBanner({ ready: false });
    expect(screen.getByTestId("send-copy-link")).toBeDisabled();
    expect(screen.getByTestId("send-copy-message")).toBeDisabled();
    expect(screen.queryByTestId("send-preview")).not.toBeInTheDocument();
    expect(screen.getByText("저장이 끝나면 보낼 수 있어요.")).toBeInTheDocument();
  });

  it("남은 포함 수정이 없는 일감이면 카톡 문구가 '1회씩 세요'가 아니라 추가 작업으로 따로 말한다고 쓴다", () => {
    renderBanner({ included: 2, remaining: 0 });
    const preview = screen.getByTestId("send-message-preview");
    expect(preview).toHaveTextContent("포함된 수정 2회를 모두 써서, 새 요청은 추가 작업으로 따로 말씀드릴게요.");
    expect(preview).not.toHaveTextContent("1회씩 세요");
  });

  it("고객 화면 미리보기는 새 탭으로 같은 링크를 열고, 닫기를 누르면 알린다", () => {
    const { onDismiss } = renderBanner();
    const preview = screen.getByTestId("send-preview");
    expect(preview).toHaveAttribute("href", LINK);
    expect(preview).toHaveAttribute("target", "_blank");
    fireEvent.click(screen.getByRole("button", { name: "고객에게 보내기 안내 닫기" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
