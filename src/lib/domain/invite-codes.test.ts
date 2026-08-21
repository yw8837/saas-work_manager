import { describe, expect, it } from "vitest";
import {
  BETA_INVITE_CODES,
  addRedeemedCode,
  hasRedeemedCode,
  isValidInviteCode,
  normalizeInviteCode,
  normalizeRedeemedCodes,
} from "./invite-codes";

describe("beta invite codes", () => {
  it("accepts the seeded codes exactly", () => {
    for (const code of BETA_INVITE_CODES) {
      expect(isValidInviteCode(code)).toBe(true);
    }
  });

  it("ignores case and surrounding whitespace", () => {
    expect(isValidInviteCode("kmong2026")).toBe(true);
    expect(isValidInviteCode("  Beta2026  ")).toBe(true);
    expect(isValidInviteCode("\tsoomgo2026\n")).toBe(true);
  });

  it("rejects unknown, empty, and near-miss codes", () => {
    expect(isValidInviteCode("")).toBe(false);
    expect(isValidInviteCode("   ")).toBe(false);
    expect(isValidInviteCode("BETA2025")).toBe(false);
    expect(isValidInviteCode("BETA 2026")).toBe(false);
    expect(isValidInviteCode("BETA2026!")).toBe(false);
  });

  it("normalizes to the stored form", () => {
    expect(normalizeInviteCode("  beta2026 ")).toBe("BETA2026");
  });
});

describe("한 번 쓴 코드 기억하기", () => {
  it("기간이 끝나도 다시 쓴 코드로 남는다", () => {
    // 30일이 지나 승급이 사라져도, 같은 코드로 30일을 또 받을 수는 없어야 한다.
    const used = addRedeemedCode([], "BETA2026");
    expect(hasRedeemedCode(used, "BETA2026")).toBe(true);
    expect(hasRedeemedCode(used, "KMONG2026")).toBe(false);
  });

  it("대소문자·공백이 달라도 같은 코드로 본다", () => {
    const used = addRedeemedCode([], "  beta2026 ");
    expect(used).toEqual(["BETA2026"]);
    expect(hasRedeemedCode(used, "beta2026")).toBe(true);
    expect(hasRedeemedCode(used, "\tBETA2026\n")).toBe(true);
  });

  it("같은 코드를 여러 번 넣어도 목록은 한 줄만 늘어난다", () => {
    const once = addRedeemedCode([], "BETA2026");
    const twice = addRedeemedCode(once, "beta2026");
    expect(twice).toEqual(["BETA2026"]);

    const another = addRedeemedCode(twice, "KMONG2026");
    expect(another).toEqual(["BETA2026", "KMONG2026"]);
    // 원래 목록은 건드리지 않는다.
    expect(twice).toEqual(["BETA2026"]);
  });

  it("저장소에서 온 이상한 값도 빈 목록으로 받아낸다", () => {
    expect(normalizeRedeemedCodes(undefined)).toEqual([]);
    expect(normalizeRedeemedCodes(null)).toEqual([]);
    expect(normalizeRedeemedCodes("BETA2026")).toEqual([]);
    expect(normalizeRedeemedCodes({ code: "BETA2026" })).toEqual([]);
    expect(normalizeRedeemedCodes([1, null, "", "  ", "beta2026", "BETA2026"])).toEqual(["BETA2026"]);
    expect(hasRedeemedCode(undefined, "BETA2026")).toBe(false);
  });

  it("빈 코드는 목록에 들어가지도, 쓴 것으로 세지지도 않는다", () => {
    expect(addRedeemedCode(["BETA2026"], "   ")).toEqual(["BETA2026"]);
    expect(hasRedeemedCode(["BETA2026"], "")).toBe(false);
  });
});
