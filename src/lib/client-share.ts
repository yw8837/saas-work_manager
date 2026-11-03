/**
 * 고객에게 보낼 수정요청 링크와 카톡에 붙일 안내 문구.
 * 고객 화면과 같은 원칙으로 금액·작업자 연락처는 문구에 넣지 않는다.
 */
export function revisionPortalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(token)}`;
}

export function greetingFor(clientLabel: string): string {
  const name = clientLabel.trim();
  return name ? `안녕하세요, ${name}님.` : "안녕하세요.";
}

/**
 * 아직 받지 못한 자료와 아직 답을 받지 못한 착수 전 질문을 카톡에 붙일 줄로 만든다.
 * 고객이 링크를 열지 않아도 평소 대화창에서 바로 답할 수 있게, 링크가 아니라 문구 안에 넣는다.
 */
export function startChecklistLines(input: { pendingIntake?: string[]; pendingQuestions?: string[] }): string[] {
  const intake = input.pendingIntake ?? [];
  const questions = input.pendingQuestions ?? [];
  if (intake.length === 0 && questions.length === 0) return [];
  const lines = ["작업을 시작하기 전에 아래 내용만 이 대화로 보내 주세요. 모르는 건 '모름'이라고 적어 주셔도 괜찮아요."];
  if (intake.length > 0) lines.push("[보내 주실 자료]", ...intake.map((label) => `- ${label}`));
  if (questions.length > 0) lines.push("[알려 주실 것]", ...questions.map((question, index) => `${index + 1}. ${question}`));
  return lines;
}

/** 일감 화면에서 다시 보낼 때 쓰는 문구. 남은 게 없으면 빈 문자열이다. */
export function startReminderMessage(input: { clientLabel: string; pendingIntake?: string[]; pendingQuestions?: string[] }): string {
  const lines = startChecklistLines(input);
  return lines.length > 0 ? [greetingFor(input.clientLabel), ...lines].join("\n") : "";
}

/** "2026-11-10" → "11월 10일". 형식이 다르면 빈 문자열이다. */
function monthDay(value: string | undefined): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match ? `${Number(match[1])}월 ${Number(match[2])}일` : "";
}

/**
 * 시작 안내 문구. 순서: 인사 → 보내 주실 자료·알려 주실 것 → 완성 예정일 → 수정 요청 설명과 바로 다음 줄 링크 → 횟수 규칙 한 줄.
 * `link`가 null이면(링크가 꺼졌거나 저장 중) 링크 줄을 빼고 요청도 이 대화로 받는다고 쓴다. `dueDate`가 없으면 완성 예정 줄을 뺀다.
 */
export function clientShareMessage(input: {
  clientLabel: string;
  title: string;
  included: number;
  remaining?: number;
  /** 일감 마감일(YYYY-MM-DD). 고객에게는 '완성 예정'으로 알린다. */
  dueDate?: string;
  link: string | null;
  pendingIntake?: string[];
  pendingQuestions?: string[];
}): string {
  const greeting = greetingFor(input.clientLabel);
  const title = input.title.trim();
  const remaining = input.remaining ?? input.included;
  const link = input.link;
  const due = monthDay(input.dueDate);
  // 수정 횟수는 접수가 아니라 작업자가 수정을 마칠 때 쓴다(engine.ts completeRevision). 다 쓴 뒤의 요청은 추가 작업으로 따로 협의한다.
  const revisionLine = input.included <= 0
    ? "요청 내용은 접수 시각과 함께 기록돼요."
    : remaining > 0
      ? `수정을 마칠 때마다 포함 수정 1회로 셉니다. 남은 포함 수정은 ${remaining}회예요.`
      : `포함된 수정 ${input.included}회를 모두 써서, 새 요청은 추가 작업으로 따로 말씀드릴게요.`;
  return [
    greeting,
    ...startChecklistLines(input),
    ...(due ? [`${title ? `${title} ` : ""}작업은 ${due} 완성 예정이에요.`] : []),
    // 링크는 설명 바로 다음 줄에 둔다("아래 링크"가 가리키는 곳이 바로 보이게).
    ...(link
      ? ["수정 요청은 아래 링크에 한 번에 남겨 주세요. 로그인 없이 열려요.", link]
      : ["수정 요청은 이 대화로 한 번에 모아 주세요."]),
    revisionLine,
  ].join("\n");
}
