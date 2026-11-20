"use client";

import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import { BETA_SENDER } from "@/lib/beta/apply-copy";
import { getHostedRuntimeBoundary } from "@/lib/supabase";

/** 로컬 모드에는 서버가 없다. 신청·확인·수신거부 화면은 이때 미리보기로만 동작한다. */
export function isBetaPreviewMode(): boolean {
  return getHostedRuntimeBoundary().requestedMode !== "hosted";
}

export function BetaPreviewNote({ children }: { children: ReactNode }) {
  return <p className="betaPreviewNote" role="note">{children}</p>;
}

export function BetaOperatorFooter() {
  return (
    <footer className="betaOperatorFooter">
      <span>운영: {BETA_SENDER.name}</span>
      <span aria-hidden="true"> · </span>
      <span>문의·삭제 요청 <a href={`mailto:${BETA_SENDER.email}`}>{BETA_SENDER.email}</a></span>
    </footer>
  );
}

/** 신청·확인·수신거부 화면이 함께 쓰는 틀. 작업공간(WorkspaceProvider) 없이 그린다. */
export function BetaPublicShell({ children, preview, wide = false }: { children: ReactNode; preview?: ReactNode; wide?: boolean }) {
  return (
    <main className="publicRevisionPage betaPublicPage">
      <section className={wide ? "publicRevisionCard betaPublicCard betaPublicCardWide" : "publicRevisionCard betaPublicCard"}>
        <header className="publicRevisionHeader"><Brand /></header>
        {preview}
        {children}
        <BetaOperatorFooter />
      </section>
    </main>
  );
}
