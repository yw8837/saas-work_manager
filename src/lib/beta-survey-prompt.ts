/**
 * 베타 Pro 이용권이 끝난 뒤 작업 화면에 띄우는 설문 팝업의 기록과 판정.
 *
 * - 기록은 이 브라우저의 localStorage에만 남긴다(서버·DB에는 남기지 않는다). 계정마다 키를 나눈다.
 * - '설문 작성하기'·'다시 보지 않기'를 고르면 다시 띄우지 않는다.
 * - '나중에 할게요'(닫기·Esc·바깥 누르기 포함)는 3일 뒤 접속 때 다시 띄우고, 3번 고르면 더는 띄우지 않는다.
 * - 저장소를 못 쓰면(접근 자체가 예외) 오류 없이 이번 방문에 한 번만 띄운다.
 * 지금 시각은 늘 인자로 받는다(시험에서 시각을 옮길 수 있게).
 */
export const BETA_SURVEY_PROMPT_KEY = "ilgamcheck:beta-survey-prompt:v1";
/** '나중에 할게요' 뒤 다시 띄울 때까지 기다리는 날 수. */
export const BETA_SURVEY_LATER_DAYS = 3;
/** '나중에 할게요'를 이만큼 고르면 더는 띄우지 않는다. */
export const BETA_SURVEY_LATER_LIMIT = 3;

const DAY_MS = 86_400_000;

export type BetaSurveyPromptChoice = "open" | "later" | "never";

export type BetaSurveyPromptRecord = {
  /** '나중에 할게요'를 고른 횟수. */
  laterCount: number;
  /** 마지막으로 '나중에 할게요'를 고른 시각(ISO). */
  lastLaterAt: string | null;
  /** '설문 작성하기'(작성하러 감) 또는 '다시 보지 않기'. 아직 고르지 않았으면 null. */
  answer: "opened" | "never" | null;
};

export const EMPTY_BETA_SURVEY_PROMPT_RECORD: BetaSurveyPromptRecord = { laterCount: 0, lastLaterAt: null, answer: null };

/** 저장소를 못 쓸 때 이번 방문 동안만 기억하는 곳(키 → 기록·이번 방문에 띄웠는지). */
export type BetaSurveyPromptMemory = Map<string, { record: BetaSurveyPromptRecord; shown: boolean }>;

/** 계정별 키. accountKey에는 로그인 계정의 id(로컬 모드는 "local")만 넣는다. 이메일 같은 개인정보는 넣지 않는다. */
export function betaSurveyPromptKey(accountKey: string): string {
  return `${BETA_SURVEY_PROMPT_KEY}:${accountKey}`;
}

export function parseBetaSurveyPromptRecord(raw: string | null): BetaSurveyPromptRecord {
  if (!raw) return EMPTY_BETA_SURVEY_PROMPT_RECORD;
  try {
    const parsed = JSON.parse(raw) as Partial<BetaSurveyPromptRecord> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY_BETA_SURVEY_PROMPT_RECORD;
    const laterCount = typeof parsed.laterCount === "number" && Number.isFinite(parsed.laterCount)
      ? Math.max(Math.floor(parsed.laterCount), 0)
      : 0;
    const lastLaterAt = typeof parsed.lastLaterAt === "string" && !Number.isNaN(Date.parse(parsed.lastLaterAt))
      ? parsed.lastLaterAt
      : null;
    const answer = parsed.answer === "opened" || parsed.answer === "never" ? parsed.answer : null;
    return { laterCount, lastLaterAt, answer };
  } catch {
    return EMPTY_BETA_SURVEY_PROMPT_RECORD;
  }
}

/** 고른 버튼을 기록에 더한다. */
export function nextBetaSurveyPromptRecord(
  record: BetaSurveyPromptRecord,
  choice: BetaSurveyPromptChoice,
  now: Date,
): BetaSurveyPromptRecord {
  if (choice === "open") return { ...record, answer: "opened" };
  if (choice === "never") return { ...record, answer: "never" };
  return { ...record, laterCount: record.laterCount + 1, lastLaterAt: now.toISOString() };
}

/** 설문을 열었거나 다시 보지 않기로 했는지. 이런 사람에게는 상단 띠 안내도 숨긴다. */
export function betaSurveyPromptAnswered(record: BetaSurveyPromptRecord): boolean {
  return record.answer !== null;
}

/**
 * 이번 접속에서 팝업을 띄울지.
 * eligible: 베타 이용권이 끝났고(betaExpired) 설문 주소가 있는 작업 화면인지.
 */
export function shouldShowBetaSurveyPrompt({
  eligible,
  storageAvailable,
  record,
  shownThisVisit,
  now,
}: {
  eligible: boolean;
  storageAvailable: boolean;
  record: BetaSurveyPromptRecord;
  shownThisVisit: boolean;
  now: Date;
}): boolean {
  if (!eligible) return false;
  if (betaSurveyPromptAnswered(record)) return false;
  if (record.laterCount >= BETA_SURVEY_LATER_LIMIT) return false;
  // 저장소를 못 쓰면 다음 접속을 알 수 없으니 이번 방문에 한 번만 띄운다.
  if (!storageAvailable && shownThisVisit) return false;
  if (record.lastLaterAt) {
    const elapsed = now.getTime() - Date.parse(record.lastLaterAt);
    if (elapsed < BETA_SURVEY_LATER_DAYS * DAY_MS) return false;
  }
  return true;
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

/**
 * 기록을 읽는다. 저장소가 없거나 읽다 예외가 나면 이번 방문 기억을 쓴다.
 * 한 번이라도 저장에 실패한 키는 이번 방문 동안 기억 쪽을 따른다.
 */
export function loadBetaSurveyPrompt(
  storage: ReadableStorage | undefined,
  accountKey: string,
  memory: BetaSurveyPromptMemory,
): { storageAvailable: boolean; record: BetaSurveyPromptRecord; shownThisVisit: boolean } {
  const key = betaSurveyPromptKey(accountKey);
  const remembered = memory.get(key);
  if (remembered) return { storageAvailable: false, record: remembered.record, shownThisVisit: remembered.shown };
  if (!storage) return { storageAvailable: false, record: EMPTY_BETA_SURVEY_PROMPT_RECORD, shownThisVisit: false };
  try {
    return { storageAvailable: true, record: parseBetaSurveyPromptRecord(storage.getItem(key)), shownThisVisit: false };
  } catch {
    return { storageAvailable: false, record: EMPTY_BETA_SURVEY_PROMPT_RECORD, shownThisVisit: false };
  }
}

/** 저장소를 못 쓸 때 '이번 방문에 띄웠다'를 기억한다. */
export function markBetaSurveyPromptShown(accountKey: string, record: BetaSurveyPromptRecord, memory: BetaSurveyPromptMemory): void {
  memory.set(betaSurveyPromptKey(accountKey), { record, shown: true });
}

/** 기록을 남긴다. 저장에 실패하면 예외 없이 이번 방문 기억에 남기고 false를 돌려준다. */
export function saveBetaSurveyPrompt(
  storage: WritableStorage | undefined,
  accountKey: string,
  record: BetaSurveyPromptRecord,
  memory: BetaSurveyPromptMemory,
): boolean {
  const key = betaSurveyPromptKey(accountKey);
  if (storage && !memory.has(key)) {
    try {
      storage.setItem(key, JSON.stringify(record));
      return true;
    } catch {
      // 아래에서 이번 방문 기억에 남긴다.
    }
  }
  memory.set(key, { record, shown: true });
  return false;
}
