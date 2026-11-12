import { describe, expect, it } from "vitest";

import {
  BETA_SURVEY_LATER_DAYS,
  BETA_SURVEY_LATER_LIMIT,
  BETA_SURVEY_PROMPT_KEY,
  EMPTY_BETA_SURVEY_PROMPT_RECORD,
  betaSurveyPromptAnswered,
  betaSurveyPromptKey,
  loadBetaSurveyPrompt,
  markBetaSurveyPromptShown,
  nextBetaSurveyPromptRecord,
  parseBetaSurveyPromptRecord,
  saveBetaSurveyPrompt,
  shouldShowBetaSurveyPrompt,
  type BetaSurveyPromptMemory,
  type BetaSurveyPromptRecord,
} from "./beta-survey-prompt";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-11-12T09:00:00.000Z");

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const throwingStorage = {
  getItem(): string | null { throw new Error("저장소 차단"); },
  setItem(): void { throw new Error("저장소 차단"); },
};

function show(record: BetaSurveyPromptRecord, options: Partial<Parameters<typeof shouldShowBetaSurveyPrompt>[0]> = {}) {
  return shouldShowBetaSurveyPrompt({ eligible: true, storageAvailable: true, record, shownThisVisit: false, now: NOW, ...options });
}

function later(record: BetaSurveyPromptRecord, at: Date) {
  return nextBetaSurveyPromptRecord(record, "later", at);
}

describe("설문 팝업 판정", () => {
  it("이용권이 끝나지 않았거나 설문 주소가 없으면(eligible 거짓) 띄우지 않는다", () => {
    expect(show(EMPTY_BETA_SURVEY_PROMPT_RECORD, { eligible: false })).toBe(false);
    expect(show(EMPTY_BETA_SURVEY_PROMPT_RECORD)).toBe(true);
  });

  it("'나중에 할게요' 뒤에는 3일이 지나기 전까지 안 띄우고, 3일이 지나면 다시 띄운다", () => {
    expect(BETA_SURVEY_LATER_DAYS).toBe(3);
    const record = later(EMPTY_BETA_SURVEY_PROMPT_RECORD, NOW);
    expect(record).toEqual({ laterCount: 1, lastLaterAt: NOW.toISOString(), answer: null });
    expect(show(record, { now: NOW })).toBe(false);
    expect(show(record, { now: new Date(NOW.getTime() + 3 * DAY_MS - 1) })).toBe(false);
    expect(show(record, { now: new Date(NOW.getTime() + 3 * DAY_MS) })).toBe(true);
  });

  it("'나중에 할게요'를 3번 고르면 3일이 지나도 더는 띄우지 않는다", () => {
    expect(BETA_SURVEY_LATER_LIMIT).toBe(3);
    let record = EMPTY_BETA_SURVEY_PROMPT_RECORD;
    let at = NOW;
    for (let count = 1; count <= 2; count += 1) {
      record = later(record, at);
      at = new Date(at.getTime() + 3 * DAY_MS);
      expect(show(record, { now: at })).toBe(true);
    }
    record = later(record, at);
    expect(record.laterCount).toBe(3);
    expect(show(record, { now: new Date(at.getTime() + 30 * DAY_MS) })).toBe(false);
    // 끝까지 고르지 않은 사람에게 상단 띠는 계속 보인다.
    expect(betaSurveyPromptAnswered(record)).toBe(false);
  });

  it("'설문 작성하기'나 '다시 보지 않기'를 고르면 다시 띄우지 않고 띠도 숨긴다", () => {
    const opened = nextBetaSurveyPromptRecord(EMPTY_BETA_SURVEY_PROMPT_RECORD, "open", NOW);
    const never = nextBetaSurveyPromptRecord(later(EMPTY_BETA_SURVEY_PROMPT_RECORD, NOW), "never", NOW);
    expect(opened.answer).toBe("opened");
    expect(never).toMatchObject({ answer: "never", laterCount: 1 });
    for (const record of [opened, never]) {
      expect(show(record, { now: new Date(NOW.getTime() + 60 * DAY_MS) })).toBe(false);
      expect(betaSurveyPromptAnswered(record)).toBe(true);
    }
  });

  it("저장소를 못 쓰면 이번 방문에 한 번만 띄운다", () => {
    expect(show(EMPTY_BETA_SURVEY_PROMPT_RECORD, { storageAvailable: false, shownThisVisit: false })).toBe(true);
    expect(show(EMPTY_BETA_SURVEY_PROMPT_RECORD, { storageAvailable: false, shownThisVisit: true })).toBe(false);
  });

  it("깨진 기록은 처음 상태로 읽는다", () => {
    expect(parseBetaSurveyPromptRecord(null)).toEqual(EMPTY_BETA_SURVEY_PROMPT_RECORD);
    expect(parseBetaSurveyPromptRecord("{")).toEqual(EMPTY_BETA_SURVEY_PROMPT_RECORD);
    expect(parseBetaSurveyPromptRecord("null")).toEqual(EMPTY_BETA_SURVEY_PROMPT_RECORD);
    expect(parseBetaSurveyPromptRecord(JSON.stringify({ laterCount: "x", lastLaterAt: "어제", answer: "maybe" })))
      .toEqual(EMPTY_BETA_SURVEY_PROMPT_RECORD);
  });
});

describe("설문 팝업 기록", () => {
  it("키는 ilgamcheck: 접두어에 계정 id를 붙인다", () => {
    expect(BETA_SURVEY_PROMPT_KEY.startsWith("ilgamcheck:")).toBe(true);
    expect(betaSurveyPromptKey("user-1")).toBe(`${BETA_SURVEY_PROMPT_KEY}:user-1`);
  });

  it("계정마다 기록을 따로 둔다", () => {
    const storage = new MemoryStorage();
    const memory: BetaSurveyPromptMemory = new Map();
    const neverA = nextBetaSurveyPromptRecord(EMPTY_BETA_SURVEY_PROMPT_RECORD, "never", NOW);
    expect(saveBetaSurveyPrompt(storage, "user-a", neverA, memory)).toBe(true);

    const a = loadBetaSurveyPrompt(storage, "user-a", memory);
    const b = loadBetaSurveyPrompt(storage, "user-b", memory);
    expect(a).toEqual({ storageAvailable: true, record: neverA, shownThisVisit: false });
    expect(b).toEqual({ storageAvailable: true, record: EMPTY_BETA_SURVEY_PROMPT_RECORD, shownThisVisit: false });
    expect(shouldShowBetaSurveyPrompt({ eligible: true, ...a, now: NOW })).toBe(false);
    expect(shouldShowBetaSurveyPrompt({ eligible: true, ...b, now: NOW })).toBe(true);
    expect([...storage.values.keys()]).toEqual([betaSurveyPromptKey("user-a")]);
  });

  it("저장소가 예외를 던져도 오류 없이 이번 방문 기억으로 한 번만 띄운다", () => {
    const memory: BetaSurveyPromptMemory = new Map();
    const first = loadBetaSurveyPrompt(throwingStorage, "user-a", memory);
    expect(first).toEqual({ storageAvailable: false, record: EMPTY_BETA_SURVEY_PROMPT_RECORD, shownThisVisit: false });
    expect(shouldShowBetaSurveyPrompt({ eligible: true, ...first, now: NOW })).toBe(true);
    markBetaSurveyPromptShown("user-a", first.record, memory);

    const second = loadBetaSurveyPrompt(throwingStorage, "user-a", memory);
    expect(shouldShowBetaSurveyPrompt({ eligible: true, ...second, now: new Date(NOW.getTime() + 10 * DAY_MS) })).toBe(false);

    const never = nextBetaSurveyPromptRecord(second.record, "never", NOW);
    expect(() => saveBetaSurveyPrompt(throwingStorage, "user-a", never, memory)).not.toThrow();
    expect(loadBetaSurveyPrompt(throwingStorage, "user-a", memory).record.answer).toBe("never");
    // 다른 계정은 이번 방문 기억도 따로다.
    expect(loadBetaSurveyPrompt(throwingStorage, "user-b", memory).shownThisVisit).toBe(false);
  });

  it("저장소 자체가 없으면(접근 차단) 이번 방문 기억을 쓴다", () => {
    const memory: BetaSurveyPromptMemory = new Map();
    expect(loadBetaSurveyPrompt(undefined, "local", memory).storageAvailable).toBe(false);
    const record = later(EMPTY_BETA_SURVEY_PROMPT_RECORD, NOW);
    expect(saveBetaSurveyPrompt(undefined, "local", record, memory)).toBe(false);
    expect(loadBetaSurveyPrompt(undefined, "local", memory)).toEqual({ storageAvailable: false, record, shownThisVisit: true });
  });
});
