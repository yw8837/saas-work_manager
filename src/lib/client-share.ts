/**
 * 고객에게 보낼 수정요청 링크와 카톡에 붙일 안내 문구.
 * 고객 화면과 같은 원칙으로 금액·작업자 연락처는 문구에 넣지 않는다.
 */
export function revisionPortalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(token)}`;
}

export function clientShareMessage(input: { clientLabel: string; title: string; included: number; link: string }): string {
  const name = input.clientLabel.trim();
  const greeting = name ? `안녕하세요, ${name}님.` : "안녕하세요.";
  const title = input.title.trim();
  const revisionLine = input.included > 0
    ? `포함된 수정 ${input.included}회 중 남은 횟수도 링크에서 바로 볼 수 있어요.`
    : "요청 내용은 접수 시각과 함께 기록돼요.";
  return [
    greeting,
    `${title ? `${title} ` : ""}작업의 수정 요청은 아래 링크에 한 번에 남겨주세요. 로그인 없이 열려요.`,
    revisionLine,
    input.link,
  ].join("\n");
}
