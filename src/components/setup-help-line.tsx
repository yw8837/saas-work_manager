import { Handshake } from "lucide-react";

import { SETUP_HELP_FALLBACK, SETUP_HELP_LINK_LABEL, SETUP_HELP_TEXT, setupHelpEmail, setupHelpMailto } from "@/lib/setup-help";

/**
 * "첫 일감을 같이 등록해 드려요" 신청 줄. 메일 앱이 안 열리는 PC도 있어 주소를 글로도 보여 준다.
 * 쓰는 곳: 오늘 화면 첫 실행 체크리스트(일감을 한 번도 만들지 않았을 때). 소개 화면은 같은 문장을 세 칸 중 하나로 보여 준다(marketing-home.tsx).
 */
export function SetupHelpLine({ testId = "setup-help" }: { testId?: string }) {
  const email = setupHelpEmail();
  return (
    <p className="setupHelpLine" data-testid={testId}>
      <Handshake size={18} aria-hidden="true" />
      <span>
        {SETUP_HELP_TEXT}{" "}
        <a href={setupHelpMailto(email)} className="inlineLink" data-testid={`${testId}-link`}>{SETUP_HELP_LINK_LABEL}</a>
        <span className="setupHelpAddress">{SETUP_HELP_FALLBACK} {email}</span>
      </span>
    </p>
  );
}
