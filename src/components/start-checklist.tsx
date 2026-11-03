"use client";

import { CheckCircle2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { BriefQuestion } from "@/lib/domain";

/**
 * 일감 상세의 '착수 전 질문'.
 * 답은 고객이 평소 대화창으로 보낸다. 작업자는 옮겨 적지 않고 받았다고 체크만 하고, 메모는 필요할 때만 남긴다.
 * 남은 자료·질문을 다시 보내는 문구는 구획 머리의 `action`('남은 것만 문구 복사', 일감 화면이 넘김)이나 '고객에게 보낼 말'의 '남은 것 요청'에서 복사한다.
 */
export function StartChecklist({
  jobId,
  questions,
  active,
  onToggle,
  onNote,
  action,
}: {
  jobId: string;
  questions: BriefQuestion[];
  active: boolean;
  onToggle: (jobId: string, questionId: string) => void;
  onNote: (jobId: string, questionId: string, note: string) => void;
  /** 구획 머리 오른쪽에 둘 행동(남은 것만 문구 복사). */
  action?: ReactNode;
}) {
  const answered = questions.filter((item) => item.answeredAt).length;

  if (questions.length === 0) return null;

  return (
    <section className="contentSection intakeSection" aria-labelledby="brief-title" data-testid="brief-section">
      <div className="sectionHeadingRow">
        <div>
          <h2 id="brief-title">착수 전 질문</h2>
          <p className="sectionHint">{answered}/{questions.length} 답 받음 · 고객은 평소 대화창으로 답해요</p>
        </div>
        {action}
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
              key={item.id}
              initial={item.note ?? ""}
              disabled={!active}
              label={`${item.question} 답 메모`}
              testId={`brief-note-${item.id}`}
              onCommit={(note) => onNote(jobId, item.id, note)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 입력 중에는 저장하지 않고, 칸을 벗어날 때 바뀐 경우에만 저장한다.
 * 다른 기기가 같은 질문의 메모를 저장해도, 이 칸에서 쓰는 중이면 쓰던 글을 덮어쓰지 않는다(칸을 새로 만들지 않음).
 */
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
  const [syncedInitial, setSyncedInitial] = useState(initial);
  const [dirty, setDirty] = useState(false);
  // 저장된 메모가 바뀌었고 이 칸에서 고치는 중이 아니면 새 값을 보여 준다.
  if (initial !== syncedInitial) {
    setSyncedInitial(initial);
    if (!dirty) setValue(initial);
  }
  return (
    <input
      className="briefNote"
      value={value}
      maxLength={300}
      placeholder="답 메모(선택)"
      aria-label={label}
      disabled={disabled}
      onChange={(event) => {
        setValue(event.target.value);
        setDirty(true);
      }}
      onBlur={() => {
        setDirty(false);
        if (value.trim() !== initial.trim()) onCommit(value);
      }}
      data-testid={testId}
    />
  );
}
