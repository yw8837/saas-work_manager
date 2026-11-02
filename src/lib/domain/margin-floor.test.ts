import { describe, expect, it } from "vitest";

import { marginShortfall, marginWarningText, parseFloorInput } from "./margin-floor";

describe("한 건에 최소 남길 돈", () => {
  it("기준을 정했고(0보다 큼) 남는 돈이 적을 때만 모자란 금액을 준다", () => {
    expect(marginShortfall(695000, undefined)).toBeNull();
    expect(marginShortfall(695000, 0)).toBeNull();
    expect(marginShortfall(695000, 700000)).toBe(5000);
    expect(marginShortfall(-10000, 50000)).toBe(60000);
    expect(marginShortfall(700000, 700000)).toBeNull();
    expect(marginShortfall(800000, 700000)).toBeNull();
  });

  it("입력 글은 숫자·쉼표만 받고, 빈칸·글자·음수·10억 넘는 값은 버린다", () => {
    expect(parseFloorInput("300,000")).toBe(300000);
    expect(parseFloorInput(" 50000 ")).toBe(50000);
    expect(parseFloorInput("0")).toBe(0);
    expect(parseFloorInput("1,000,000,000")).toBe(1_000_000_000);
    expect(parseFloorInput("")).toBeUndefined();
    expect(parseFloorInput("abc")).toBeUndefined();
    expect(parseFloorInput("-1")).toBeUndefined();
    expect(parseFloorInput("1.5")).toBeUndefined();
    expect(parseFloorInput(",")).toBeUndefined();
    expect(parseFloorInput("1,000,000,001")).toBeUndefined();
  });

  it("경고 한 줄은 남는 돈과 모자란 금액을 쓰고, 손해면 손해라고 쓴다(시세·권장가는 말하지 않음)", () => {
    expect(marginWarningText(695000, 5000)).toBe("남는 돈 695,000원 · 내 기준보다 5,000원 적어요");
    expect(marginWarningText(-10000, 60000)).toBe("10,000원 손해 · 내 기준보다 60,000원 적어요");
    expect(marginWarningText(695000, 5000)).not.toMatch(/시세|권장|받으세요/);
  });
});
