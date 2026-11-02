import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StartChecklist } from "./start-checklist";

function renderWithNote(note: string | undefined, onNote = vi.fn()) {
  const props = {
    jobId: "job_x",
    clientLabel: "고객",
    pendingIntake: [],
    pendingQuestions: ["참고 예시가 있나요?"],
    active: true,
    onToggle: vi.fn(),
    onNote,
  };
  const view = render(<StartChecklist {...props} questions={[{ id: "q1", question: "참고 예시가 있나요?", ...(note ? { note } : {}) }]} />);
  const rerenderWithNote = (next: string) =>
    view.rerender(<StartChecklist {...props} questions={[{ id: "q1", question: "참고 예시가 있나요?", note: next }]} />);
  return { onNote, rerenderWithNote };
}

// Codex PR #27 검토 P2: 다른 기기가 같은 질문의 메모를 저장해도, 이 칸에서 쓰던 글이 사라지면 안 된다.
describe("착수 전 질문 메모 칸", () => {
  it("쓰는 중에 다른 기기의 메모가 들어와도 쓰던 글과 칸을 그대로 두고, 칸을 벗어날 때 쓰던 글을 저장한다", () => {
    const { onNote, rerenderWithNote } = renderWithNote("처음 메모");
    const input = screen.getByTestId("brief-note-q1");
    input.focus();
    fireEvent.change(input, { target: { value: "쓰는 중인 메모" } });
    rerenderWithNote("다른 기기 메모");
    const after = screen.getByTestId("brief-note-q1");
    expect(after).toBe(input);
    expect(after).toHaveValue("쓰는 중인 메모");
    expect(after).toHaveFocus();
    fireEvent.blur(after);
    expect(onNote).toHaveBeenCalledWith("job_x", "q1", "쓰는 중인 메모");
  });

  it("쓰는 중이 아니면 다른 기기의 새 메모를 그대로 보여 주고 저장하지 않는다", () => {
    const { onNote, rerenderWithNote } = renderWithNote("처음 메모");
    rerenderWithNote("다른 기기 메모");
    expect(screen.getByTestId("brief-note-q1")).toHaveValue("다른 기기 메모");
    fireEvent.blur(screen.getByTestId("brief-note-q1"));
    expect(onNote).not.toHaveBeenCalled();
  });
});
