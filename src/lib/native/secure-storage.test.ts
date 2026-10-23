import { afterEach, describe, expect, it, vi } from "vitest";
import { createSecureSessionStore } from "./secure-storage";
import type { SecureSessionBridge } from "./bridge";

function bridge(): SecureSessionBridge {
  const values = new Map<string, string>();
  return {
    async get({ key }) { return { value: values.get(key) ?? null }; },
    async set({ key, value }) { values.set(key, value); },
    async remove({ key }) { values.delete(key); },
  };
}

describe("secure session adapter", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("persists and removes a session without an in-memory fallback", async () => {
    const native = bridge();
    const store = createSecureSessionStore(native);
    await store.setItem("sb-demo-auth-token", "session");
    expect(await createSecureSessionStore(native).getItem("sb-demo-auth-token")).toBe("session");
    await store.removeItem("sb-demo-auth-token");
    expect(await store.getItem("sb-demo-auth-token")).toBeNull();
  });
  it("propagates write and delete failures", async () => {
    const native = bridge();
    native.set = async () => { throw new Error("KEYSTORE_UNAVAILABLE"); };
    native.remove = async () => { throw new Error("KEYSTORE_UNAVAILABLE"); };
    const store = createSecureSessionStore(native);
    await expect(store.setItem("sb-demo-auth-token", "session")).rejects.toThrow("KEYSTORE_UNAVAILABLE");
    await expect(store.removeItem("sb-demo-auth-token")).rejects.toThrow("KEYSTORE_UNAVAILABLE");
  });
  it("does not recover sessions from browser localStorage", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "stale-browser-token" });
    expect(await createSecureSessionStore(bridge()).getItem("sb-demo-auth-token")).toBeNull();
  });
  it("rejects unknown keys so other native secrets cannot be addressed", async () => {
    await expect(createSecureSessionStore(bridge()).getItem("../other-app")).rejects.toThrow("SECURE_SESSION_KEY_INVALID");
  });
});
