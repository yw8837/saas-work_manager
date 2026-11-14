import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

import { PENDING_ACQUISITION_KEY } from "./acquisition-link";
import { CLARITY_SCRIPT_ID, clarityAcquisitionTags, startClarityOnPage, trackingOptOutRequested } from "./clarity";

type FakeClarity = ((...args: unknown[]) => void) & { q?: unknown[][]; v?: string; ilgamcheck?: true };
type TestWindow = Window & { clarity?: FakeClarity; __ILGAMCHECK_CLARITY__?: string; doNotTrack?: string };

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const w = window as TestWindow;
const originalUrl = window.location.href;
let storage: MemoryStorage;

/** 문서를 처음 받은 주소(navigation 기록)와 지금 주소를 정한다. */
function openDocument(url: string, startUrl = url) {
  jsdom.reconfigure({ url });
  vi.spyOn(performance, "getEntriesByType").mockImplementation((type: string) => (
    type === "navigation" ? [{ name: startUrl } as PerformanceEntry] : []
  ));
}

const scripts = () => Array.from(document.querySelectorAll(`script#${CLARITY_SCRIPT_ID}`)) as HTMLScriptElement[];

/** 본체(clarity.js)가 실행된 상태를 흉내 낸다. stop은 공개 소스처럼 window.clarity를 새 대기열로 바꾼다. */
function simulateRunningClarity() {
  const calls: Array<{ args: unknown[]; pathname: string }> = [];
  const running: FakeClarity = (...args: unknown[]) => {
    calls.push({ args, pathname: window.location.pathname });
    if (args[0] === "stop") w.clarity = () => undefined;
  };
  running.v = "0.8.77";
  w.clarity = running;
  return calls;
}

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: storage });
  vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "testproject1");
});

afterEach(() => {
  for (const script of scripts()) script.remove();
  delete w.clarity;
  delete w.__ILGAMCHECK_CLARITY__;
  // 시험마다 깐 history 감싸기를 걷어 원래(prototype) 함수로 되돌린다.
  delete (window.history as unknown as Record<string, unknown>).pushState;
  delete (window.history as unknown as Record<string, unknown>).replaceState;
  delete (navigator as unknown as Record<string, unknown>).globalPrivacyControl;
  delete (navigator as unknown as Record<string, unknown>).doNotTrack;
  delete w.doNotTrack;
  jsdom.reconfigure({ url: originalUrl });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Clarity 불러오기 조건", () => {
  it("메인(/)에서 공식 설치 코드처럼 대기열 함수와 async 스크립트(www.clarity.ms/tag/ID)를 한 번 붙인다", () => {
    openDocument("https://ilgam.example/");
    startClarityOnPage();

    const [script] = scripts();
    expect(scripts()).toHaveLength(1);
    expect(script.src).toBe("https://www.clarity.ms/tag/testproject1");
    expect(script.async).toBe(true);
    expect(script.parentElement).toBe(document.head);
    expect(typeof w.clarity).toBe("function");
    w.clarity!("event", "x");
    expect(w.clarity!.q).toEqual([["event", "x"]]);

    startClarityOnPage();
    expect(scripts()).toHaveLength(1);
  });

  it("둘러보기(/try)에서도 불러온다", () => {
    openDocument("https://ilgam.example/try");
    startClarityOnPage();
    expect(scripts()).toHaveLength(1);
  });

  it.each(["/guide", "/examples", "/today", "/jobs", "/settings", "/demo/r", "/r/abc123", "/privacy", "/terms", "/try/extra"])(
    "%s 에서는 절대 불러오지 않는다",
    (pathname) => {
      openDocument(`https://ilgam.example${pathname}`);
      startClarityOnPage();
      expect(scripts()).toHaveLength(0);
      expect(w.clarity).toBeUndefined();
    },
  );

  it("프로젝트 ID가 없으면 아무것도 하지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "");
    openDocument("https://ilgam.example/");
    startClarityOnPage();
    expect(scripts()).toHaveLength(0);
    expect(w.clarity).toBeUndefined();
  });

  it.each(["Test-Project", "abc", "x".repeat(33), "abc def12", "abc/../x1", "\"><script>"])(
    "형식이 이상한 ID(%s)는 오류 없이 무시한다",
    (value) => {
      vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", value);
      openDocument("https://ilgam.example/");
      expect(() => startClarityOnPage()).not.toThrow();
      expect(scripts()).toHaveLength(0);
    },
  );

  it("다른 화면으로 처음 연 문서(그 화면 CSP)에서 메인으로 옮겨 와도 불러오지 않는다", () => {
    openDocument("https://ilgam.example/", "https://ilgam.example/guide");
    startClarityOnPage();
    expect(scripts()).toHaveLength(0);
  });

  it("문서를 처음 받은 주소를 알 수 없으면 불러오지 않는다", () => {
    jsdom.reconfigure({ url: "https://ilgam.example/" });
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    startClarityOnPage();
    expect(scripts()).toHaveLength(0);
  });

  it("Global Privacy Control이 켜져 있으면 불러오지 않는다", () => {
    Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true });
    expect(trackingOptOutRequested()).toBe(true);
    openDocument("https://ilgam.example/");
    startClarityOnPage();
    expect(scripts()).toHaveLength(0);
  });

  it("Do Not Track이 켜져 있으면 불러오지 않는다", () => {
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "1" });
    expect(trackingOptOutRequested()).toBe(true);
    openDocument("https://ilgam.example/try");
    startClarityOnPage();
    expect(scripts()).toHaveLength(0);
  });

  it("추적 거부 신호가 없거나 꺼져 있으면 거부로 보지 않는다", () => {
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "0" });
    Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: false });
    expect(trackingOptOutRequested()).toBe(false);
  });
});

describe("유입 경로 맞춤 태그", () => {
  it("링크의 utm 세 값을 맞춤 태그로 넘기고(공식 API clarity('set', key, value)) 주소에서는 지운다", () => {
    openDocument("https://ilgam.example/try?utm_source=mail&utm_medium=email&utm_campaign=cold1");
    startClarityOnPage();

    expect(w.clarity!.q).toEqual([
      ["set", "utm_source", "mail"],
      ["set", "utm_medium", "email"],
      ["set", "utm_campaign", "cold1"],
    ]);
    expect(window.location.search).toBe("");
    expect(storage.getItem(PENDING_ACQUISITION_KEY)).toContain("\"source\":\"mail\"");
  });

  it("이 탭에 보관해 둔 유입 경로(레이아웃이 먼저 옮긴 경우)도 같은 규칙으로 넘긴다", () => {
    storage.setItem(PENDING_ACQUISITION_KEY, JSON.stringify({ source: "blog", medium: null, campaign: "Post_2" }));
    openDocument("https://ilgam.example/");
    startClarityOnPage();
    expect(w.clarity!.q).toEqual([["set", "utm_source", "blog"], ["set", "utm_campaign", "post_2"]]);
  });

  it("utm이 없는 방문은 태그를 넘기지 않는다", () => {
    openDocument("https://ilgam.example/");
    startClarityOnPage();
    expect(scripts()).toHaveLength(1);
    expect(w.clarity!.q).toBeUndefined();
  });

  it("형식이 틀리거나 전화번호처럼 긴 숫자인 값은 넘기지 않는다(acquisition-link.ts 규칙)", () => {
    openDocument("https://ilgam.example/?utm_source=01012345678&utm_medium=email");
    startClarityOnPage();
    expect(w.clarity!.q).toBeUndefined();
    expect(clarityAcquisitionTags({ source: "mail", medium: null, campaign: null })).toEqual([["utm_source", "mail"]]);
    expect(clarityAcquisitionTags(null)).toEqual([]);
  });
});

describe("두 화면 밖으로 옮길 때 멈추기", () => {
  it("실행 중이면 주소가 바뀌기 전에 clarity('stop')을 부르고, 다시 시작하지 못하게 막는다", () => {
    openDocument("https://ilgam.example/");
    startClarityOnPage();
    const calls = simulateRunningClarity();

    window.history.pushState({}, "", "/today?invite=BETA2026");

    expect(calls).toEqual([{ args: ["stop"], pathname: "/" }]);
    expect(window.location.pathname).toBe("/today");
    expect(w.clarity!.v).toBe("stopped-by-ilgamcheck");
    expect(w.__ILGAMCHECK_CLARITY__).toBe("stopped");

    // 같은 문서에서 메인으로 돌아와도 다시 불러오지 않는다.
    window.history.pushState({}, "", "/");
    startClarityOnPage();
    expect(scripts()).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("메인과 둘러보기 사이 이동과 같은 화면의 주소 정리(replaceState)는 멈추지 않는다", () => {
    openDocument("https://ilgam.example/");
    startClarityOnPage();
    const calls = simulateRunningClarity();

    window.history.pushState({}, "", "/try");
    window.history.replaceState({}, "", "/try?step=2");
    window.history.pushState({}, "", "/");

    expect(calls).toEqual([]);
    expect(w.__ILGAMCHECK_CLARITY__).toBe("loaded");
  });

  it("뒤로 가기(popstate)로 다른 화면이 되면 멈춘다", () => {
    openDocument("https://ilgam.example/try");
    startClarityOnPage();
    const calls = simulateRunningClarity();

    jsdom.reconfigure({ url: "https://ilgam.example/guide" });
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));

    expect(calls).toEqual([{ args: ["stop"], pathname: "/guide" }]);
    expect(w.clarity!.v).toBe("stopped-by-ilgamcheck");
  });

  it("본체가 오기 전에 떠나면 대기열을 v가 붙은 빈 함수로 바꿔 시작 자체를 못 하게 한다", () => {
    openDocument("https://ilgam.example/?utm_source=mail");
    startClarityOnPage();
    const queue = w.clarity!;
    expect(queue.q).toEqual([["set", "utm_source", "mail"]]);

    window.history.pushState({}, "", "/r/abc123");

    expect(w.clarity).not.toBe(queue);
    expect(w.clarity!.v).toBe("stopped-by-ilgamcheck");
    expect(w.clarity!.q).toBeUndefined();
  });

  it("화면 안 이동 직후 Clarity가 다시 시작하려고 기다리는 중(v 없는 Clarity 대기열)이면 stop을 쌓아 둔다", () => {
    openDocument("https://ilgam.example/");
    startClarityOnPage();
    const restarting: FakeClarity = (...args: unknown[]) => { (restarting.q ||= []).push(args); };
    w.clarity = restarting;

    window.history.pushState({}, "", "/today");

    expect(w.clarity).toBe(restarting);
    expect(restarting.q).toEqual([["stop"]]);
  });

  it("stop이 듣지 않으면 주소를 바꾸지 않는다(새 문서로 열어 기록을 끊는다)", () => {
    openDocument("https://ilgam.example/");
    startClarityOnPage();
    const stubborn: FakeClarity = () => undefined;
    stubborn.v = "0.8.77";
    w.clarity = stubborn;
    const assign = vi.fn();
    const realLocation = window.location;
    vi.spyOn(window, "location", "get").mockReturnValue({
      href: realLocation.href,
      pathname: realLocation.pathname,
      assign,
      reload: vi.fn(),
    } as unknown as Location);

    window.history.pushState({}, "", "/today");

    expect(assign).toHaveBeenCalledWith("https://ilgam.example/today");
    vi.restoreAllMocks();
    expect(window.location.pathname).toBe("/");
  });
});
