/**
 * 목록 줄 왼쪽 44px 날짜 칸(디자인 A 3절 3번). 위 큰 글자 D-7/D-day/D+2, 아래 작은 글자 월.일.
 * 색: 지연 late(빨강), 2일 이내 soon(주황), 그 밖 normal(파랑), 끝난 일 done(회색, 위 '완료'·아래 완료일).
 * 읽어 주는 글(spoken)은 화면 곳곳에서 쓰던 기존 표기(11월 10일 마감, D-7 / 오늘 마감 / n일 지연)를 그대로 쓴다.
 */
export type DueTileTone = "late" | "soon" | "normal" | "done";
export type DueTile = { label: string; date: string; tone: DueTileTone; spoken: string };

/** 날 수 차이(마감 − 오늘). 둘 다 `YYYY-MM-DD`, 시간대 영향이 없게 UTC 자정끼리 뺀다. */
function daysBetween(today: string, due: string): number {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(due) - toUtc(today)) / 86_400_000);
}

export function dueTileOf(dueDate: string, today: string, done = false, completedAt?: string): DueTile {
  if (done) {
    // 끝난 일감은 마감이 지났어도 지연(D+n) 대신 완료로 보인다. 완료 시각이 있으면 그날(이 기기 날짜)을 아래 줄에 쓴다.
    const completedDay = completedAt && !Number.isNaN(Date.parse(completedAt)) ? localTodayISO(new Date(completedAt)) : null;
    if (!completedDay) return { label: "완료", date: "", tone: "done", spoken: "완료" };
    const [, doneMonth, doneDay] = completedDay.split("-").map(Number);
    return { label: "완료", date: `${doneMonth}.${String(doneDay).padStart(2, "0")}`, tone: "done", spoken: `${doneMonth}월 ${doneDay}일 완료` };
  }
  const diff = daysBetween(today, dueDate);
  const [, month, day] = dueDate.split("-").map(Number);
  const label = diff === 0 ? "D-day" : diff > 0 ? `D-${diff}` : `D+${-diff}`;
  const tone: DueTileTone = diff < 0 ? "late" : diff <= 2 ? "soon" : "normal";
  const words = diff === 0 ? "오늘 마감" : diff > 0 ? `D-${diff}` : `${-diff}일 지연`;
  return {
    label,
    date: `${month}.${String(day).padStart(2, "0")}`,
    tone,
    spoken: `${month}월 ${day}일 마감, ${words}`,
  };
}

/** 이 기기 날짜로 오늘(`YYYY-MM-DD`). 화면의 다른 D-day(getDday)와 같은 기준이다. */
export function localTodayISO(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
