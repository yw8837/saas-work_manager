import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { BetaActivationGate } from "@/components/beta-activation-gate";
import { WorkspaceAuthGate } from "@/components/workspace-auth-gate";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceAuthGate>
      <BetaActivationGate><AppShell>{children}</AppShell></BetaActivationGate>
    </WorkspaceAuthGate>
  );
}
