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

describe("끝난 일감의 날짜 칸(2026-11-11 점검 문제 4)", () => {
  it("마감이 지났어도 D+n 대신 '완료'와 완료일(이 기기 날짜)을 보인다", () => {
    const completedAt = new Date(2026, 9, 31, 15, 0).toISOString();
    expect(dueTileOf("2026-10-27", TODAY, true, completedAt)).toEqual({ label: "완료", date: "10.31", tone: "done", spoken: "10월 31일 완료" });
  });

  it("완료 시각이 없던 예전 일감은 '완료'만 보인다", () => {
    expect(dueTileOf("2026-10-27", TODAY, true)).toEqual({ label: "완료", date: "", tone: "done", spoken: "완료" });
    expect(dueTileOf("2026-10-27", TODAY, true, "잘못된 값")).toMatchObject({ label: "완료", date: "" });
  });

  it("다시 진행해 끝나지 않은 일감은 원래대로 D+n과 지연을 보인다", () => {
    expect(dueTileOf("2026-10-27", TODAY, false, "2026-10-31T06:00:00.000Z")).toMatchObject({ label: "D+7", tone: "late", spoken: "10월 27일 마감, 7일 지연" });
  });
});
