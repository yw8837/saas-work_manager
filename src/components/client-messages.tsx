"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";

import { availableSituations, situationMessage, SITUATION_LABELS, type MessageSituation } from "@/lib/client-messages";
import type { Job } from "@/lib/domain";
import { markFirstRun } from "@/lib/first-run";

/**
 * 일감 화면의 '고객에게 보낼 말'. 지금 일감 상태에 맞는 상황 칩만 보이고, 가장 알맞은 칩이 처음부터 골라져 있다.
 * 칩을 누르면 문구가 말풍선으로 바뀌고 '문구 복사' 한 번이면 끝. 복사가 막히면 같은 자리를 글상자로 바꿔 글을 선택해 둔다.
 * `link`는 링크가 켜져 있고 저장이 끝났을 때만 받는다(저장 직후 안내와 같은 계산).
 * '시작 안내'를 복사하면 `onStartShared`로 알린다(일감에 처음 보낸 시각을 남기는 데 쓴다).
 */
export function ClientMessages({
  job,
  link,
  today,
  onStartShared,
}: {
  job: Job;
  link: string | null;
  today: string;
  onStartShared?: () => void;
}) {
  const [chosen, setChosen] = useState<MessageSituation | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const situations = availableSituations(job, today);
  if (situations.length === 0) return null;
  // 고른 상황이 일감 상태가 바뀌어 사라지면 맨 앞 상황으로 돌아간다.
  const situation = chosen && situations.includes(chosen) ? chosen : situations[0];
  const message = situationMessage(situation, { job, link });

  const choose = (next: MessageSituation) => {
    setChosen(next);
    setCopyState("idle");
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(message);
      // 링크가 든 문구를 보냈으면 첫 실행 '고객에게 보내기'를 끝낸 것으로 본다(저장 직후 안내와 같다).
      if (link && message.includes(link)) markFirstRun("linkShared");
      if (situation === "start") onStartShared?.();
      setCopyState("copied");
      window.setTimeout(() => setCopyState((value) => (value === "copied" ? "idle" : value)), 2200);
    } catch {
      // 글상자는 실패한 뒤에야 그려지므로 바로 그린 다음 글을 선택해 둔다. 길게 눌러 바로 복사할 수 있다.
      flushSync(() => setCopyState("failed"));
      textRef.current?.focus();
      textRef.current?.select();
    }
  };

  return (
    <section className="contentSection clientMessagesSection" aria-labelledby="client-messages-title" data-testid="client-messages">
      {/* 복사 버튼은 구획 머리 오른쪽(같은 화면의 다른 구획과 같은 자리). 머리가 보이면 복사도 보인다. */}
      <div className="sectionHeadingRow">
        <div>
          <h2 id="client-messages-title">고객에게 보낼 말</h2>
        </div>
        <button type="button" className="compactButton emphasized clientMessageCopy" onClick={copy} data-testid="client-message-copy">
          {copyState === "copied" ? <Check size={15} /> : <Copy size={15} />} {copyState === "copied" ? "복사했어요" : "문구 복사"}
        </button>
      </div>
      <div className="clientMessageChips" role="group" aria-label="보낼 상황">
        {situations.map((item) => (
          <button
            key={item}
            type="button"
            className="clientMessageChip"
            aria-pressed={item === situation}
            onClick={() => choose(item)}
            data-testid={`client-message-chip-${item}`}
          >
            {item === situation && <Check size={14} aria-hidden="true" />}
            {SITUATION_LABELS[item]}
          </button>
        ))}
      </div>
      {copyState === "failed" ? (
        <>
          <p id="client-message-copy-failed" className="clientMessageWarning" role="alert">
            이 브라우저가 자동 복사를 막았어요. 아래 문구 칸을 길게 누르거나 Ctrl+C로 복사해 주세요.
          </p>
          <textarea
            ref={textRef}
            className="clientMessageBubble clientMessageText"
            readOnly
            rows={8}
            value={message}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="보낼 문구"
            aria-describedby="client-message-copy-failed"
            data-testid="client-message-text"
          />
        </>
      ) : (
        <div className="clientMessageBubble" role="region" aria-label="보낼 문구" tabIndex={0} data-testid="client-message-preview">
          {message}
        </div>
      )}
    </section>
  );
}
