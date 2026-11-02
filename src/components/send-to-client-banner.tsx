"use client";

import { Check, Copy, Eye, MessageCircle, Send, X } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";

import { clientShareMessage } from "@/lib/client-share";
import { markFirstRun } from "@/lib/first-run";

type CopyTarget = "link" | "message";

/**
 * 일감을 저장한 직후(?created=1) 상세 맨 위에 뜨는 "이제 고객에게 보내세요" 띠.
 * 카톡 문구 복사(주) · 링크만 복사 · 고객 화면 미리보기. 보낼 문구는 버튼 아래 말풍선으로 펼쳐 보여 준다.
 * 주 버튼이 문구라서 링크 설명 줄과 긴 주소 칸은 두지 않는다(링크는 문구·미리보기에 들어 있음).
 * 복사가 막히면 복사하려던 것(링크면 그때 주소 칸을 보여, 문구면 문구 글상자)을 선택해 직접 복사하게 한다.
 */
export function SendToClientBanner({
  link,
  clientLabel,
  title,
  included,
  remaining,
  pendingIntake,
  pendingQuestions,
  ready,
  pendingMessage,
  localOnly,
  onDismiss,
  onShared,
}: {
  link: string;
  clientLabel: string;
  title: string;
  included: number;
  /** 지금 남은 포함 수정. 다 쓴 주문에 "1회로 세요"라고 보내지 않으려고 받는다. */
  remaining?: number;
  /** 아직 받지 못한 '시작 전 받을 자료'. 고객이 링크를 안 열어도 대화창에서 보내게 문구에 넣는다. */
  pendingIntake?: string[];
  /** 아직 답을 받지 못한 '착수 전 질문'. */
  pendingQuestions?: string[];
  /** 링크가 켜져 있고 서버 저장까지 끝났을 때만 보낼 수 있다. */
  ready: boolean;
  /** ready가 아닐 때 보여 줄 이유. */
  pendingMessage: string;
  /** 이 브라우저 저장 모드: 링크가 이 브라우저에서만 열린다. */
  localOnly: boolean;
  onDismiss: () => void;
  /** 카톡 문구나 링크를 복사했을 때 알린다(일감에 시작 안내를 처음 보낸 시각을 남기는 데 쓴다). */
  onShared?: () => void;
}) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyFailed, setCopyFailed] = useState<CopyTarget | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const messageTextRef = useRef<HTMLTextAreaElement>(null);
  const message = clientShareMessage({ clientLabel, title, included, remaining, link, pendingIntake, pendingQuestions });

  const copy = async (target: CopyTarget) => {
    if (!ready) return;
    setCopied(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(target === "link" ? link : message);
    } catch {
      // 문구 글상자는 실패한 뒤에야 그려지므로, 선택하기 전에 바로 그려 둔다.
      flushSync(() => setCopyFailed(target));
      // 복사 권한이 막힌 브라우저: 복사하려던 글을 선택해 두면 길게 눌러 바로 복사할 수 있다.
      window.requestAnimationFrame(() => {
        const field = target === "link" ? linkInputRef.current : messageTextRef.current;
        field?.focus();
        field?.select();
      });
      return;
    }
    setCopyFailed(null);
    setCopied(target);
    window.setTimeout(() => setCopied((value) => (value === target ? null : value)), 2200);
    // 기록은 클립보드와 따로 남긴다. 기록이 실패해도 복사는 됐으니 복사 실패 안내·글상자를 띄우지 않는다.
    try {
      markFirstRun("linkShared");
      onShared?.();
    } catch {
      // 시작 안내 기록은 처음 한 번만 남는 값이라, 다음에 복사할 때 다시 남긴다.
    }
  };

  return (
    <section className="sendToClientBanner" aria-labelledby="send-to-client-title" data-testid="send-to-client-banner">
      <div className="sendToClientHead">
        <span className="sendToClientIcon" aria-hidden="true"><Send size={18} /></span>
        <div>
          <h2 id="send-to-client-title">일감을 저장했어요. 이제 고객에게 보내세요</h2>
        </div>
        <button type="button" className="iconButton sendToClientClose" onClick={onDismiss} aria-label="고객에게 보내기 안내 닫기">
          <X size={18} />
        </button>
      </div>

      {copyFailed === "link" && (
        <label className="sendToClientLink">
          <span>고객 수정 요청 링크</span>
          <input
            ref={linkInputRef}
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            aria-describedby="send-to-client-copy-failed"
            data-testid="send-to-client-link"
          />
        </label>
      )}

      <div className="sendToClientActions">
        <button type="button" className="primaryButton" onClick={() => copy("message")} disabled={!ready} data-testid="send-copy-message">
          {copied === "message" ? <Check size={17} /> : <MessageCircle size={17} />} {copied === "message" ? "문구를 복사했어요" : "카톡 문구 복사"}
        </button>
        <button type="button" className="secondaryButton" onClick={() => copy("link")} disabled={!ready} data-testid="send-copy-link">
          {copied === "link" ? <Check size={17} /> : <Copy size={17} />} {copied === "link" ? "링크를 복사했어요" : "링크만 복사"}
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
            {copyFailed === "link"
              ? "이 브라우저가 자동 복사를 막았어요. 위 주소 칸을 길게 누르거나 Ctrl+C로 복사해 주세요."
              : "이 브라우저가 자동 복사를 막았어요. 아래 문구 칸을 길게 누르거나 Ctrl+C로 복사해 주세요."}
          </p>
        )}
        {!ready && <p>{pendingMessage}</p>}
        {localOnly && <p data-local-only>지금은 이 브라우저에 저장하는 모드라 링크도 이 브라우저에서만 열려요. 고객에게 보내려면 로그인 모드가 필요해요.</p>}
      </div>

      {/* 무엇을 보내는지 보고 누르게 접지 않고 보여 준다. 길면 안에서 스크롤하니 키보드로도 닿게 한다.
          문구 복사가 막히면 같은 자리를 읽기 전용 글상자로 바꿔 글을 선택해 둔다. */}
      {copyFailed === "message" ? (
        <textarea
          ref={messageTextRef}
          className="sendToClientMessage sendToClientMessageText"
          readOnly
          rows={8}
          value={message}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="보낼 카톡 문구"
          aria-describedby="send-to-client-copy-failed"
          data-testid="send-message-text"
        />
      ) : (
        <div className="sendToClientMessage" role="region" aria-label="보낼 카톡 문구" tabIndex={0} data-testid="send-message-preview">
          {message}
        </div>
      )}
    </section>
  );
}
