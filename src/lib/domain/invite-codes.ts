/**
 * 베타 초대 코드 목록과 검증.
 *
 * ⚠️ 보안 장치가 아니다.
 * 코드 목록이 클라이언트 번들에 그대로 들어가고 검증도 브라우저에서만 이뤄진다.
 * 브라우저 개발자 도구로 로컬 저장소(betaAccess)를 직접 고치면 누구나 우회할 수 있다.
 * 지금은 결제가 없어 "정직한 임시 장치"로만 쓰고,
 * 결제를 붙일 때 반드시 서버 검증(1회용 코드 발급·사용 기록·서버측 만료)으로 교체해야 한다.
 */
export const BETA_INVITE_CODES = ["KMONG2026", "SOOMGO2026", "BETA2026"] as const;

/** 앞뒤 공백을 없애고 대문자로 맞춘다. 저장·비교는 항상 이 형태를 쓴다. */
export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase();
}

/** 공백·대소문자를 무시하고 시드 코드 목록과 대조한다. */
export function isValidInviteCode(value: string): boolean {
  const normalized = normalizeInviteCode(value);
  if (!normalized) return false;
  return (BETA_INVITE_CODES as readonly string[]).includes(normalized);
}

/**
 * 이미 써버린 코드 목록의 표준 형태.
 * 코드는 3개뿐이고 공유되기 때문에, 기간이 끝난 코드를 다시 넣어 30일을 무한히 늘리는 길을 막으려면
 * "지금 살아 있는 승급"과 별개로 "한 번이라도 쓴 코드"를 따로 기억해야 한다.
 * 저장소에서 온 값은 어떤 모양이든 올 수 있으니 항상 이 함수를 거쳐 문자열 배열로 만든다.
 */
export function normalizeRedeemedCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const code = normalizeInviteCode(item);
    if (code) seen.add(code);
  }
  return [...seen];
}

/** 이 코드를 전에 쓴 적이 있는지 본다. 기간이 끝났는지와 무관하게 "썼다"는 사실만 본다. */
export function hasRedeemedCode(previousCodes: unknown, code: string): boolean {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return false;
  return normalizeRedeemedCodes(previousCodes).includes(normalized);
}

/** 쓴 코드 목록에 코드를 더한다. 중복은 남기지 않고, 원래 목록은 건드리지 않는다. */
export function addRedeemedCode(previousCodes: unknown, code: string): string[] {
  const normalized = normalizeInviteCode(code);
  const codes = normalizeRedeemedCodes(previousCodes);
  if (!normalized || codes.includes(normalized)) return codes;
  return [...codes, normalized];
}
