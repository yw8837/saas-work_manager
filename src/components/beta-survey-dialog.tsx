"use client";

import { X } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import type { BetaSurveyPromptChoice } from "@/lib/beta-survey-prompt";
import { BETA_GRANT_DAYS, PLAN_LIMITS } from "@/lib/domain";

/** 설문 문항 수 안내. 구글 설문(docs/BETA-SURVEY.md)의 문항 수가 바뀌면 같이 고친다. */
export const BETA_SURVEY_SIZE_TEXT = "질문은 7개이고, 꼭 답해야 하는 것은 고르기 3개뿐이에요.";
export const BETA_SURVEY_DIALOG_TITLE = `Pro ${BETA_GRANT_DAYS}일 이용권이 끝났어요. 써 보니 어떠셨나요?`;
const FOCUSABLE = "a[href], button:not([disabled])";

/**
 * 베타 Pro 이용권이 끝난 뒤 작업 화면에 한 번 띄우는 설문 팝업.
 * 닫기(X)·Esc·바깥 누르기는 '나중에 할게요'와 같다. 띄울지와 기록은 app-shell이 정한다.
 */
export function BetaSurveyDialog({ formUrl, onChoose }: { formUrl: string; onChoose: (choice: BetaSurveyPromptChoice) => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // 열릴 때 초점을 팝업으로 옮기고, 닫히면 원래 있던 자리로 돌려준다.
  // 팝업은 화면이 준비된 뒤에만 그려지므로(서버 렌더 없음) 그려진 즉시 초점·키 처리를 붙인다.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const active = document.activeElement;
    if (!returnFocusRef.current && active instanceof HTMLElement && !panel?.contains(active)) returnFocusRef.current = active;
    panel?.focus({ preventScroll: true });
    return () => {
      const previous = returnFocusRef.current;
      if (previous && previous !== document.body && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  // Esc는 '나중에 할게요', 탭 이동은 팝업 안에서만 돈다.
  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onChoose("later");
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (!panel.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onChoose]);

  return (
    <div
      className="betaSurveyOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onChoose("later");
      }}
    >
      <div
        ref={panelRef}
        className="betaSurveyDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="beta-survey-dialog-title"
        aria-describedby="beta-survey-dialog-body"
        tabIndex={-1}
        data-testid="beta-survey-dialog"
      >
        <button type="button" className="iconButton betaSurveyClose" aria-label="닫기" onClick={() => onChoose("later")}>
          <X size={18} />
        </button>
        <h2 id="beta-survey-dialog-title">{BETA_SURVEY_DIALOG_TITLE}</h2>
        <div id="beta-survey-dialog-body" className="betaSurveyBody">
          <p>설문 답변은 일감체크의 기능과 요금을 정하는 데 써요.</p>
          <p data-testid="beta-survey-size">{BETA_SURVEY_SIZE_TEXT}</p>
          <p>지금은 무료 플랜(동시 {PLAN_LIMITS.free.activeJobs}건·누적 {PLAN_LIMITS.free.totalJobs}건)으로 계속 쓸 수 있어요.</p>
          <p className="betaSurveyPrivacy">설문에는 고객 이름이나 연락처 같은 개인정보는 적지 말아주세요.</p>
        </div>
        <div className="betaSurveyActions">
          <a
            className="primaryButton"
            href={formUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onChoose("open")}
            data-testid="beta-survey-open"
          >
            설문 작성하기
          </a>
          <button type="button" className="secondaryButton" onClick={() => onChoose("later")} data-testid="beta-survey-later">
            나중에 할게요
          </button>
          <button type="button" className="quietButton betaSurveyNever" onClick={() => onChoose("never")} data-testid="beta-survey-never">
            다시 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
