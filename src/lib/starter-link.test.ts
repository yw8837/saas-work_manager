import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

import { composeJob } from "@/lib/domain";
import { createStarterState, INDUSTRY_ORDER, INDUSTRY_STARTERS } from "@/lib/store";
import {
  canAutoApplyStarter,
  captureStarterFromLocation,
  clearPendingStarter,
  parseStarterIndustry,
  PENDING_STARTER_KEY,
  readPendingStarter,
} from "./starter-link";

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

describe("업종 예시 링크 값 받아 두기", () => {
  it("주소의 starter를 이 탭에만 보관하고 주소에서 지운다(다른 값·해시는 남김)", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?job=job_1&starter=design#top" });
    const state = { idx: 3 };
    window.history.replaceState(state, "");
    captureStarterFromLocation();
    expect(window.location.search).toBe("?job=job_1");
    expect(window.location.hash).toBe("#top");
    expect(window.history.state).toEqual(state);
    expect(storage.getItem(PENDING_STARTER_KEY)).toBe("design");
    expect(readPendingStarter()).toBe("design");
  });

  it("로그인 왕복: 주소가 /today로 돌아와도(파라미터 없음) 값이 남아 있고, 두 번 불러도 같다", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=video" });
    captureStarterFromLocation();
    // Google 로그인 뒤 복귀 주소는 쿼리 없는 /today다.
    jsdom.reconfigure({ url: "https://ilgam.example/today" });
    captureStarterFromLocation();
    expect(readPendingStarter()).toBe("video");
    expect(window.location.search).toBe("");
  });

  it("없는 업종 키는 주소에서만 지우고 보관하지 않는다", () => {
    for (const value of ["nope", "", "__proto__", "Design", "web,design"]) {
      jsdom.reconfigure({ url: `https://ilgam.example/today?starter=${encodeURIComponent(value)}` });
      captureStarterFromLocation();
      expect(window.location.search).toBe("");
      expect(readPendingStarter()).toBeNull();
    }
  });

  it("저장된 값이 이상하면 없는 것으로 본다", () => {
    storage.setItem(PENDING_STARTER_KEY, "hacked");
    expect(readPendingStarter()).toBeNull();
  });

  it("parseStarterIndustry는 INDUSTRY_ORDER의 키만 받는다", () => {
    for (const industry of INDUSTRY_ORDER) expect(parseStarterIndustry(industry)).toBe(industry);
    expect(parseStarterIndustry(null)).toBeNull();
    expect(parseStarterIndustry("constructor")).toBeNull();
  });

  it("clearPendingStarter로 지운다", () => {
    storage.setItem(PENDING_STARTER_KEY, "photo");
    clearPendingStarter();
    expect(readPendingStarter()).toBeNull();
  });

  it("sessionStorage가 막혀도 터지지 않는다", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=web" });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() { throw new Error("blocked"); },
    });
    expect(() => captureStarterFromLocation()).not.toThrow();
    expect(window.location.search).toBe("");
    expect(readPendingStarter()).toBeNull();
    expect(() => clearPendingStarter()).not.toThrow();
  });
});

describe("저절로 적용해도 되는 상태", () => {
  const starter = createStarterState("2026-11-05");
  const job = () => composeJob({ jobId: "job_1", clientLabel: "고객", startDate: "2026-11-05", package: starter.packages[0], now: "2026-11-05T00:00:00.000Z" });

  it("일감 0건·누적 0건·손대지 않은 예시면 된다", () => {
    expect(canAutoApplyStarter({ jobs: [], jobsCreatedTotal: 0, packages: starter.packages })).toBe(true);
    expect(canAutoApplyStarter({ jobs: [], jobsCreatedTotal: 0, packages: INDUSTRY_STARTERS.video.packages })).toBe(true);
  });

  it("일감이 있거나 예전에 만든 적이 있으면 안 된다", () => {
    expect(canAutoApplyStarter({ jobs: [job()], jobsCreatedTotal: 1, packages: starter.packages })).toBe(false);
    expect(canAutoApplyStarter({ jobs: [], jobsCreatedTotal: 1, packages: starter.packages })).toBe(false);
  });

  it("이름 하나라도 고쳤거나 직접 만든 패키지가 있으면 안 된다", () => {
    const edited = starter.packages.map((item, index) => (index === 0 ? { ...item, name: `${item.name} 내 것` } : item));
    expect(canAutoApplyStarter({ jobs: [], jobsCreatedTotal: 0, packages: edited })).toBe(false);
    const added = [...starter.packages, { ...starter.packages[0], id: "pkg_mine", name: "내 패키지" }];
    expect(canAutoApplyStarter({ jobs: [], jobsCreatedTotal: 0, packages: added })).toBe(false);
  });

  it("패키지가 하나도 없으면 안 된다(다 지운 사용자)", () => {
    expect(canAutoApplyStarter({ jobs: [], jobsCreatedTotal: 0, packages: [] })).toBe(false);
  });
});
