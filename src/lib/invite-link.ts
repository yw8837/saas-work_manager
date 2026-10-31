/**
 * 메일로 보내는 초대 링크(`/today?invite=CODE`)의 베타 코드를 받아 둔다.
 *
 * - 읽자마자 주소창에서 지운다(history.replaceState). 새로고침·공유·Google 로그인 왕복 주소에 남지 않게.
 * - Google 로그인으로 다른 사이트에 다녀오는 동안만 이 탭의 sessionStorage에 둔다.
 * - 약관 동의 뒤 베타 관문이 기존 activateInviteCode로 적용하고, 성공·실패와 상관없이 지운다.
 * - 코드는 로그·오류 문구·분석 어디에도 쓰지 않는다. 검증은 서버(기존 RPC)가 한다.
 */
export const INVITE_PARAM = "invite";
export const PENDING_INVITE_KEY = "ilgamcheck:pending-invite";
/** 코드 칸 길이와 맞춘 상한. 이상하게 긴 값은 받지 않는다. */
const MAX_INVITE_LENGTH = 64;

function cleanInvite(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.length > MAX_INVITE_LENGTH) return null;
  return trimmed;
}

function readUrlInvite(): string | null {
  if (typeof window === "undefined") return null;
  return cleanInvite(new URLSearchParams(window.location.search).get(INVITE_PARAM));
}

function readStoredInvite(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return cleanInvite(window.sessionStorage.getItem(PENDING_INVITE_KEY));
  } catch {
    return null;
  }
}

/** 주소창의 invite를 sessionStorage로 옮기고 주소에서 지운다. 여러 번 불러도 같다. */
export function captureInviteFromLocation(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has(INVITE_PARAM)) return;
  const code = cleanInvite(params.get(INVITE_PARAM));
  params.delete(INVITE_PARAM);
  const query = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  if (!code) return;
  try {
    window.sessionStorage.setItem(PENDING_INVITE_KEY, code);
  } catch {
    // 저장이 막힌 브라우저에서는 코드를 직접 입력하면 된다.
  }
}

/** 화면을 정할 때만 쓰는 읽기 전용 확인. 아무것도 바꾸지 않는다. */
export function peekPendingInvite(): string | null {
  return readUrlInvite() ?? readStoredInvite();
}

export function readPendingInvite(): string | null {
  return readStoredInvite();
}

export function clearPendingInvite(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // 지울 수 없으면 탭을 닫을 때 브라우저가 지운다.
  }
}
