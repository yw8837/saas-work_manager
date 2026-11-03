import { describe, expect, it } from "vitest";
import { dueTileOf } from "./due-tile";

const TODAY = "2026-11-03";

describe("날짜 칸(왼쪽 44px) 글자와 색", () => {
  it("남은 날은 D-n, 오늘은 D-day, 지난 날은 D+n이고 아래는 월.일", () => {
    expect(dueTileOf("2026-11-10", TODAY)).toMatchObject({ label: "D-7", date: "11.10" });
    expect(dueTileOf("2026-11-03", TODAY)).toMatchObject({ label: "D-day", date: "11.03" });
    expect(dueTileOf("2026-11-01", TODAY)).toMatchObject({ label: "D+2", date: "11.01" });
    // 달·해를 넘어도 날짜 차이로 센다.
    expect(dueTileOf("2027-01-05", "2026-12-30")).toMatchObject({ label: "D-6", date: "1.05" });
  });

  it("색: 지연은 late, 2일 이내는 soon, 그 밖은 normal, 끝난 일은 날짜와 상관없이 done", () => {
    expect(dueTileOf("2026-11-02", TODAY).tone).toBe("late");
    expect(dueTileOf("2026-11-03", TODAY).tone).toBe("soon");
    expect(dueTileOf("2026-11-05", TODAY).tone).toBe("soon");
    expect(dueTileOf("2026-11-06", TODAY).tone).toBe("normal");
    expect(dueTileOf("2026-11-01", TODAY, true).tone).toBe("done");
  });

  it("읽어 주는 글은 기존 표기(11월 10일 마감, D-7 / 오늘 마감 / n일 지연)를 쓴다", () => {
    expect(dueTileOf("2026-11-10", TODAY).spoken).toBe("11월 10일 마감, D-7");
    expect(dueTileOf("2026-11-03", TODAY).spoken).toBe("11월 3일 마감, 오늘 마감");
    expect(dueTileOf("2026-11-01", TODAY).spoken).toBe("11월 1일 마감, 2일 지연");
  });
});
