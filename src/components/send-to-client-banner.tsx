"use client";

import { Check, Copy, Eye, MessageCircle, Send, X } from "lucide-react";
import { useRef, useState } from "react";

import { clientShareMessage } from "@/lib/client-share";
import { markFirstRun } from "@/lib/first-run";

type CopyTarget = "link" | "message";

/**
 * 일감을 저장한 직후(?created=1) 상세 맨 위에 뜨는 "이제 고객에게 보내세요" 띠.
 * 링크 복사 · 카톡에 붙일 문구 복사 · 고객 화면 미리보기. 복사가 막히면 주소 칸을 선택해 직접 복사하게 한다.
 */
export function SendToClientBanner({
  link,
  clientLabel,
  title,
  included,
  ready,
  pendingMessage,
  localOnly,
  onDismiss,
}: {
  link: string;
  clientLabel: string;
  title: string;
  included: number;
  /** 링크가 켜져 있고 서버 저장까지 끝났을 때만 보낼 수 있다. */
  ready: boolean;
  /** ready가 아닐 때 보여 줄 이유. */
  pendingMessage: string;
  /** 이 브라우저 저장 모드: 링크가 이 브라우저에서만 열린다. */
  localOnly: boolean;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const message = clientShareMessage({ clientLabel, title, included, link });

  const copy = async (target: CopyTarget) => {
    if (!ready) return;
    setCopied(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(target === "link" ? link : message);
      setCopyFailed(false);
      setCopied(target);
      markFirstRun("linkShared");
      window.setTimeout(() => setCopied((value) => (value === target ? null : value)), 2200);
    } catch {
      setCopyFailed(true);
      // 복사 권한이 막힌 브라우저: 주소를 선택해 두면 길게 눌러 바로 복사할 수 있다.
      window.requestAnimationFrame(() => {
        linkInputRef.current?.focus();
        linkInputRef.current?.select();
      });
    }
  };

  return (
    <section className="sendToClientBanner" aria-labelledby="send-to-client-title" data-testid="send-to-client-banner">
      <div className="sendToClientHead">
        <span className="sendToClientIcon" aria-hidden="true"><Send size={18} /></span>
        <div>
          <h2 id="send-to-client-title">일감을 저장했어요. 이제 고객에게 보내세요</h2>
          <p>고객은 이 링크에서 로그인 없이 수정 요청을 남기고, 남은 횟수를 바로 봐요.</p>
        </div>
        <button type="button" className="iconButton sendToClientClose" onClick={onDismiss} aria-label="고객에게 보내기 안내 닫기">
          <X size={18} />
        </button>
      </div>

      <label className="sendToClientLink">
        <span>고객 수정 요청 링크</span>
        <input
          ref={linkInputRef}
          readOnly
          value={link}
          onFocus={(event) => event.currentTarget.select()}
          aria-describedby={copyFailed ? "send-to-client-copy-failed" : undefined}
          data-testid="send-to-client-link"
        />
      </label>

      <div className="sendToClientActions">
        <button type="button" className="primaryButton" onClick={() => copy("link")} disabled={!ready} data-testid="send-copy-link">
          {copied === "link" ? <Check size={17} /> : <Copy size={17} />} {copied === "link" ? "링크를 복사했어요" : "링크 복사"}
        </button>
        <button type="button" className="secondaryButton" onClick={() => copy("message")} disabled={!ready} data-testid="send-copy-message">
          {copied === "message" ? <Check size={17} /> : <MessageCircle size={17} />} {copied === "message" ? "문구를 복사했어요" : "카톡에 붙일 문구 복사"}
        </button>
        {ready ? (
          <a className="secondaryButton" href={link} target="_blank" rel="noopener noreferrer" data-testid="send-preview">
            <Eye size={17} /> 고객 화면 미리보기
          </a>
        ) : (
          <span className="secondaryButton" aria-disabled="true"><Eye size={17} /> 고객 화면 미리보기</span>
        )}
      </div>

      <div className="sendToClientNotes" aria-live="polite">
        {copyFailed && (
          <p id="send-to-client-copy-failed" className="sendToClientWarning" role="alert">
            이 브라우저가 자동 복사를 막았어요. 위 주소 칸을 길게 누르거나 Ctrl+C로 복사해 주세요.
          </p>
        )}
        {!ready && <p>{pendingMessage}</p>}
        {localOnly && <p data-local-only>지금은 이 브라우저에 저장하는 모드라 링크도 이 브라우저에서만 열려요. 고객에게 보내려면 로그인 모드가 필요해요.</p>}
        <details className="sendToClientPreviewText">
          <summary>카톡 문구 미리 보기</summary>
          <pre>{message}</pre>
        </details>
      </div>
    </section>
  );
}
