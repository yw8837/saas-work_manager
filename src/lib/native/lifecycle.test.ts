import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subscribeNativeResume } from "./lifecycle";

const bridge = vi.hoisted(() => ({
  platform: "android",
  handler: null as null | ((event: { isActive: boolean }) => void),
  remove: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./platform", () => ({ nativePlatform: () => bridge.platform }));
vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn(async (_name, handler) => {
    bridge.handler = handler;
    return { remove: bridge.remove };
  }) },
}));

beforeEach(() => { bridge.handler = null; bridge.platform = "android"; bridge.remove.mockClear(); });
afterEach(() => { vi.restoreAllMocks(); });

it("refreshes on foreground and online, not on background", async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const stop = await subscribeNativeResume(refresh);
  bridge.handler?.({ isActive: false });
  expect(refresh).not.toHaveBeenCalled();
  bridge.handler?.({ isActive: true });
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  window.dispatchEvent(new Event("online"));
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  stop();
  window.dispatchEvent(new Event("online"));
  bridge.handler?.({ isActive: true });
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(bridge.remove).toHaveBeenCalledOnce();
});

it("coalesces bursts into one trailing refresh, without parallel loads", async () => {
  let resolve!: () => void;
  const refresh = vi.fn()
    .mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }))
    .mockResolvedValue(undefined);
  const stop = await subscribeNativeResume(refresh);
  bridge.handler?.({ isActive: true });
  bridge.handler?.({ isActive: true });
  window.dispatchEvent(new Event("online"));
  expect(refresh).toHaveBeenCalledOnce();
  resolve();
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  stop();
});

it("does not leave an online listener when native listener installation fails", async () => {
  const { App } = await import("@capacitor/app");
  vi.mocked(App.addListener).mockRejectedValueOnce(new Error("bridge offline"));
  const refresh = vi.fn().mockResolvedValue(undefined);
  await expect(subscribeNativeResume(refresh)).rejects.toThrow("bridge offline");
  window.dispatchEvent(new Event("online"));
  expect(refresh).not.toHaveBeenCalled();
});

it("still accepts a later signal after a failed refresh", async () => {
  const refresh = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  const stop = await subscribeNativeResume(refresh);
  bridge.handler?.({ isActive: true });
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  window.dispatchEvent(new Event("online"));
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  stop();
});

it("uses only online recovery on web", async () => {
  bridge.platform = "web";
  const refresh = vi.fn().mockResolvedValue(undefined);
  const stop = await subscribeNativeResume(refresh);
  expect(bridge.handler).toBeNull();
  window.dispatchEvent(new Event("online"));
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  stop();
});
