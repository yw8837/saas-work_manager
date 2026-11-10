import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

import {
  captureAcquisitionFromLocation,
  clearPendingAcquisition,
  PENDING_ACQUISITION_KEY,
  readPendingAcquisition,
} from "./acquisition-link";

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

describe("유입 경로 받아 두기", () => {
  it("주소의 유입 경로 표시를 이 탭에만 보관하고 주소에서 지운다(초대 코드·해시는 남김)", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/try?utm_source=Mail&utm_medium=email&invite=BETA2026&utm_campaign=cold-1#top" });
    const state = { idx: 3 };
    window.history.replaceState(state, "");

    captureAcquisitionFromLocation();

    expect(window.location.search).toBe("?invite=BETA2026");
    expect(window.location.hash).toBe("#top");
    expect(window.history.state).toEqual(state);
    expect(readPendingAcquisition()).toEqual({ source: "mail", medium: "email", campaign: "cold-1" });
  });

  it("source만 있어도 받고, 여러 번 불러도 결과가 같다", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/?utm_source=blog" });
    captureAcquisitionFromLocation();
    captureAcquisitionFromLocation();

    expect(window.location.search).toBe("");
    expect(readPendingAcquisition()).toEqual({ source: "blog", medium: null, campaign: null });
  });

  it("source가 없거나 형식이 맞지 않으면 보관하지 않고 주소에서만 지운다", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/try?utm_medium=email" });
    captureAcquisitionFromLocation();
    expect(window.location.search).toBe("");
    expect(readPendingAcquisition()).toBeNull();

    // 메일 주소·한글·너무 긴 값·숫자가 6자리 이상 이어지는 값은 받지 않는다.
    for (const bad of ["someone%40example.com", "%EB%A9%94%EC%9D%BC", "a".repeat(41), "a%20b", "01012345678", "to-123456"]) {
      jsdom.reconfigure({ url: `https://ilgam.example/try?utm_source=${bad}` });
      captureAcquisitionFromLocation();
      expect(window.location.search).toBe("");
      expect(readPendingAcquisition()).toBeNull();
    }
  });

  it("medium·campaign만 형식이 틀리면 그 값만 비운다", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/try?utm_source=kmong&utm_medium=a%40b.c&utm_campaign=" });
    captureAcquisitionFromLocation();
    expect(readPendingAcquisition()).toEqual({ source: "kmong", medium: null, campaign: null });
  });

  it("유입 경로 표시가 없는 주소는 건드리지 않는다", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?job=job_1" });
    const replace = vi.spyOn(window.history, "replaceState");
    captureAcquisitionFromLocation();
    expect(replace).not.toHaveBeenCalled();
    expect(storage.getItem(PENDING_ACQUISITION_KEY)).toBeNull();
  });

  it("보관된 값이 망가졌으면 없는 것으로 본다", () => {
    storage.setItem(PENDING_ACQUISITION_KEY, "{not json");
    expect(readPendingAcquisition()).toBeNull();
    storage.setItem(PENDING_ACQUISITION_KEY, JSON.stringify({ source: "Has Space" }));
    expect(readPendingAcquisition()).toBeNull();
  });

  it("지우면 다시 읽히지 않는다", () => {
    storage.setItem(PENDING_ACQUISITION_KEY, JSON.stringify({ source: "mail", medium: null, campaign: null }));
    clearPendingAcquisition();
    expect(readPendingAcquisition()).toBeNull();
  });

  it("저장소가 막힌 브라우저에서도 오류 없이 지나간다", () => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() { throw new Error("blocked"); },
    });
    jsdom.reconfigure({ url: "https://ilgam.example/try?utm_source=mail" });
    expect(() => captureAcquisitionFromLocation()).not.toThrow();
    expect(window.location.search).toBe("");
    expect(readPendingAcquisition()).toBeNull();
    expect(() => clearPendingAcquisition()).not.toThrow();
  });
});
