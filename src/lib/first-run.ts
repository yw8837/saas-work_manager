import type { Job } from "@/lib/domain";

/**
 * 첫 실행 체크리스트(패키지 확인 → 첫 일감 → 고객 링크 보내기)의 진행 표시.
 * 작업공간 데이터(서버 저장본)는 건드리지 않고, 이 브라우저에만 "봤다/보냈다" 표시를 남긴다.
 * 저장소가 막혀 있어도 화면은 일감 데이터만으로 판단할 수 있게 모든 읽기·쓰기를 감싼다.
 */
export const FIRST_RUN_STORAGE_KEY = "ilgamcheck:first-run:v1";
const CHANGE_EVENT = "ilgam:first-run";

export type FirstRunFlags = {
  /** 패키지 화면을 열었거나 업종 예시를 골랐다. */
  packagesReviewed: boolean;
  /** 고객 링크나 카톡 문구를 한 번이라도 복사했다. */
  linkShared: boolean;
  /** 일감이 생긴 뒤 보이는 작은 체크리스트를 닫았다. */
  dismissed: boolean;
};

const EMPTY_FLAGS: FirstRunFlags = { packagesReviewed: false, linkShared: false, dismissed: false };
let cachedRaw: string | null | undefined;
let cachedFlags: FirstRunFlags = EMPTY_FLAGS;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(FIRST_RUN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readFirstRunFlags(): FirstRunFlags {
  if (typeof window === "undefined") return EMPTY_FLAGS;
  const raw = readRaw();
  // useSyncExternalStore는 같은 값이면 같은 객체를 돌려받아야 다시 그리지 않는다.
  if (raw === cachedRaw) return cachedFlags;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<FirstRunFlags>) : {};
    cachedFlags = {
      packagesReviewed: parsed.packagesReviewed === true,
      linkShared: parsed.linkShared === true,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    cachedFlags = EMPTY_FLAGS;
  }
  return cachedFlags;
}

export const serverFirstRunFlags = () => EMPTY_FLAGS;

export function markFirstRun(flag: keyof FirstRunFlags): void {
  if (typeof window === "undefined") return;
  const current = readFirstRunFlags();
  if (current[flag]) return;
  try {
    window.localStorage.setItem(FIRST_RUN_STORAGE_KEY, JSON.stringify({ ...current, [flag]: true }));
  } catch {
    // 저장이 막힌 브라우저에서도 체크리스트는 일감 데이터로 다시 계산된다.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeFirstRun(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export type FirstRunStepId = "packages" | "first-job" | "send-link";
export type FirstRunStep = { id: FirstRunStepId; done: boolean };

/**
 * 단계별 완료 여부. 브라우저 표시가 없어도(다른 기기·저장 차단) 일감 데이터로 알 수 있는 건 데이터를 우선한다.
 * - 일감을 만들었으면 패키지는 이미 고른 것이다.
 * - 고객 링크로 들어온 요청이 하나라도 있으면 링크는 이미 보낸 것이다.
 */
export function firstRunSteps(input: { jobs: Job[]; flags: FirstRunFlags; packagesCustomized: boolean }): FirstRunStep[] {
  const hasJob = input.jobs.length > 0;
  const customerUsedLink = input.jobs.some((job) => job.revisions.some((revision) => revision.source === "public"));
  return [
    { id: "packages", done: input.flags.packagesReviewed || input.packagesCustomized || hasJob },
    { id: "first-job", done: hasJob },
    { id: "send-link", done: hasJob && (input.flags.linkShared || customerUsedLink) },
  ];
}
