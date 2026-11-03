import { dueTileOf } from "@/lib/due-tile";
import type { Chip } from "@/lib/job-chips";

/** 목록 줄 왼쪽 44px 날짜 칸. 보이는 글자는 짧게, 읽어 주는 글은 기존 표기 그대로(srOnly). */
export function DueTile({ dueDate, today, done = false }: { dueDate: string; today: string; done?: boolean }) {
  const tile = dueTileOf(dueDate, today, done);
  return (
    <span className="dueTile" data-tone={tile.tone}>
      <b aria-hidden="true">{tile.label}</b>
      <small aria-hidden="true">{tile.date}</small>
      <span className="srOnly">{tile.spoken}</span>
    </span>
  );
}

/** 상태 칩(알약). 색만으로 전하지 않게 늘 글자를 같이 쓴다. */
export function StateChip({ chip }: { chip: Chip }) {
  return <span className="stateChip" data-tone={chip.tone}>{chip.label}</span>;
}
