import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PENDING_ACQUISITION_KEY } from "@/lib/acquisition-link";
import { recordPendingSignupSource } from "./signup-source";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

let storage: MemoryStorage;

function clientWith(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient;
}

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: storage });
});

describe("유입 경로 서버 기록", () => {
  it("보관된 값이 없으면 서버를 부르지 않는다", async () => {
    const rpc = vi.fn();
    await recordPendingSignupSource(clientWith(rpc));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("보관된 값을 한 번 보내고 지운다(서버가 안 받았다고 답해도 지움)", async () => {
    storage.setItem(PENDING_ACQUISITION_KEY, JSON.stringify({ source: "mail", medium: "email", campaign: null }));
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });

    await recordPendingSignupSource(clientWith(rpc));

    expect(rpc).toHaveBeenCalledWith("record_signup_source", { p_source: "mail", p_medium: "email", p_campaign: null });
    expect(storage.getItem(PENDING_ACQUISITION_KEY)).toBeNull();
  });

  it("서버 오류·연결 오류면 남겨 두고, 예외를 밖으로 내지 않는다", async () => {
    storage.setItem(PENDING_ACQUISITION_KEY, JSON.stringify({ source: "blog", medium: null, campaign: null }));

    await recordPendingSignupSource(clientWith(vi.fn().mockResolvedValue({ data: null, error: { message: "down" } })));
    expect(storage.getItem(PENDING_ACQUISITION_KEY)).not.toBeNull();

    await expect(recordPendingSignupSource(clientWith(vi.fn().mockRejectedValue(new Error("offline"))))).resolves.toBeUndefined();
    expect(storage.getItem(PENDING_ACQUISITION_KEY)).not.toBeNull();

    // 실패 뒤에도 다음 시도는 다시 나간다.
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await recordPendingSignupSource(clientWith(rpc));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(storage.getItem(PENDING_ACQUISITION_KEY)).toBeNull();
  });

  it("동시에 두 번 불러도 서버에는 한 번만 나간다", async () => {
    storage.setItem(PENDING_ACQUISITION_KEY, JSON.stringify({ source: "mail", medium: null, campaign: null }));
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await Promise.all([recordPendingSignupSource(clientWith(rpc)), recordPendingSignupSource(clientWith(rpc))]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("서버 연결이 없으면 보관 값을 그대로 둔다", async () => {
    storage.setItem(PENDING_ACQUISITION_KEY, JSON.stringify({ source: "mail", medium: null, campaign: null }));
    await recordPendingSignupSource(null);
    expect(storage.getItem(PENDING_ACQUISITION_KEY)).not.toBeNull();
  });
});
