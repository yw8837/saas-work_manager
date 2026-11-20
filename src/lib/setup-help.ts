import { BUSINESS_IDENTITY } from "@/lib/business-identity";
import { getPublicServiceConfig } from "@/lib/policies";

/**
 * 첫 일감을 운영자와 같이 등록해 달라고 신청하는 메일 주소.
 * 2026-11-19 벤치마킹(허니북): 첫 고객은 운영자가 한 명씩 직접 세팅을 도왔다. 신청 통로를 앱 안에 둔다.
 * 따로 받는 폼이 없어 기존 문의 메일을 그대로 쓴다(문의 메일이 없으면 사업자 메일).
 */
export const SETUP_HELP_SUBJECT = "일감체크 세팅 신청";

// 고객 이름·연락처·작업 파일은 받지 않는다. 가명과 흐름 설명만으로 같이 등록할 수 있다.
export const SETUP_HELP_BODY = [
  "아래 세 가지를 적어 보내 주세요. 고객 이름이나 연락처는 적지 않으셔도 돼요.",
  "",
  "1. 하시는 일(예: 로고 디자인, 영상 편집, 홈페이지 제작):",
  "2. 지금 진행 중이거나 곧 시작할 주문(있음 / 없음):",
  "3. 편한 시간과 방법(통화 / 화면 공유):",
  "",
  "쓰던 견적서나 패키지 표가 있으면 붙여 주세요. 고객 이름은 지우고 보내 주세요.",
].join("\r\n");

export function setupHelpEmail(): string {
  return getPublicServiceConfig().supportEmail ?? BUSINESS_IDENTITY.email;
}

export function setupHelpMailto(email: string = setupHelpEmail()): string {
  return `mailto:${email}?subject=${encodeURIComponent(SETUP_HELP_SUBJECT)}&body=${encodeURIComponent(SETUP_HELP_BODY)}`;
}
