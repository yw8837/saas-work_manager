import { afterEach, describe, expect, it, vi } from "vitest";

import { CLARITY_PAGE_PATHS, configuredClarityProjectId, isClarityPagePath, parseClarityProjectId } from "./clarity-config";
import { ILGAMCHECK_PUBLIC_ENV_KEYS } from "./public-environment";

afterEach(() => {
  vi.unstubAllEnvs();
  delete globalThis.__ILGAMCHECK_PUBLIC_ENV__;
});

describe("Clarity 프로젝트 ID와 쓰는 화면", () => {
  it("영문 소문자·숫자 6~32자만 받고 앞뒤 공백은 지운다", () => {
    expect(parseClarityProjectId("testproject1")).toBe("testproject1");
    expect(parseClarityProjectId("  3t0wlogvdz \n")).toBe("3t0wlogvdz");
    expect(parseClarityProjectId("a".repeat(32))).toBe("a".repeat(32));
    for (const value of ["", "abc12", "a".repeat(33), "TestProject", "test-project", "test project", "테스트123456", "abc?x=1", undefined, null, 123456]) {
      expect(parseClarityProjectId(value), String(value)).toBeNull();
    }
  });

  it("공개 환경 변수 NEXT_PUBLIC_CLARITY_PROJECT_ID에서 읽는다(빌드 값·Sites 주입 값 모두)", () => {
    expect(ILGAMCHECK_PUBLIC_ENV_KEYS).toContain("NEXT_PUBLIC_CLARITY_PROJECT_ID");
    expect(configuredClarityProjectId()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "buildvalue1");
    expect(configuredClarityProjectId()).toBe("buildvalue1");
    globalThis.__ILGAMCHECK_PUBLIC_ENV__ = { NEXT_PUBLIC_CLARITY_PROJECT_ID: "Bad-Value" };
    expect(configuredClarityProjectId()).toBeNull();
  });

  it("메인(/)과 둘러보기(/try)만 쓰는 화면이다", () => {
    expect(CLARITY_PAGE_PATHS).toEqual(["/", "/try"]);
    expect(isClarityPagePath("/")).toBe(true);
    expect(isClarityPagePath("/try")).toBe(true);
    for (const path of ["/today", "/guide", "/examples", "/demo/r", "/r/abc", "/privacy", "/try/x", "/TRY", ""]) {
      expect(isClarityPagePath(path), path).toBe(false);
    }
  });
});
