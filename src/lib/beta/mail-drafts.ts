import { BETA_SENDER, type BetaParticipation } from "./apply-copy";
import { koreanDate, normalizeBetaEmail, type BetaNoticeKind } from "./rules";

/**
 * 운영자가 Gmail로 직접 보낼 메일 초안. 앱은 메일을 보내지 않는다.
 * 원문: 양식/베타참여안내형.md(v2), 양식/처리결과통지.md(v1), 양식/신청폼-항목.md(v3) 분기표.
 * - 운영 연락(결과·일정·참여 안내)에는 광고를 넣지 않는다.
 * - [미정] 칸(베타 종료 뒤 안내, 전화 등)은 정해지기 전에 보내지 않으므로 초안에서 뺀다.
 * - 운영자가 채워야 하는 값(인터뷰 일정 링크·베타 초대 링크)이 없으면 초안을 복사하지 못하게 한다.
 */
export type MailDraftPurpose = "result" | "interview" | "beta" | "notice" | "deletion";

export type MailDraft = {
  id: string;
  purpose: MailDraftPurpose;
  label: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  /** 운영자가 아직 채우지 않은 값. 비어 있지 않으면 복사·발송하지 않는다. */
  missing: string[];
};

export type DraftApplication = {
  id: string;
  email: string;
  participation: BetaParticipation;
  eligible: boolean;
  adChecked: boolean;
  createdAt: string;
  emailConfirmedAt: string | null;
  confirmExpiresAt: string;
  outcome: "not_matched" | "not_selected" | "interview" | "beta" | null;
  confirmToken: string | null;
  unsubscribeToken: string | null;
};

export type DraftOptions = {
  origin: string;
  /** 인터뷰 일정용 구글 폼 링크(운영자가 입력). */
  interviewScheduleUrl?: string;
  /** 베타 접속(초대) 링크(운영자가 입력). */
  betaAccessUrl?: string;
  now?: Date;
};

const SENDER_LINE = `보내는 사람: ${BETA_SENDER.name} · ${BETA_SENDER.email}`;
const MISSING_INTERVIEW = "인터뷰 일정 링크(구글 폼)";
const MISSING_BETA = "베타 접속(초대) 링크";

function httpsUrlOrNull(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function confirmLink(origin: string, token: string): string {
  return `${origin}/apply/confirm/${token}`;
}

export function unsubscribeLink(origin: string, token: string): string {
  return `${origin}/u/${token}`;
}

function adLines(application: DraftApplication, options: DraftOptions, includeConfirm: boolean): string[] {
  if (!application.adChecked || !application.unsubscribeToken) return [];
  const lines: string[] = [""];
  const now = options.now ?? new Date();
  const confirmUsable = includeConfirm
    && !application.emailConfirmedAt
    && application.confirmToken
    && new Date(application.confirmExpiresAt).getTime() > now.getTime();
  if (confirmUsable) {
    lines.push(
      "[광고성 정보 수신 동의 확인]",
      "신청하실 때 광고성 정보(이메일) 수신에도 동의하셨습니다. 이 동의는 아래 링크를 열고 '확인' 버튼을 누르셔야 유효해집니다. 누르지 않으시면 광고성 메일을 보내지 않습니다.",
      confirmLink(options.origin, application.confirmToken!),
      "",
    );
  }
  const unsubscribe = unsubscribeLink(options.origin, application.unsubscribeToken);
  lines.push(
    "광고성 정보 수신을 원하지 않으시면 로그인 없이 바로 거부하실 수 있습니다:",
    unsubscribe,
    "If you do not wish to receive promotional e-mail, unsubscribe here (no login required):",
    unsubscribe,
  );
  return lines;
}

function notMeLines(application: DraftApplication): string[] {
  return [
    "",
    "본인이 신청하지 않으셨다면 이 메일에 회신해 주세요. 신청 정보를 지우고 처리 결과를 알려 드립니다."
      + (application.adChecked ? " 광고성 정보 수신 동의도 위 수신거부 링크로 바로 철회하실 수 있습니다." : ""),
  ];
}

function retentionLine(period: string): string {
  return `- 신청 정보: 신청하실 때 적어 주신 정보는 ${period} 동안 보관한 뒤 지웁니다. 지금 지우길 원하시면 회신해 주세요. `
    + "신청 정보만 지워지고, 일감체크 계정에 직접 등록하신 일감 데이터는 따로 요청하셔야 지워집니다. 처리가 끝나면 결과를 알려 드립니다.";
}

function draft(
  application: DraftApplication,
  purpose: MailDraftPurpose,
  label: string,
  subject: string,
  body: string[],
  missing: string[],
): MailDraft {
  return {
    id: `${application.id}:${purpose}`,
    purpose,
    label,
    from: BETA_SENDER.email,
    to: normalizeBetaEmail(application.email),
    subject,
    body: [...body, "", SENDER_LINE].join("\n"),
    missing,
  };
}

function resultDraft(application: DraftApplication, options: DraftOptions, notSelected: boolean): MailDraft {
  const applied = koreanDate(application.createdAt);
  const result = notSelected
    ? "이번 모집에서는 함께하지 못하게 되었습니다"
    : "이번 모집 조건(패키지 외주 동시 2건 이상)과 맞지 않음";
  return draft(application, "result", notSelected ? "결과 안내(미선정)" : "결과 안내(기준 미충족)", "일감체크 신청 결과 안내", [
    `안녕하세요. ${applied}에 일감체크 참여를 신청해 주셔서 결과를 알려 드립니다.`,
    "",
    `- 결과: ${result}`,
    retentionLine("결과 안내 후 1개월"),
    // 미충족·미선정자에게는 확인 링크를 넣지 않는다(광고를 보내지 않으므로 동의를 유효로 만들 이유가 없다).
    ...adLines(application, options, false),
    ...notMeLines(application),
  ], []);
}

function interviewDraft(application: DraftApplication, options: DraftOptions): MailDraft {
  const url = httpsUrlOrNull(options.interviewScheduleUrl);
  const keep = application.participation === "both" ? "인터뷰 후 6개월(베타에 참여하시면 베타 종료 후 6개월)" : "인터뷰 후 6개월";
  return draft(application, "interview", "인터뷰 일정 안내", "일감체크 인터뷰 신청 결과와 일정 안내", [
    `안녕하세요. ${koreanDate(application.createdAt)}에 일감체크 인터뷰 참여를 신청해 주셔서 결과를 알려 드립니다.`,
    "",
    "- 결과: 참여 가능",
    `- 일정 고르기: 아래 링크에서 편하신 시간을 골라 주세요. ${url ?? `[입력 필요: ${MISSING_INTERVIEW}]`}`,
    retentionLine(keep),
    ...adLines(application, options, true),
    ...notMeLines(application),
  ], url ? [] : [MISSING_INTERVIEW]);
}

function betaDraft(application: DraftApplication, options: DraftOptions): MailDraft {
  const url = httpsUrlOrNull(options.betaAccessUrl);
  return draft(application, "beta", "베타 참여 안내", "일감체크 베타 신청 결과 안내", [
    `안녕하세요. ${koreanDate(application.createdAt)}에 일감체크 베타 참여를 신청해 주셔서 결과를 알려 드립니다.`,
    "",
    "- 결과: 참여 가능",
    `- 시작 방법: ${url ?? `[입력 필요: ${MISSING_BETA}]`} · 사용설명서: ${options.origin}/guide`,
    "- 이용 조건: 베타 기간에는 무료입니다. 베타는 정식 결제 시작 전까지 이어집니다.",
    retentionLine("베타 종료 후 6개월"),
    ...adLines(application, options, true),
    ...notMeLines(application),
  ], url ? [] : [MISSING_BETA]);
}

/**
 * 신청 1건의 운영 연락 초안. 분기표(참여 희망 3 × 광고 2) × 적격/미충족.
 * - 미충족·미선정: '결과만' 1통. 접속·일정 안내 없음.
 * - 인터뷰: 일정 안내 / 베타: 참여 안내 / 둘 다: 두 통 모두(일정 안내를 빠뜨리지 않는다).
 * 처리결과 통지는 여기서 만들지 않고 의사표시마다 buildNoticeDraft로 따로 만든다(경로와 상관없이 보낸다).
 */
export function buildApplicationDrafts(application: DraftApplication, options: DraftOptions): MailDraft[] {
  if (!application.eligible || application.outcome === "not_matched") return [resultDraft(application, options, false)];
  if (application.outcome === "not_selected") return [resultDraft(application, options, true)];
  if (application.outcome === "interview") return [interviewDraft(application, options)];
  const drafts: MailDraft[] = [];
  if (application.participation === "interview" || application.participation === "both") drafts.push(interviewDraft(application, options));
  if (application.participation === "beta" || application.participation === "both") drafts.push(betaDraft(application, options));
  return drafts;
}

export type DraftNotice = {
  eventId: string;
  kind: BetaNoticeKind;
  occurredAt: string;
  confirmedAt: string | null;
};

/** 처리결과 통지 v1. 광고는 섞지 않는다. 전화는 미정이라 넣지 않는다. */
export function buildNoticeDraft(
  notice: DraftNotice,
  recipient: { email: string; unsubscribeToken: string | null },
  options: DraftOptions,
): MailDraft {
  const label = notice.kind === "consent" ? "동의" : notice.kind === "refuse" ? "거부" : "철회";
  const result = notice.kind === "consent"
    ? "동의가 등록되었습니다."
      + (notice.confirmedAt ? "" : " 메일 주소 확인 버튼을 누르시기 전까지는 광고성 메일을 보내지 않습니다.")
    : `${label}가 처리되어 앞으로 광고성 이메일을 보내지 않습니다.`;
  const change = notice.kind === "consent"
    ? recipient.unsubscribeToken
      ? `수신거부 링크(${unsubscribeLink(options.origin, recipient.unsubscribeToken)}) 또는 이 메일에 회신`
      : "이 메일에 회신"
    : `신청 페이지(${options.origin}/apply)에서 광고 수신에 다시 체크하시거나 이 메일에 회신`;
  return {
    id: `${notice.eventId}:notice`,
    purpose: "notice",
    label: `처리결과 통지(${label})`,
    from: BETA_SENDER.email,
    to: normalizeBetaEmail(recipient.email),
    subject: `[${BETA_SENDER.name}] 광고성 정보 수신 ${label} 처리 결과 안내`,
    body: [
      `${BETA_SENDER.name}에서 알려 드립니다.`,
      "",
      `- 의사표시: 광고성 정보(이메일) 수신 ${label}`,
      `- 일자: ${koreanDate(notice.occurredAt)}`,
      `- 처리 결과: ${result}`,
      `- 변경을 원하시면 ${change}으로 언제든 바꾸실 수 있습니다.`,
      "",
      `${BETA_SENDER.name} · ${BETA_SENDER.email}`,
    ].join("\n"),
    missing: [],
  };
}

/** 삭제 요청 처리 결과. 실제로 지운 뒤에만 만든다. 지우지 않은 것과 그 이유를 함께 적는다. */
export function buildDeletionDraft(email: string, deletedAt: string): MailDraft {
  return {
    id: `${normalizeBetaEmail(email)}:deletion`,
    purpose: "deletion",
    label: "삭제 처리 결과",
    from: BETA_SENDER.email,
    to: normalizeBetaEmail(email),
    subject: "일감체크 신청 정보 삭제 처리 결과 안내",
    body: [
      `요청하신 신청 정보 삭제를 ${koreanDate(deletedAt)}에 마쳤습니다.`,
      "",
      "- 지운 것: 신청 정보(이메일, 하는 일, 패키지 판매 여부, 동시 진행 건수, 주문 받는 곳, 참여 희망)",
      "- 남긴 것: 다시 광고를 보내지 않도록 주소를 알아볼 수 없게 바꾼 값(해시)만 발송금지 목록에 남깁니다. 광고 수신 동의·철회 기록(일시·문구 판본)은 증빙을 위해 남깁니다.",
      "- 일감체크 계정과 일감 데이터는 이 요청으로 지우지 않습니다. 지우시려면 계정 삭제를 따로 요청해 주세요.",
      "",
      SENDER_LINE,
    ].join("\n"),
    missing: [],
  };
}

const LEFTOVER_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\[입력 필요/, "채우지 않은 칸"],
  [/\[(?:확정값|미정)/, "정하지 않은 값"],
  [/\{\{|\}\}|\$\{/, "치환 안 된 변수"],
  [/\b(?:undefined|null|NaN)\b|Invalid Date/, "빈 값"],
];

/**
 * 보내기 전 점검: 치환 안 된 변수, 채우지 않은 칸, 받는 사람이 신청 레코드와 다른 경우,
 * 본문에 보내는 사람 말고 다른 주소가 들어간 경우(다른 신청자 정보가 섞인 경우)를 잡는다.
 */
export function findDraftProblems(mail: MailDraft, recordEmail: string): string[] {
  const problems = [...mail.missing.map((item) => `입력 필요: ${item}`)];
  const text = `${mail.subject}\n${mail.body}`;
  for (const [pattern, label] of LEFTOVER_PATTERNS) {
    if (pattern.test(text)) problems.push(label);
  }
  if (normalizeBetaEmail(mail.to) !== normalizeBetaEmail(recordEmail)) problems.push("받는 사람이 신청 레코드의 주소와 다름");
  if (mail.from !== BETA_SENDER.email) problems.push("보내는 사람 주소가 다름");
  const addresses = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  if (addresses.some((address) => address.toLowerCase() !== BETA_SENDER.email)) problems.push("본문에 다른 주소가 들어 있음");
  return problems;
}
