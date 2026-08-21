import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InstallAppCard } from "./install-app-card";

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function makePromptEvent(
  prompt: () => Promise<void>,
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>,
): PromptEvent {
  const event = new Event("beforeinstallprompt") as PromptEvent;
  Object.assign(event, { prompt, userChoice });
  return event;
}

/** 카드가 설치 버튼을 내주는 상태까지 올려놓는다. */
async function renderPromptable(event: PromptEvent) {
  render(<InstallAppCard />);
  // 설치 여부 판정 타이머가 먼저 끝난 뒤에 브라우저가 이벤트를 쏘는 실제 순서를 그대로 따른다.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    window.dispatchEvent(event);
  });
  return screen.getByTestId("install-app");
}

describe("InstallAppCard 설치 버튼 연타", () => {
  it("한 프레임에 두 번 눌러도 prompt는 한 번만 부른다", async () => {
    const prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    let settle: (choice: { outcome: "accepted" | "dismissed" }) => void = () => {};
    const userChoice = new Promise<{ outcome: "accepted" | "dismissed" }>((resolve) => {
      settle = resolve;
    });

    const button = await renderPromptable(makePromptEvent(prompt, userChoice));

    // 두 번째 호출은 브라우저가 InvalidStateError로 거절하는 자리다.
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(prompt).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle({ outcome: "accepted" });
      await userChoice;
    });

    expect(screen.getByText(/앱으로 실행 중이에요/)).toBeInTheDocument();
  });

  it("prompt가 거절되면 삼키지 않고 다른 설치 방법을 알려준다", async () => {
    const prompt = vi.fn<() => Promise<void>>().mockRejectedValue(
      new DOMException("already used", "InvalidStateError"),
    );
    const userChoice = Promise.resolve({ outcome: "accepted" as const });

    const button = await renderPromptable(makePromptEvent(prompt, userChoice));

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() =>
      expect(screen.getByTestId("install-message")).toHaveTextContent("설치 창을 열지 못했어요"),
    );
    // 실패해도 버튼은 남아 다시 시도할 수 있다.
    expect(screen.getByTestId("install-app")).toBeInTheDocument();
  });
});

describe("InstallAppCard 오프라인 문구", () => {
  it("서비스 워커가 문서를 캐시하지 않으므로 오프라인 실행을 약속하지 않는다", async () => {
    render(<InstallAppCard />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    const body = screen.getByText(/앱으로 실행 중이에요/);
    expect(body).toHaveTextContent("인터넷이 끊긴 상태에서는 화면을 새로 불러오지 못하니");
    expect(body.textContent ?? "").not.toContain("오프라인에서도");
  });
});
