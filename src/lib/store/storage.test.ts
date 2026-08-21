import { describe, expect, it } from "vitest";
import { createSeedState, LEGACY_STORAGE_KEY, loadState, mutateStoredState, resetState, saveState, STORAGE_KEY, storageKeyForUser } from ".";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("localStorage repository", () => {
  it("저장한 상태를 새로고침 후 그대로 복원한다", () => {
    const storage = new MemoryStorage();
    const state = createSeedState("2026-08-14");
    state.jobs[0].title = "새로고침에도 남아있어야 하는 일감";
    saveState(state, storage);

    const reloaded = loadState(storage, "2026-01-01");
    expect(reloaded).toEqual(state);
    expect(reloaded.jobs[0].title).toBe("새로고침에도 남아있어야 하는 일감");
  });

  it("깨진 JSON은 안전하게 seed로 복구한다", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{not-json");
    const state = loadState(storage, "2026-08-14");
    expect(state.packages.length).toBeGreaterThan(0);
    expect(state.jobs.length).toBeGreaterThan(0);
  });

  it("오래 열린 탭 대신 저장소의 최신 상태 위에서 변경한다", () => {
    const storage = new MemoryStorage();
    const stale = createSeedState("2026-08-14");
    saveState(stale, storage);

    const latest = loadState(storage);
    latest.jobs[0].tasks[0].status = "done";
    saveState(latest, storage);

    const committed = mutateStoredState((current) => ({
      ...current,
      jobs: current.jobs.map((job, index) =>
        index === 0 ? { ...job, title: "다른 탭의 수정요청 반영" } : job,
      ),
    }), storage);

    expect(committed.saved).toBe(true);
    expect(committed.state.jobs[0].tasks[0].status).toBe("done");
    expect(loadState(storage).jobs[0].tasks[0].status).toBe("done");
  });

  it("초기화하면 저장본을 지우고 빈 작업대를 돌려준다", () => {
    const storage = new MemoryStorage();
    saveState(createSeedState("2026-08-14"), storage);
    const reset = resetState(storage, "2026-08-20");
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    // 남의 예시 고객이 아니라 빈 일감 목록에서 다시 시작한다.
    expect(reset.jobs).toEqual([]);
    // 패키지·옵션 예시는 남아 바로 새 일감을 만들 수 있다.
    expect(reset.packages.length).toBeGreaterThan(0);
  });

  it("첫 방문 상태의 누적 카운터는 0에서 시작한다", () => {
    const storage = new MemoryStorage();
    expect(loadState(storage, "2026-08-20").jobsCreatedTotal).toBe(0);
  });

  it("첫 방문에는 예시 일감 없이 빈 작업대로 시작한다", () => {
    const storage = new MemoryStorage();
    const first = loadState(storage, "2026-08-20");
    expect(first.jobs).toEqual([]);
    expect(first.packages.length).toBeGreaterThan(0);
  });

  it("v1 저장본을 v2로 한 번만 이관한다", () => {
    const storage = new MemoryStorage();
    const legacy = { ...createSeedState("2026-08-14"), version: 1 };
    legacy.jobs[0].title = "지워지면 안 되는 기존 일감";
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));

    const migrated = loadState(storage, "2026-01-01");

    expect(migrated.version).toBe(2);
    expect(migrated.jobs[0].title).toBe("지워지면 안 되는 기존 일감");
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("hosted 캐시는 사용자별 키로 격리한다", () => {
    const storage = new MemoryStorage();
    const userA = createSeedState("2026-08-14");
    const userB = createSeedState("2026-08-14");
    userA.jobs[0].title = "A 전용";
    userB.jobs[0].title = "B 전용";

    saveState(userA, storage, storageKeyForUser("user-a"));
    saveState(userB, storage, storageKeyForUser("user-b"));

    expect(loadState(storage, undefined, storageKeyForUser("user-a")).jobs[0].title).toBe("A 전용");
    expect(loadState(storage, undefined, storageKeyForUser("user-b")).jobs[0].title).toBe("B 전용");
  });
});

describe("저장 공간이 막혔을 때", () => {
  /** 용량이 꽉 찼거나 사파리 프라이빗처럼 쓰기가 막힌 저장소. */
  class BlockedStorage extends MemoryStorage {
    setItem(): void {
      throw new DOMException("quota", "QuotaExceededError");
    }
  }

  it("저장에 실패해도 예외를 던지지 않고 실패를 알린다", () => {
    const storage = new BlockedStorage();
    // 클릭 한 번마다 예외가 밖으로 튀면 앱 전체가 멈춘다.
    expect(() => saveState(createSeedState("2026-08-14"), storage)).not.toThrow();
    expect(saveState(createSeedState("2026-08-14"), storage)).toBe(false);
  });

  it("저장이 실패해도 바뀐 상태는 돌려주되 실패를 숨기지 않는다", () => {
    const storage = new BlockedStorage();
    const result = mutateStoredState((current) => ({ ...current, jobs: [] }), storage);
    // 화면은 멈추지 않아야 하고,
    expect(result.state.jobs).toEqual([]);
    // 저장 실패는 호출부가 사용자에게 알릴 수 있도록 반드시 드러나야 한다.
    expect(result.saved).toBe(false);
  });

  it("저장소 접근 자체가 막혀도 읽기·쓰기가 터지지 않는다", () => {
    const exploding = {
      get length(): number { throw new DOMException("blocked", "SecurityError"); },
      clear() { throw new DOMException("blocked", "SecurityError"); },
      getItem() { throw new DOMException("blocked", "SecurityError"); },
      key() { throw new DOMException("blocked", "SecurityError"); },
      removeItem() { throw new DOMException("blocked", "SecurityError"); },
      setItem() { throw new DOMException("blocked", "SecurityError"); },
    } as unknown as Storage;

    expect(() => loadState(exploding, "2026-08-20")).not.toThrow();
    expect(() => saveState(createSeedState("2026-08-14"), exploding)).not.toThrow();
  });
});

describe("누적 일감 카운터 저장 규칙", () => {
  it("누적 카운터가 없던 저장본은 현재 일감 수로 채운다", () => {
    const storage = new MemoryStorage();
    const legacy = createSeedState("2026-08-14") as Partial<ReturnType<typeof createSeedState>>;
    delete legacy.jobsCreatedTotal;
    delete legacy.trialStartedAt;
    delete legacy.betaAccess;
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    const loaded = loadState(storage, "2026-01-01");
    // 기존 사용자를 부당하게 벌주지도, 공짜로 풀어주지도 않는다.
    expect(loaded.jobsCreatedTotal).toBe(legacy.jobs!.length);
    expect(loaded.trialStartedAt).toBeNull();
    expect(loaded.betaAccess).toBeNull();
    expect(loaded.version).toBe(2);
  });

  it("일감을 지워도 저장된 누적 카운터는 그대로 읽힌다", () => {
    const storage = new MemoryStorage();
    saveState({ ...createSeedState("2026-08-14"), jobs: [], jobsCreatedTotal: 9 }, storage);
    expect(loadState(storage).jobsCreatedTotal).toBe(9);
  });

  it("저장본이 손상돼 카운터가 현재 일감 수보다 작아도 뒤로 가지 않는다", () => {
    const storage = new MemoryStorage();
    const state = createSeedState("2026-08-14");
    saveState({ ...state, jobsCreatedTotal: 0 }, storage);
    expect(loadState(storage).jobsCreatedTotal).toBe(state.jobs.length);
  });

  it("v1 저장본을 이관할 때도 누적 카운터를 채운다", () => {
    const storage = new MemoryStorage();
    const legacy = { ...createSeedState("2026-08-14"), version: 1 } as Record<string, unknown>;
    delete legacy.jobsCreatedTotal;
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));

    const migrated = loadState(storage, "2026-01-01");
    expect(migrated.jobsCreatedTotal).toBe(2);
  });

  it("전체 초기화는 누적 카운터·체험·베타를 그대로 넘긴다", () => {
    const storage = new MemoryStorage();
    const beta = { code: "BETA2026", grantedAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-08-31T00:00:00.000Z" };
    saveState(
      {
        ...createSeedState("2026-08-14"),
        jobsCreatedTotal: 8,
        trialStartedAt: "2026-08-10T00:00:00.000Z",
        betaAccess: beta,
      },
      storage,
    );

    const reset = resetState(storage, "2026-08-20");
    expect(reset.jobs).toEqual([]);
    // 초기화가 무료 한도를 푸는 우회로가 되면 안 된다.
    expect(reset.jobsCreatedTotal).toBe(8);
    expect(reset.trialStartedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(reset.betaAccess).toEqual(beta);
  });
});
