import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

import {
  captureInviteFromLocation,
  clearPendingInvite,
  peekPendingInvite,
  PENDING_INVITE_KEY,
  readPendingInvite,
} from "./invite-link";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

let storage: MemoryStorage;
const originalUrl = window.location.href;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: storage });
});

afterEach(() => {
  jsdom.reconfigure({ url: originalUrl });
  vi.restoreAllMocks();
});

describe("초대 링크 코드 받아 두기", () => {
  it("주소의 invite를 이 탭에만 보관하고 주소에서 지운다(다른 값·해시는 남김)", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?job=job_1&invite=%20Invite-A1%20#top" });
    const state = { idx: 3 };
    window.history.replaceState(state, "");
    captureInviteFromLocation();
    expect(window.location.search).toBe("?job=job_1");
    expect(window.location.hash).toBe("#top");
    expect(window.history.state).toEqual(state);
    expect(storage.getItem(PENDING_INVITE_KEY)).toBe("Invite-A1");
    expect(readPendingInvite()).toBe("Invite-A1");
  });

  it("여러 번 불러도 같고, invite가 없으면 아무것도 바꾸지 않는다", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?invite=CODE1" });
    captureInviteFromLocation();
    captureInviteFromLocation();
    expect(window.location.search).toBe("");
    expect(readPendingInvite()).toBe("CODE1");

    jsdom.reconfigure({ url: "https://ilgam.example/today?job=x" });
    const replace = vi.spyOn(window.history, "replaceState");
    captureInviteFromLocation();
    expect(replace).not.toHaveBeenCalled();
  });

  it("빈 값·지나치게 긴 값은 주소에서만 지우고 보관하지 않는다", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?invite=" });
    captureInviteFromLocation();
    expect(window.location.search).toBe("");
    expect(readPendingInvite()).toBeNull();

    jsdom.reconfigure({ url: `https://ilgam.example/today?invite=${"A".repeat(65)}` });
    captureInviteFromLocation();
    expect(window.location.search).toBe("");
    expect(readPendingInvite()).toBeNull();
  });

  it("peek은 주소나 보관함을 읽기만 한다", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?invite=PEEK1" });
    expect(peekPendingInvite()).toBe("PEEK1");
    expect(window.location.search).toBe("?invite=PEEK1");
    expect(storage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });

  it("지우면 남지 않고, 저장소가 막혀도 오류를 내지 않는다", () => {
    storage.setItem(PENDING_INVITE_KEY, "CODE2");
    clearPendingInvite();
    expect(readPendingInvite()).toBeNull();

    jsdom.reconfigure({ url: "https://ilgam.example/today?invite=CODE3" });
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => captureInviteFromLocation()).not.toThrow();
    expect(window.location.search).toBe("");
  });
});
