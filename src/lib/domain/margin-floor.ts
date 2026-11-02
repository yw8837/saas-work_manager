/**
 * 한 건에 최소 남길 돈(작업자가 정하는 자기 기준). 기준을 정했을 때만, 덜 남는 패키지·주문을 한 줄로 알린다.
 * 저장을 막지 않고, 시세·권장 단가는 말하지 않는다. 고객에게 가는 문구·링크에는 쓰지 않는다.
 */

/** 정할 수 있는 가장 큰 기준(10억 원). */
export const MARGIN_FLOOR_MAX = 1_000_000_000;

/** 기준이 0보다 크고 남는 돈이 기준보다 적을 때만 모자란 금액을 준다. 아니면 null(알리지 않음). */
export function marginShortfall(margin: number, floor: number | undefined): number | null {
  if (typeof floor !== "number" || !Number.isFinite(floor) || floor <= 0) return null;
  if (!Number.isFinite(margin) || margin >= floor) return null;
  return floor - margin;
}

/** 입력 글을 기준 금액으로 바꾼다. 숫자·쉼표만 받고, 빈칸이거나 0~10억 밖이면 undefined. */
export function parseFloorInput(value: string): number | undefined {
  const text = value.trim();
  if (!/^[\d,]+$/.test(text)) return undefined;
  const digits = text.replace(/,/g, "");
  if (!digits) return undefined;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount <= MARGIN_FLOOR_MAX ? amount : undefined;
}

function won(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

/** 경고 한 줄 글. 남는 돈이 0보다 적으면 "10,000원 손해"로 쓴다. */
export function marginWarningText(margin: number, shortfall: number): string {
  const head = margin < 0 ? `${won(-margin)} 손해` : `남는 돈 ${won(margin)}`;
  return `${head} · 내 기준보다 ${won(shortfall)} 적어요`;
}
