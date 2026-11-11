import { afterEach, describe, expect, it } from "vitest";

import type {} from "vitest/jsdom";

import { BETA_GRANT_DAYS, PLAN_LIMITS } from "@/lib/domain/entitlements";
import { INVITE_PARAM, PENDING_INVITE_KEY, captureInviteFromLocation } from "@/lib/invite-link";
import { INDUSTRY_ORDER } from "@/lib/store/industry-starters";
import { PENDING_STARTER_KEY, STARTER_PARAM, captureStarterFromLocation } from "@/lib/starter-link";
import {
  BETA_OFFER_TEXT,
  FREE_PLAN_TEXT,
  INVITE_READY_TEXT,
  SIGNUP_START_HREF,
  START_INVITE_CODE,
  signupStartHref,
} from "./signup-start";

describe("공용 시작 주소", () => {
  it("시작 버튼은 베타 코드를 붙인 /today?invite=BETA2026으로 간다", () => {
    expect(START_INVITE_CODE).toBe("BETA2026");
    expect(SIGNUP_START_HREF).toBe("/today?invite=BETA2026");
    expect(signupStartHref()).toBe(SIGNUP_START_HREF);
  });

  it.each(INDUSTRY_ORDER)("%s 예시 버튼은 업종과 베타 코드를 둘 다 붙인다", (industry) => {
    const href = signupStartHref(industry);
    expect(href).toBe(`/today?starter=${industry}&invite=BETA2026`);
    const params = new URL(href, "https://ilgam.example").searchParams;
    expect(params.get(STARTER_PARAM)).toBe(industry);
    expect(params.get(INVITE_PARAM)).toBe(START_INVITE_CODE);
  });
});

describe("업종과 베타 코드가 같이 붙어 와도 둘 다 이 탭에 남는다", () => {
  class MemoryStorage {
    values = new Map<string, string>();
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
    removeItem(key: string) { this.values.delete(key); }
    clear() { this.values.clear(); }
  }
  const originalUrl = window.location.href;
  afterEach(() => jsdom.reconfigure({ url: originalUrl }));

  // 가입 화면(workspace-auth-gate)·예시 알림(starter-link-notice)·베타 관문이 어느 순서로 먼저 꺼내든 같아야 한다.
  it.each([
    ["초대 먼저", [captureInviteFromLocation, captureStarterFromLocation]],
    ["업종 먼저", [captureStarterFromLocation, captureInviteFromLocation]],
  ] as const)("%s 꺼내도 두 값이 다 남고 주소에서는 지워진다", (_, order) => {
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: new MemoryStorage() });
    jsdom.reconfigure({ url: `https://ilgam.example${signupStartHref("video")}` });
    for (const capture of order) capture();
    expect(window.sessionStorage.getItem(PENDING_STARTER_KEY)).toBe("video");
    expect(window.sessionStorage.getItem(PENDING_INVITE_KEY)).toBe("BETA2026");
    expect(window.location.search).toBe("");
  });
});

describe("시작 버튼 옆 안내 문구", () => {
  it("베타 코드·무료 범위·카드 등록 없음을 요금제 상수에서 가져온다", () => {
    expect(BETA_OFFER_TEXT).toBe(`베타 코드 BETA2026을 넣으면 Pro를 ${BETA_GRANT_DAYS}일 동안 무료로 써요(계정당 한 번).`);
    expect(FREE_PLAN_TEXT).toBe(
      `코드가 없어도 무료로 동시 ${PLAN_LIMITS.free.activeJobs}건·누적 ${PLAN_LIMITS.free.totalJobs}건까지 써요. 카드 등록은 없어요(유료 결제는 아직 없어요).`,
    );
    expect(INVITE_READY_TEXT).toBe(`베타 코드 BETA2026이 자동으로 들어가요. Pro를 ${BETA_GRANT_DAYS}일 동안 무료로 써요(계정당 한 번).`);
  });

  it("시간 숫자·전체 인원 한도·'14일 뒤' 이야기를 쓰지 않고, 코드 뒤 조사가 틀리지 않는다", () => {
    for (const text of [BETA_OFFER_TEXT, FREE_PLAN_TEXT, INVITE_READY_TEXT]) {
      expect(text).not.toMatch(/\d+\s*(초|분)/);
      expect(text).not.toMatch(/500|선착순|뒤에/);
      expect(text).not.toMatch(/BETA2026(가|를)/);
    }
  });
});
