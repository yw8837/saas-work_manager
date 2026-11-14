import { BETA_GRANT_DAYS, PLAN_LIMITS } from "@/lib/domain/entitlements";
import { BETA_INVITE_CODES } from "@/lib/domain/invite-codes";
import { INVITE_PARAM } from "@/lib/invite-link";
import type { Industry } from "@/lib/store/industry-starters";

/**
 * starter-link.ts의 STARTER_PARAM과 같은 값(시험으로 맞춘다).
 * 그 파일을 불러오면 업종 예시 데이터까지 둘러보기·메인 번들에 딸려 와서 이름만 여기 둔다.
 */
const STARTER_PARAM = "starter";

/**
 * 공개 화면(메인·둘러보기·설명서·예시)의 시작 버튼이 가는 주소와 그 옆 안내 문구를 한곳에 둔다.
 *
 * - 시작 버튼은 늘 베타 코드를 붙여 `/today?invite=BETA2026`으로 간다. 로그인·약관 동의 뒤 코드가 자동으로 들어간다(invite-link.ts).
 * - 예시 버튼은 업종도 붙인다(`/today?starter=design&invite=BETA2026`). 두 값은 가입 화면이 각자 꺼내 이 탭에 보관한다(starter-link.ts).
 * - 머리글 '로그인'은 기존 사용자용이라 이 주소를 쓰지 않는다(`/today` 그대로).
 * - 숫자는 요금제 상수(entitlements.ts)에서만 가져온다. 시간 숫자·전체 인원 한도는 쓰지 않는다.
 */
export const START_INVITE_CODE = BETA_INVITE_CODES[0];

export function signupStartHref(starter?: Industry): string {
  const params = new URLSearchParams();
  if (starter) params.set(STARTER_PARAM, starter);
  params.set(INVITE_PARAM, START_INVITE_CODE);
  return `/today?${params.toString()}`;
}

export const SIGNUP_START_HREF = signupStartHref();

// 조사는 지금 코드(BETA2026, '육'으로 끝남)에 맞춘 것이다. 코드를 바꾸면 '을/를'·'이/가'도 같이 본다.
const BETA_PRO_BENEFIT = `Pro를 ${BETA_GRANT_DAYS}일 동안 무료로 써요(계정당 한 번).`;

/** 네 공개 화면에 같은 문장으로 들어가는 안내 두 줄. */
export const BETA_OFFER_TEXT = `베타 코드 ${START_INVITE_CODE}을 넣으면 ${BETA_PRO_BENEFIT}`;
export const FREE_PLAN_TEXT = `코드가 없어도 무료로 동시 ${PLAN_LIMITS.free.activeJobs}건·누적 ${PLAN_LIMITS.free.totalJobs}건까지 써요. 카드 등록은 없어요(유료 결제는 아직 없어요).`;

/** 가입 화면: 베타 코드를 붙여 들어왔을 때. */
export const INVITE_READY_TEXT = `베타 코드 ${START_INVITE_CODE}이 자동으로 들어가요. ${BETA_PRO_BENEFIT}`;
/** 가입 화면: 다른 코드가 붙어 왔을 때. 코드 값은 화면에 보이지 않는다(검증은 약관 동의 뒤 서버가 한다). */
export const INVITE_OTHER_TEXT = "로그인하고 약관에 동의하면 링크의 베타 코드가 자동으로 들어가요.";
/** 가입 화면: 버튼 아래, 가입하면 어떻게 되는지. */
export const SIGNUP_NEXT_TEXT = "Google로 로그인하고 약관에 동의하면 작업공간이 열려요.";
