import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { WorkspaceAuthGate } from "@/components/workspace-auth-gate";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceAuthGate><AppShell>{children}</AppShell></WorkspaceAuthGate>;
}
