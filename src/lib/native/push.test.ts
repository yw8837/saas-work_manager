import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  platform: "android", owner: "owner-a", permission: "granted", failRpc: false,
  values: new Map<string, string>(), handlers: new Map<string, (data: unknown) => unknown>(),
  rpc: vi.fn(), unregister: vi.fn().mockResolvedValue(undefined), navigate: vi.fn(),
  load: vi.fn(), iosToken: vi.fn().mockResolvedValue({ token: "fcm-ios-token".repeat(5) }),
  remove: vi.fn().mockResolvedValue(undefined),
  clearDelivered: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./platform", () => ({ nativePlatform: () => mock.platform }));
vi.mock("./secure-storage", () => ({ createSecureSessionStore: () => ({
  getItem: async (key: string) => mock.values.get(key) ?? null,
  setItem: async (key: string, value: string) => { mock.values.set(key,value); },
  removeItem: async (key: string) => { mock.values.delete(key); },
}) }));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => ({
  getToken: mock.iosToken, deleteToken: vi.fn().mockResolvedValue(undefined),
  addListener: async (name: string, fn: (data: unknown) => unknown) => {
    mock.handlers.set(name, fn); return { remove: mock.remove };
  },
}) }));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: {
  checkPermissions: async () => ({ receive: mock.permission }),
  requestPermissions: async () => ({ receive: mock.permission }),
  register: async () => { await mock.handlers.get("registration")?.({ value: "android-fcm-token".repeat(5) }); },
  unregister: mock.unregister,
  removeAllDeliveredNotifications: mock.clearDelivered,
  createChannel: vi.fn().mockResolvedValue(undefined),
  addListener: async (name: string, fn: (data: unknown) => unknown) => {
    mock.handlers.set(name, fn); return { remove: mock.remove };
  },
} }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({
  auth: { getSession: async () => ({ data: { session: mock.owner ? { user: { id: mock.owner } } : null } }) },
  rpc: mock.rpc,
}) }));
vi.mock("@/lib/supabase/workspace", () => ({ loadHostedWorkspace: mock.load }));

beforeEach(() => {
  vi.resetModules(); mock.platform="android"; mock.owner="owner-a"; mock.permission="granted";
  mock.values.clear(); mock.handlers.clear(); mock.rpc.mockReset().mockResolvedValue({ error:null });
  mock.unregister.mockClear(); mock.navigate.mockClear(); mock.load.mockReset(); mock.iosToken.mockClear();
  mock.remove.mockReset().mockResolvedValue(undefined);
  mock.clearDelivered.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("location", { assign: mock.navigate });
});
afterEach(async () => { await (await import("./push")).disposeNativePush(); vi.unstubAllGlobals(); });

it("permission refusal never registers a device", async () => {
  mock.permission="denied";
  const push = await import("./push");
  await push.initializeNativePush("owner-a");
  expect(await push.enableNativePush()).toBe("denied");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("reports enabled only after the device registration RPC succeeds", async () => {
  const push = await import("./push");
  await push.initializeNativePush("owner-a");
  expect(await push.enableNativePush()).toBe("enabled");
  expect(mock.rpc).toHaveBeenCalledWith("register_native_push_device", expect.objectContaining({ p_platform:"android" }));
  await push.disableNativePush();
  expect(mock.rpc).toHaveBeenCalledWith("revoke_native_push_device", expect.anything());
  expect(mock.unregister).toHaveBeenCalled();
});
it("does not treat an iOS APNs token as an FCM token", async () => {
  mock.platform="ios";
  const push = await import("./push");
  await push.initializeNativePush("owner-a");
  expect(await push.enableNativePush()).toBe("enabled");
  expect(mock.iosToken).toHaveBeenCalled();
  expect(mock.rpc).toHaveBeenCalledWith("register_native_push_device", expect.objectContaining({
    p_platform:"ios", p_token:"fcm-ios-token".repeat(5),
  }));
});
it("does not claim enabled when server registration fails", async () => {
  mock.rpc.mockResolvedValue({ error: { message: "unavailable" } });
  const push = await import("./push");
  await push.initializeNativePush("owner-a");
  expect(await push.enableNativePush()).toBe("unavailable");
});
it("rejects a notification for another owner's or removed request", async () => {
  const push = await import("./push");
  await push.initializeNativePush("owner-a");
  mock.load.mockResolvedValue({ state: { jobs: [] } });
  await mock.handlers.get("pushNotificationActionPerformed")?.({ notification: { data: {
    type:"revision",request_id:"e65d2c61-899e-4214-86fb-4a057d07c497",job_key:"job_a",
  } } });
  expect(mock.navigate).toHaveBeenCalledWith("/jobs?notice=revision-unavailable");
  expect(mock.load).toHaveBeenCalledWith(expect.anything(), "owner-a");
});
it("shows a connection notice when a valid notification cannot be revalidated", async () => {
  const push = await import("./push");
  await push.initializeNativePush("owner-a");
  mock.load.mockRejectedValue(new Error("network failure"));
  await push.openNativeRevision({
    type:"revision",request_id:"e65d2c61-899e-4214-86fb-4a057d07c497",job_key:"job_a",
  });
  expect(mock.navigate).toHaveBeenCalledWith("/jobs?notice=revision-connection");
});
it("late token callbacks from the old owner cannot register after switching account", async () => {
  const push = await import("./push");
  await push.initializeNativePush("owner-a");
  await push.enableNativePush();
  const old = mock.handlers.get("registration");
  mock.owner="owner-b";
  await push.initializeNativePush("owner-b");
  mock.rpc.mockClear();
  await old?.({ value:"old-token".repeat(10) });
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("a delayed old initializer cannot replace the newer account", async () => {
  const push = await import("./push");
  await push.initializeNativePush("owner-a");
  let finishRemoval!: () => void;
  const slowRemoval = new Promise<void>((resolve) => { finishRemoval = resolve; });
  mock.remove.mockImplementationOnce(() => slowRemoval);
  const old = push.initializeNativePush("owner-a");
  mock.owner = "owner-b";
  await push.initializeNativePush("owner-b");
  finishRemoval();
  await old;
  expect(await push.enableNativePush()).toBe("enabled");
});
it("failed revoke blocks sign-out cleanup and keeps the error actionable", async () => {
  const push = await import("./push");
  await push.initializeNativePush("owner-a");
  await push.enableNativePush();
  mock.unregister.mockClear();
  mock.rpc.mockResolvedValueOnce({ error: { message: "offline" } });
  await expect(push.disableNativePush()).rejects.toThrow("기기 알림을 해제하지 못했어요");
  expect(mock.unregister).not.toHaveBeenCalled();
});
it("notification-tray cleanup failure after successful revocation does not block logout", async () => {
  const push = await import("./push");
  await push.initializeNativePush("owner-a");
  await push.enableNativePush();
  mock.clearDelivered.mockRejectedValue(new Error("APNs has not registered in this launch"));
  await expect(push.disableNativePush()).resolves.toBeUndefined();
  expect(mock.rpc).toHaveBeenLastCalledWith("revoke_native_push_device", expect.anything());
});
