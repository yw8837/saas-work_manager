import { describe, expect, it } from "vitest";

import { customerProgressOf, customerStageOf } from "@/lib/domain/customer-stage";
import { mutateStoredState, STORAGE_KEY, type AppState } from "@/lib/store";
import { createSampleOrder } from "@/lib/demo/sample-order";
import type { Job } from "@/lib/domain";

/** 저장을 항상 거부하는 저장소(용량 초과 흉내). 읽기는 처음 넣어 둔 값을 돌려준다. */
function fullStorage(initial: AppState): Storage {
  const data = new Map<string, string>([[STORAGE_KEY, JSON.stringify(initial)]]);
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => { data.delete(key); },
    setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
  } as Storage;
}

describe("2026-11-11 점검 반영", () => {
  it("고객 단계: 수정 완료로 처리한 요청만 남으면 '수정' 단계에 머물지 않는다", () => {
    const order: Job = createSampleOrder("2026-10-30");
    const usedOnly: Job = { ...order, revisions: order.revisions.map((revision) => ({ ...revision, usage: "used" as const })) };
    expect(customerProgressOf(usedOnly).hasOpenRevision).toBe(false);
    expect(customerStageOf(usedOnly)).not.toBe(3);
    const withPending: Job = { ...usedOnly, revisions: [...usedOnly.revisions, { ...usedOnly.revisions[0], id: "pending-1", usage: "pending" as const, revertedAt: undefined }] };
    expect(customerProgressOf(withPending).hasOpenRevision).toBe(true);
  });

  it("로컬 저장: 직전 저장이 실패했으면 화면 상태(base)에서 이어 고쳐 앞 편집을 잃지 않는다", () => {
    const start = { packages: [], options: [], jobs: [], settings: {} } as unknown as AppState;
    const storage = fullStorage(start);
    const first = mutateStoredState((current) => ({ ...current, settings: { ...current.settings, publicWorkerName: "A" } }), storage);
    expect(first.saved).toBe(false);
    // 저장소에서 다시 읽으면 A가 사라진다(예전 동작).
    const fromStorage = mutateStoredState((current) => ({ ...current, settings: { ...current.settings, morningDigestEnabled: true } }), storage);
    expect((fromStorage.state.settings as { publicWorkerName?: string }).publicWorkerName).toBeUndefined();
    // 화면 상태를 base로 주면 A가 남는다(새 동작).
    const fromScreen = mutateStoredState((current) => ({ ...current, settings: { ...current.settings, morningDigestEnabled: true } }), storage, undefined, first.state);
    expect((fromScreen.state.settings as { publicWorkerName?: string }).publicWorkerName).toBe("A");
  });
});
