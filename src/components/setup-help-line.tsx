import { Handshake } from "lucide-react";

import { setupHelpEmail, setupHelpMailto } from "@/lib/setup-help";

/**
 * "첫 일감을 같이 등록해 드려요" 신청 줄. 메일 앱이 안 열리는 PC도 있어 주소를 글로도 보여 준다.
 * 쓰는 곳: 오늘 화면 첫 실행 체크리스트(일감이 아직 없을 때), 소개 화면 맨 아래.
 */
export function SetupHelpLine({ testId = "setup-help" }: { testId?: string }) {
  const email = setupHelpEmail();
  return (
    <p className="setupHelpLine" data-testid={testId}>
      <Handshake size={18} aria-hidden="true" />
      <span>
        처음이라 막히면 운영자가 첫 일감을 같이 등록해 드려요. 통화나 화면 공유로 하고 무료예요.{" "}
        <a href={setupHelpMailto(email)} className="inlineLink" data-testid={`${testId}-link`}>메일로 같이 등록 신청하기</a>
        <span className="setupHelpAddress">메일 앱이 안 열리면 이 주소로 보내 주세요: {email}</span>
      </span>
    </p>
  );
}
