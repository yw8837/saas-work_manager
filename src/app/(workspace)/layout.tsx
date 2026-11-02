import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { BetaActivationGate } from "@/components/beta-activation-gate";
import { WorkspaceAuthGate } from "@/components/workspace-auth-gate";

// 작업 화면(오늘·일감·월별 정리·패키지·설정·의견)은 검색에 남지 않게 한다. 하위 page의 title만 있는 metadata는 이 robots를 물려받는다.
// robots.txt로 막지 않는다(막으면 크롤러가 이 noindex를 못 읽는다). 헤더는 next.config.ts와 Sites entry-server가 붙인다.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceAuthGate>
      <BetaActivationGate><AppShell>{children}</AppShell></BetaActivationGate>
    </WorkspaceAuthGate>
  );
}
