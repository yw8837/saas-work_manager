import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { NativePushSettings } from "./native-push-settings";

const push = vi.hoisted(() => ({
  status: "disabled", enable: vi.fn(), disable: vi.fn(),
}));
vi.mock("@/lib/native/push", () => ({
  nativePushStatus: () => push.status,
  subscribeNativePush: () => () => undefined,
  enableNativePush: push.enable,
  disableNativePush: push.disable,
}));
beforeEach(() => {
  push.status = "disabled";
  push.enable.mockReset().mockResolvedValue("enabled");
  push.disable.mockReset().mockResolvedValue(undefined);
});
it("asks for push only after an explicit action and explains its limited scope", async () => {
  render(<NativePushSettings />);
  expect(push.enable).not.toHaveBeenCalled();
  expect(screen.getByText(/고객 이름과 요청 내용은 잠금화면에 표시하지 않아요/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이 기기에서 알림 받기" }));
  await waitFor(() => expect(push.enable).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/기기를 등록했어요/)).toBeInTheDocument();
});
it("does not tell the user push is working after a denied or unavailable registration", async () => {
  push.enable.mockResolvedValue("denied");
  render(<NativePushSettings />);
  fireEvent.click(screen.getByRole("button", { name: "이 기기에서 알림 받기" }));
  expect(await screen.findByText(/휴대폰 설정에서 일감체크 알림을 허용/)).toBeInTheDocument();
  expect(screen.queryByText(/기기를 등록했어요/)).not.toBeInTheDocument();
});
it("keeps a failed unregister visible instead of silently turning notifications off", async () => {
  push.status = "enabled";
  push.disable.mockRejectedValue(new Error("연결을 확인해주세요."));
  render(<NativePushSettings />);
  fireEvent.click(screen.getByRole("button", { name: "이 기기 알림 끄기" }));
  expect(await screen.findByText("연결을 확인해주세요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "이 기기 알림 끄기" })).toBeEnabled();
});
