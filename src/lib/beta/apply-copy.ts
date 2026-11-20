/**
 * 베타 신청 페이지의 선택지와 동의 문구.
 * 원문: 스테이션/과제/1-콜드메일/양식/신청폼-항목.md(v3). 문구를 바꾸면 판본(BETA_APPLY_COPY_VERSION)을 올리고
 * DB 함수 submit_beta_application이 받는 판본 목록에도 새 값을 더해야 한다(새 migration).
 */
export const BETA_APPLY_COPY_VERSION = "beta-apply-v1-2026-11-01";

/** 전송자 명칭·연락 이메일(확정값 원문 2·3). 전화·주소는 아직 정하지 않아 넣지 않는다. */
export const BETA_SENDER = { name: "스튜디오열매", email: "37@studioyeol.com" } as const;

export type BetaWorkType = "web" | "design" | "other";
export type BetaConcurrentJobs = "0" | "1" | "2-3" | "4+";
export type BetaOrderChannel = "kmong" | "referral" | "own_site" | "other";
export type BetaParticipation = "interview" | "beta" | "both";

export const WORK_TYPE_OPTIONS: ReadonlyArray<{ value: BetaWorkType; label: string }> = [
  { value: "web", label: "웹" },
  { value: "design", label: "디자인" },
  { value: "other", label: "기타" },
];

export const CONCURRENT_JOB_OPTIONS: ReadonlyArray<{ value: BetaConcurrentJobs; label: string }> = [
  { value: "0", label: "0건" },
  { value: "1", label: "1건" },
  { value: "2-3", label: "2~3건" },
  { value: "4+", label: "4건 이상" },
];

export const ORDER_CHANNEL_OPTIONS: ReadonlyArray<{ value: BetaOrderChannel; label: string }> = [
  { value: "kmong", label: "크몽" },
  { value: "referral", label: "소개" },
  { value: "own_site", label: "자기 홈페이지" },
  { value: "other", label: "기타" },
];

export const PARTICIPATION_OPTIONS: ReadonlyArray<{ value: BetaParticipation; label: string }> = [
  { value: "interview", label: "인터뷰" },
  { value: "beta", label: "베타" },
  { value: "both", label: "둘 다" },
];

export const PRIVACY_CONSENT_COPY = {
  title: "[필수] 개인정보 수집·이용 동의",
  purpose: "참여 대상 확인, 신청 처리, 선택한 인터뷰·베타의 운영 연락",
  requiredItems: "이메일, 하는 일, 패키지 판매 여부, 동시 진행 건수, 참여 희망",
  optionalItems: "주문 받는 곳: 적어 주시면 같은 목적에만 씁니다. 적지 않아도 불이익이 없습니다.",
  retention: [
    { target: "기준 미충족·미선정", period: "결과 안내 후 1개월" },
    { target: "인터뷰만 한 사람", period: "인터뷰 후 6개월" },
    { target: "베타 참가자", period: "베타 종료 후 6개월" },
  ],
  refusal: "동의를 거부할 권리가 있습니다. 다만 거부하시면 신청할 수 없습니다.",
} as const;

export const AD_CONSENT_COPY = {
  title: "[선택] 광고성 정보 수신 동의(이메일)",
  content: "일감체크 베타·정식 출시·할인 소식을 이메일로 받습니다.",
  purpose: "홍보 이메일 발송",
  items: "이메일",
  retention: "철회할 때까지. 2년마다 동의 사실과 철회 방법을 안내합니다.",
  noDisadvantage: "동의하지 않아도 인터뷰·베타 신청에는 아무 불이익이 없습니다.",
  withdraw: "언제든 철회할 수 있습니다.",
} as const;

export function optionLabel<T extends string>(options: ReadonlyArray<{ value: T; label: string }>, value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
