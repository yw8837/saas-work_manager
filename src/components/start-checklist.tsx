"use client";

import { CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";

import { startReminderMessage } from "@/lib/client-share";
import type { BriefQuestion } from "@/lib/domain";

/**
 * 일감 상세의 '착수 전 질문'과 '남은 것 다시 보내기'.
 * 답은 고객이 평소 대화창으로 보낸다. 작업자는 옮겨 적지 않고 받았다고 체크만 하고, 메모는 필요할 때만 남긴다.
 */
export function StartChecklist({
  jobId,
  clientLabel,
  questions,
  pendingIntake,
  pendingQuestions,
  active,
  onToggle,
  onNote,
}: {
  jobId: string;
  clientLabel: string;
  questions: BriefQuestion[];
  pendingIntake: string[];
  pendingQuestions: string[];
  active: boolean;
  onToggle: (jobId: string, questionId: string) => void;
  onNote: (jobId: string, questionId: string, note: string) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const answered = questions.filter((item) => item.answeredAt).length;
  const reminder = startReminderMessage({ clientLabel, pendingIntake, pendingQuestions });

  const copyReminder = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(reminder);
      setCopyState("copied");
    } catch {
      // 복사가 막힌 브라우저는 문구를 그대로 보여 주고 길게 눌러 복사하게 한다.
      setCopyState("failed");
    }
  };

  if (questions.length === 0 && !reminder) return null;

  return (
    <section className="contentSection intakeSection" aria-labelledby="brief-title" data-testid="brief-section">
      {questions.length > 0 && (
        <>
          <div className="sectionHeadingRow">
            <div>
              <h2 id="brief-title">착수 전 질문</h2>
              <p className="sectionHint">{answered}/{questions.length} 답 받음 · 고객은 평소 대화창으로 답해요</p>
            </div>
          </div>
          <ul className="intakeList">
            {questions.map((item) => (
              <li key={item.id} className="briefItem">
                <button
                  type="button"
                  className="intakeToggle"
                  data-received={Boolean(item.answeredAt)}
                  aria-pressed={Boolean(item.answeredAt)}
                  onClick={() => onToggle(jobId, item.id)}
                  disabled={!active}
                  data-testid={`brief-toggle-${item.id}`}
                >
                  {item.answeredAt ? <CheckCircle2 size={16} /> : <span className="intakeCircle" aria-hidden="true" />}
                  <span>{item.question}</span>
                  {item.answeredAt && <small>답 받음</small>}
                </button>
                <BriefNoteInput
                  key={`${item.id}:${item.note ?? ""}`}
                  initial={item.note ?? ""}
                  disabled={!active}
                  label={`${item.question} 답 메모`}
                  testId={`brief-note-${item.id}`}
                  onCommit={(note) => onNote(jobId, item.id, note)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {active && reminder && (
        <div className="startReminder">
          <p>아직 못 받은 자료·답은 카톡 문구로 다시 보낼 수 있어요.</p>
          <button type="button" className="compactButton" onClick={copyReminder} data-testid="start-reminder-copy">
            <Copy size={14} /> {copyState === "copied" ? "복사했어요" : "남은 것 다시 보내기 문구 복사"}
          </button>
          {copyState === "failed" && (
            <textarea className="startReminderText" readOnly rows={6} value={reminder} aria-label="다시 보낼 문구" data-testid="start-reminder-text" />
          )}
        </div>
      )}
    </section>
  );
}

/** 입력 중에는 저장하지 않고, 칸을 벗어날 때 바뀐 경우에만 저장한다. */
function BriefNoteInput({
  initial,
  disabled,
  label,
  testId,
  onCommit,
}: {
  initial: string;
  disabled: boolean;
  label: string;
  testId: string;
  onCommit: (note: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className="briefNote"
      value={value}
      maxLength={300}
      placeholder="답 메모(선택)"
      aria-label={label}
      disabled={disabled}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value.trim() !== initial.trim()) onCommit(value);
      }}
      data-testid={testId}
    />
  );
}
