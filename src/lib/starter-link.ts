import type { Job, PackageTemplate } from "@/lib/domain";
import { INDUSTRY_ORDER, usesOnlyStarterPackages, type Industry } from "@/lib/store/industry-starters";

/**
 * 업종별 예시 페이지(/examples)의 '이 예시로 시작하기' 링크(`/today?starter=design`)의 업종을 받아 둔다.
 * 초대 링크(invite-link.ts)와 같은 방식이다.
 *
 * - 읽자마자 주소창에서 지운다(history.replaceState). 새로고침·Google 로그인 왕복 주소에 남지 않게.
 * - Google 로그인으로 다른 사이트에 다녀오는 동안만 이 탭의 sessionStorage에 둔다.
 * - 오늘 화면이 작업공간을 다 불러온 뒤 한 번만 꺼내 쓰고 지운다(적용 여부와 상관없이).
 * - 로그아웃·계정 삭제 때도 지운다. 같은 탭에서 로그인하는 다른 계정에 넘어가지 않게.
 * - 값은 INDUSTRY_ORDER에 있는 키만 받는다. 그 밖의 값은 버린다.
 */
export const STARTER_PARAM = "starter";
export const PENDING_STARTER_KEY = "ilgamcheck:pending-starter";

export function parseStarterIndustry(value: string | null | undefined): Industry | null {
  const trimmed = value?.trim() ?? "";
  return (INDUSTRY_ORDER as string[]).includes(trimmed) ? (trimmed as Industry) : null;
}

/** 주소창의 starter를 sessionStorage로 옮기고 주소에서 지운다. 여러 번 불러도 같다. */
export function captureStarterFromLocation(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has(STARTER_PARAM)) return;
  const industry = parseStarterIndustry(params.get(STARTER_PARAM));
  params.delete(STARTER_PARAM);
  const query = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  if (!industry) {
    // 마지막 링크를 따른다. 잘못된 값이면 전에 받아 둔 업종도 쓰지 않는다.
    clearPendingStarter();
    return;
  }
  try {
    window.sessionStorage.setItem(PENDING_STARTER_KEY, industry);
  } catch {
    // 저장이 막힌 브라우저에서는 오늘 화면의 업종 칩으로 직접 고르면 된다.
  }
}

export function readPendingStarter(): Industry | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStarterIndustry(window.sessionStorage.getItem(PENDING_STARTER_KEY));
  } catch {
    return null;
  }
}

export function clearPendingStarter(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_STARTER_KEY);
  } catch {
    // 지울 수 없으면 탭을 닫을 때 브라우저가 지운다.
  }
}

/**
 * 링크로 받은 업종을 저절로 적용해도 되는지. 첫 실행 체크리스트의 업종 칩을 누를 수 있는 상태
 * (일감 0건·누적 0건)이면서, 보이는 패키지가 모두 손대지 않은 예시일 때만 된다.
 * 사용자가 만들었거나 고친 패키지가 하나라도 있으면 저절로 바꾸지 않는다.
 */
export function canAutoApplyStarter(input: { jobs: Job[]; jobsCreatedTotal: number; packages: PackageTemplate[] }): boolean {
  return input.jobs.length === 0 && input.jobsCreatedTotal === 0 && usesOnlyStarterPackages(input.packages);
}
