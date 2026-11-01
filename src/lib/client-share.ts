/**
 * 고객에게 보낼 수정요청 링크와 카톡에 붙일 안내 문구.
 * 고객 화면과 같은 원칙으로 금액·작업자 연락처는 문구에 넣지 않는다.
 */
export function revisionPortalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(token)}`;
}

export function clientShareMessage(input: { clientLabel: string; title: string; included: number; remaining?: number; link: string }): string {
  const name = input.clientLabel.trim();
  const greeting = name ? `안녕하세요, ${name}님.` : "안녕하세요.";
  const title = input.title.trim();
  const remaining = input.remaining ?? input.included;
  // 고객이 대화창을 떠나 링크를 열 이유(남은 횟수·마감 확인)와 지금 규칙을 먼저 알린다.
  // 수정 횟수는 접수가 아니라 작업자가 수정을 마칠 때 쓴다(engine.ts completeRevision). 다 쓴 뒤의 요청은 추가 작업으로 따로 협의한다.
  const revisionLine = input.included <= 0
    ? "요청 내용은 접수 시각과 함께 기록돼요."
    : remaining > 0
      ? `포함된 수정 ${input.included}회 중 남은 횟수와 마감을 링크에서 바로 볼 수 있어요. 요청은 링크에 한 번에 남겨 주시면, 제가 수정을 마칠 때마다 1회씩 세요.`
      : `포함된 수정 ${input.included}회를 모두 써서, 새 요청은 추가 작업으로 따로 말씀드릴게요.`;
  return [
    greeting,
    `${title ? `${title} ` : ""}작업의 수정 요청은 아래 링크에 한 번에 남겨주세요. 로그인 없이 열려요.`,
    revisionLine,
    "질문은 이 대화로 편하게 주시고, 답도 여기로 드릴게요.",
    input.link,
  ].join("\n");
}
