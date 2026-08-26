import { normalizeRedeemedCodes } from "@/lib/domain";
import { createSeedState, createStarterState, type AppState } from "./seed";

export const STORAGE_KEY = "ilgamcheck:mvp:v2";
export const LEGACY_STORAGE_KEY = "ilgamcheck:mvp:v1";
const ACTIVITY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVITY_DATE_LIMIT = 90;

export function storageKeyForUser(userId: string): string {
  return `${STORAGE_KEY}:user:${userId}`;
}

/**
 * 사파리 프라이빗이나 쿠키 차단 환경은 window.localStorage 접근 자체가 던진다.
 * 여기서 한 번 막아야 읽기·쓰기 양쪽이 같이 안전해진다.
 */
function getBrowserStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function looksLikeAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppState>;
  return (
    candidate.version === 2 &&
    Array.isArray(candidate.packages) &&
    Array.isArray(candidate.options) &&
    Array.isArray(candidate.jobs) &&
    !!candidate.settings
  );
}

/**
 * 새로 추가된 필드(누적 카운터·체험·베타)를 저장본에 덧붙인다.
 * 스키마 버전은 올리지 않는다 — 예전 저장본도 그대로 읽히는 순수 추가 필드다.
 *
 * 누적 카운터가 없던 사용자는 jobs.length로 시작해 손해도 이득도 보지 않는다.
 * 값이 있으면 jobs.length와 비교해 큰 쪽을 쓴다. 누적 수는 절대 현재 일감 수보다 작을 수 없고,
 * 이렇게 해야 저장본이 손상되어도 카운터가 뒤로 가지 않는다.
 */
export function normalizeAppState(state: AppState): AppState {
  const raw = (state as Partial<AppState>).jobsCreatedTotal;
  const stored = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0;
  return {
    ...state,
    jobsCreatedTotal: Math.max(stored, state.jobs.length, 0),
    trialStartedAt: state.trialStartedAt ?? null,
    betaAccess: state.betaAccess ?? null,
    activityDates: normalizeActivityDates((state as Partial<AppState>).activityDates),
    redeemedInviteCodes: normalizeRedeemedCodes(state.redeemedInviteCodes),
  };
}

function normalizeActivityDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => (
    typeof item === "string" && ACTIVITY_DATE_PATTERN.test(item)
  )))].sort().slice(-ACTIVITY_DATE_LIMIT);
}

export function recordActivityDate(state: AppState, date: string): AppState {
  if (!ACTIVITY_DATE_PATTERN.test(date)) return state;
  const current = normalizeActivityDates(state.activityDates);
  if (current.includes(date) && current.length === state.activityDates.length) return state;
  return {
    ...state,
    activityDates: normalizeActivityDates([...current, date]),
  };
}

function migrateLegacyState(value: unknown): AppState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AppState> & { version?: number };
  if (!Array.isArray(candidate.packages) || !Array.isArray(candidate.options) || !Array.isArray(candidate.jobs)) {
    return null;
  }

  const fallback = createSeedState();
  return normalizeAppState({
    version: 2,
    packages: candidate.packages,
    options: candidate.options,
    jobs: candidate.jobs,
    settings: candidate.settings ?? fallback.settings,
    jobsCreatedTotal: candidate.jobsCreatedTotal ?? 0,
    trialStartedAt: candidate.trialStartedAt ?? null,
    betaAccess: candidate.betaAccess ?? null,
    activityDates: normalizeActivityDates(candidate.activityDates),
    redeemedInviteCodes: normalizeRedeemedCodes(candidate.redeemedInviteCodes),
  } as AppState);
}

export function loadState(storage?: Storage, fallbackDate?: string, key = STORAGE_KEY): AppState {
  const target = getBrowserStorage(storage);
  if (!target) return createSeedState(fallbackDate);

  // getItem도 차단 환경에서는 던진다. 읽기 실패는 "저장본이 없다"와 같게 다룬다.
  let saved: string | null = null;
  let legacy: string | null = null;
  try {
    saved = target.getItem(key);
    legacy = key === STORAGE_KEY ? target.getItem(LEGACY_STORAGE_KEY) : null;
  } catch {
    return createStarterState(fallbackDate);
  }

  // 첫 방문에는 예시 고객·지연 일감 대신 빈 작업대에서 시작한다.
  if (!saved && !legacy) return createStarterState(fallbackDate);

  try {
    const parsed: unknown = JSON.parse(saved ?? legacy ?? "null");
    if (looksLikeAppState(parsed)) return normalizeAppState(parsed);
    const migrated = migrateLegacyState(parsed);
    if (!migrated) return createSeedState(fallbackDate);
    target.setItem(key, JSON.stringify(migrated));
    if (legacy && key === STORAGE_KEY) target.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  } catch {
    return createSeedState(fallbackDate);
  }
}

/**
 * 저장에 성공했는지 돌려준다.
 * 용량 초과나 쓰기 차단은 클릭 한 번마다 일어날 수 있는 정상적인 실패라
 * 예외로 밖에 던지지 않는다 — 던지면 이벤트 핸들러가 통째로 죽어 화면이 멈춘다.
 */
export function saveState(state: AppState, storage?: Storage, key = STORAGE_KEY): boolean {
  const target = getBrowserStorage(storage);
  if (!target) return false;
  try {
    target.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * 바뀐 상태와 그 상태를 실제로 저장했는지를 함께 돌려준다.
 * 저장 실패를 조용히 삼키면 사용자는 화면에 반영된 편집이 사라진 걸 탭을 닫은 뒤에야 안다.
 * 화면은 갱신하되 저장 실패는 반드시 위로 알려야 한다.
 */
export function mutateStoredState(
  mutator: (current: AppState) => AppState,
  storage?: Storage,
  key = STORAGE_KEY,
): { state: AppState; saved: boolean } {
  const current = loadState(storage, undefined, key);
  const next = mutator(current);
  const saved = saveState(next, storage, key);
  return { state: next, saved };
}

export function resetState(storage?: Storage, referenceDate?: string, key = STORAGE_KEY): AppState {
  const target = getBrowserStorage(storage);
  // 지우기 전에 되돌리면 안 되는 값을 먼저 읽는다.
  const previous = target ? loadState(target, referenceDate, key) : null;
  try {
    target?.removeItem(key);
  } catch {
    // 지우지 못해도 아래에서 새 상태를 돌려주므로 화면은 초기화된다.
  }
  // 초기화도 첫 방문과 같은 빈 작업대로 되돌린다.
  const fresh = createStarterState(referenceDate);
  return {
    ...fresh,
    // 누적 카운터·체험·베타·쓴 코드는 초기화로 되돌아가지 않는다.
    // 되돌아가면 "전체 초기화"가 무료 한도를 무한히 푸는 우회로가 된다.
    jobsCreatedTotal: Math.max(previous?.jobsCreatedTotal ?? 0, fresh.jobsCreatedTotal),
    trialStartedAt: previous?.trialStartedAt ?? fresh.trialStartedAt,
    betaAccess: previous?.betaAccess ?? fresh.betaAccess,
    redeemedInviteCodes: normalizeRedeemedCodes(previous?.redeemedInviteCodes),
  };
}
