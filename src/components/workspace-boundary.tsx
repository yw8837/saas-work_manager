"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { WorkspaceProvider } from "@/components/workspace-provider";
import { isStandaloneRoutePath } from "@/lib/standalone-routes";

/** 설명서·체험 링크에서는 작업공간 저장소를 열지 않는다. 나머지 경로는 기존과 같다. */
export function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname && isStandaloneRoutePath(pathname)) return children;
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
