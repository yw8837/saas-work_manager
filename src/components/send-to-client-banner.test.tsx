import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("링크를 복사하면 주소를 그대로 복사하고 첫 실행 3단계 표시를 남긴다", async () => {
    writeText.mockResolvedValue();
    renderBanner();
    expect(screen.getByRole("heading", { name: /이제 고객에게 보내세요/ })).toBeInTheDocument();
    expect(screen.getByTestId("send-to-client-link")).toHaveValue(LINK);

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

  it("자동 복사가 막히면 안내를 띄우고 주소 칸을 선택해 직접 복사하게 한다", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 0; });
    renderBanner();
    const input = screen.getByTestId("send-to-client-link") as HTMLInputElement;

    await act(async () => { fireEvent.click(screen.getByTestId("send-copy-link")); });
    expect(screen.getByRole("alert")).toHaveTextContent("자동 복사를 막았어요");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(LINK.length);
    expect(storage.getItem(FIRST_RUN_STORAGE_KEY)).toBeNull();
    frame.mockRestore();
  });

  it("저장이 끝나기 전에는 보낼 수 없고 이유를 보여 준다", () => {
    renderBanner({ ready: false });
    expect(screen.getByTestId("send-copy-link")).toBeDisabled();
    expect(screen.getByTestId("send-copy-message")).toBeDisabled();
    expect(screen.queryByTestId("send-preview")).not.toBeInTheDocument();
    expect(screen.getByText("저장이 끝나면 보낼 수 있어요.")).toBeInTheDocument();
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
