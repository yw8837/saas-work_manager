/**
 * 링크에 붙은 유입 경로 표시(`?utm_source=mail&utm_medium=email&utm_campaign=cold1`)를 받아 둔다.
 *
 * - 어느 경로(메일·블로그·크몽 등)로 가입했는지 계정당 한 번만 남기려는 것이다(개인정보처리방침 1절 '유입 경로 확인').
 * - 읽자마자 주소창에서 지우고, Google 로그인으로 다녀오는 동안만 이 탭의 sessionStorage에 둔다(invite-link.ts와 같은 방식).
 * - 값은 소문자·숫자·`_`·`-` 40자까지만 받고, 전화번호처럼 숫자가 6자리 이상 이어지면 받지 않는다.
 *   형식만으로 개인정보를 다 막지는 못하므로, 받는 사람을 구분하는 값은 링크에 붙이지 않는다(운영 규칙).
 * - 기록은 약관 동의 뒤 서버 RPC(record_signup_source)가 하고, 새 계정에만 남는다.
 */
export const ACQUISITION_PARAMS = ["utm_source", "utm_medium", "utm_campaign"] as const;
export const PENDING_ACQUISITION_KEY = "ilgamcheck:pending-acquisition";

const VALUE_PATTERN = /^[a-z0-9_-]{1,40}$/;
const LONG_DIGITS = /[0-9]{6,}/;

export type Acquisition = {
  source: string;
  medium: string | null;
  campaign: string | null;
};

function cleanValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return VALUE_PATTERN.test(normalized) && !LONG_DIGITS.test(normalized) ? normalized : null;
}

function cleanAcquisition(source: unknown, medium: unknown, campaign: unknown): Acquisition | null {
  const cleanSource = cleanValue(source);
  if (!cleanSource) return null;
  return { source: cleanSource, medium: cleanValue(medium), campaign: cleanValue(campaign) };
}

/** 주소창의 유입 경로 표시를 sessionStorage로 옮기고 주소에서 지운다. 여러 번 불러도 같다. */
export function captureAcquisitionFromLocation(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (!ACQUISITION_PARAMS.some((name) => params.has(name))) return;
  const acquisition = cleanAcquisition(params.get("utm_source"), params.get("utm_medium"), params.get("utm_campaign"));
  for (const name of ACQUISITION_PARAMS) params.delete(name);
  const query = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  if (!acquisition) return;
  try {
    window.sessionStorage.setItem(PENDING_ACQUISITION_KEY, JSON.stringify(acquisition));
  } catch {
    // 저장이 막힌 브라우저에서는 유입 경로를 남기지 않는다. 가입에는 영향이 없다.
  }
}

export function readPendingAcquisition(): Acquisition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_ACQUISITION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    return cleanAcquisition(record.source, record.medium, record.campaign);
  } catch {
    return null;
  }
}

export function clearPendingAcquisition(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_ACQUISITION_KEY);
  } catch {
    // 지울 수 없으면 탭을 닫을 때 브라우저가 지운다.
  }
}
