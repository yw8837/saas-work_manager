import { describe, expect, it } from "vitest";
import { assertNativeSessionOwner, createNativeAuthCoordinator, NATIVE_AUTH_CALLBACK, parseNativeAuthCallback } from "./auth";
import type { SecureSessionStore } from "./secure-storage";

function fixture() {
  const values = new Map<string, string>();
  const store: SecureSessionStore = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
  const effects = { opens: 0, exchanges: 0, signOuts: 0, navigations: [] as string[], expectedOwner: null as string | null };
  let now = 1000000;
  let returnedOwner = "account-a";
  const dependencies = {
    store,
    now: () => now,
    begin: async () => "https://abcdefghijklmnopqrst.supabase.co/auth/v1/authorize?provider=google",
    exchange: async () => { effects.exchanges++; return returnedOwner; },
    open: async () => { effects.opens++; },
    close: async () => {},
    signOut: async () => { effects.signOuts++; },
    prepareReauthentication: (owner: string | null) => { effects.expectedOwner = owner; },
    navigate: (path: string) => { effects.navigations.push(path); },
    authorizeOrigin: "https://abcdefghijklmnopqrst.supabase.co",
  };
  return {
    dependencies, effects, store,
    controller: createNativeAuthCoordinator(dependencies),
    expire: () => { now += 11 * 60 * 1000; },
    changeReturnedOwner: () => { returnedOwner = "account-b"; },
  };
}

describe("native OAuth callback boundary", () => {
  it("accepts the exact code callback", () => {
    expect(parseNativeAuthCallback(`${NATIVE_AUTH_CALLBACK}?code=valid-code`)).toEqual({ code: "valid-code" });
  });
  it.each([
    "https://auth/callback?code=x",
    "com.yeolmaestudio.ilgamcheck://evil/callback?code=x",
    "com.yeolmaestudio.ilgamcheck://auth/other?code=x",
    "com.yeolmaestudio.ilgamcheck://user@auth/callback?code=x",
    "com.yeolmaestudio.ilgamcheck://auth:123/callback?code=x",
    "com.yeolmaestudio.ilgamcheck://auth/callback?code=x&code=y",
    "com.yeolmaestudio.ilgamcheck://auth/callback?code=x&error=denied",
    "com.yeolmaestudio.ilgamcheck://auth/callback#access_token=token",
    "com.yeolmaestudio.ilgamcheck://auth/callback?code=x#access_token=token",
    "com.yeolmaestudio.ilgamcheck://auth/callback?code=",
    "com.yeolmaestudio.ilgamcheck://auth/../callback?code=x",
  ])("ignores untrusted callback %s", (url) => {
    expect(parseNativeAuthCallback(url)).toBeNull();
  });
  it("does not display provider-controlled error text", () => {
    expect(parseNativeAuthCallback(`${NATIVE_AUTH_CALLBACK}?error=access_denied&error_description=private-token`))
      .toEqual({ error: "AUTH_CANCELLED" });
  });
});

describe("native OAuth lifecycle", () => {
  it("keeps a durable owner guard across a crash after the SDK saves the exchanged session", async () => {
    const f = fixture();
    let finish!: (owner: string) => void;
    f.dependencies.exchange = () => new Promise<string>((resolve) => { finish = resolve; });
    const controller = createNativeAuthCoordinator(f.dependencies);
    await controller.start("google", "/settings", "account-a");
    const exchange = controller.complete(`${NATIVE_AUTH_CALLBACK}?code=crash-window`);
    await viWaitUntil(() => Boolean(finish));
    // A new JS process has no sessionStorage guard but reads the same OS store.
    await expect(assertNativeSessionOwner(f.store, "account-b")).rejects.toThrow("AUTH_ACCOUNT_MISMATCH");
    await expect(assertNativeSessionOwner(f.store, "account-a")).resolves.toBeUndefined();
    finish("account-a");
    await exchange;
    await expect(assertNativeSessionOwner(f.store, "account-b")).resolves.toBeUndefined();
  });
  it("does not clear the durable guard when rejecting a wrong account cannot sign out", async () => {
    const f = fixture();
    f.changeReturnedOwner();
    f.dependencies.signOut = async () => { throw new Error("SIGNOUT_FAILED"); };
    const controller = createNativeAuthCoordinator(f.dependencies);
    await controller.start("google", "/settings", "account-a");
    await expect(controller.complete(`${NATIVE_AUTH_CALLBACK}?code=x`)).rejects.toThrow("SIGNOUT_FAILED");
    f.expire();
    await expect(assertNativeSessionOwner(f.store, "account-b")).rejects.toThrow("AUTH_ACCOUNT_MISMATCH");
  });
  it("ignores callbacks without an app-started login", async () => {
    const f = fixture();
    expect(await f.controller.complete(`${NATIVE_AUTH_CALLBACK}?code=x`)).toBe("ignored");
    expect(f.effects.exchanges).toBe(0);
  });
  it("blocks double taps and only exchanges concurrent cold/warm callbacks once", async () => {
    const f = fixture();
    await f.controller.start("google", "/today");
    await expect(f.controller.start("google", "/today")).rejects.toThrow("AUTH_ALREADY_PENDING");
    const results = await Promise.all([
      f.controller.complete(`${NATIVE_AUTH_CALLBACK}?code=x`),
      f.controller.complete(`${NATIVE_AUTH_CALLBACK}?code=x`),
    ]);
    expect(results.sort()).toEqual(["handled", "ignored"]);
    expect(f.effects).toMatchObject({ opens: 1, exchanges: 1, navigations: ["/today"] });
  });
  it("restores the pending login after process restart", async () => {
    const f = fixture();
    await f.controller.start("google", "/settings", "account-a");
    const restored = createNativeAuthCoordinator(f.dependencies);
    expect(await restored.complete(`${NATIVE_AUTH_CALLBACK}?code=x`)).toBe("handled");
    expect(f.effects.expectedOwner).toBe("account-a");
    expect(f.effects.navigations).toEqual(["/settings"]);
  });
  it("never opens a different account after deletion reauthentication", async () => {
    const f = fixture();
    await f.controller.start("google", "/settings", "account-a");
    f.changeReturnedOwner();
    await expect(f.controller.complete(`${NATIVE_AUTH_CALLBACK}?code=x`)).rejects.toThrow("AUTH_ACCOUNT_MISMATCH");
    expect(f.effects.signOuts).toBe(1);
    expect(f.effects.navigations).toEqual([]);
  });
  it("expires pending logins and supports a fresh attempt", async () => {
    const f = fixture();
    await f.controller.start("google", "/today");
    f.expire();
    expect(await f.controller.complete(`${NATIVE_AUTH_CALLBACK}?code=x`)).toBe("ignored");
    expect(f.effects.exchanges).toBe(0);
    await f.controller.start("google", "/today");
    expect(f.effects.opens).toBe(2);
  });
  it("cancels without accepting a late callback", async () => {
    const f = fixture();
    await f.controller.start("google", "/today");
    await f.controller.cancel();
    expect(await f.controller.complete(`${NATIVE_AUTH_CALLBACK}?code=x`)).toBe("ignored");
    await f.controller.start("google", "/today");
    expect(f.effects.opens).toBe(2);
  });
  it("rejects unsafe navigation paths before opening login", async () => {
    const f = fixture();
    await expect(f.controller.start("google", "//evil.example")).rejects.toThrow("AUTH_REDIRECT_INVALID");
    expect(f.effects.opens).toBe(0);
  });
  it("rejects foreign authorize URLs and allows retry after browser failure", async () => {
    const f = fixture();
    f.dependencies.begin = async () => "https://evil.example/auth/v1/authorize";
    const controller = createNativeAuthCoordinator(f.dependencies);
    await expect(controller.start("google", "/today")).rejects.toThrow("AUTH_AUTHORIZE_URL_INVALID");
    expect(f.effects.opens).toBe(0);
    f.dependencies.begin = async () => "https://abcdefghijklmnopqrst.supabase.co/auth/v1/authorize?provider=google";
    await controller.start("google", "/today");
    expect(f.effects.opens).toBe(1);
  });
  it("rejects storage failure before starting provider authentication", async () => {
    const f = fixture();
    f.store.setItem = async () => { throw new Error("KEYSTORE_UNAVAILABLE"); };
    await expect(f.controller.start("google", "/today")).rejects.toThrow("KEYSTORE_UNAVAILABLE");
    expect(f.effects.opens).toBe(0);
  });
});

async function viWaitUntil(predicate: () => boolean) {
  for (let index = 0; index < 30 && !predicate(); index++) await Promise.resolve();
  expect(predicate()).toBe(true);
}
