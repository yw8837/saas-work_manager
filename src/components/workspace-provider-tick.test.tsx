import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStarterState, saveState, type AppState } from "@/lib/store";

vi.mock("@/lib/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");
  return { ...actual, registerIlgamcheckServiceWorker: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ...actual,
    getHostedRuntimeBoundary: () => ({ requestedMode: "local", configured: false }),
    getSupabaseBrowserClient: () => null,
  };
});

import { WorkspaceProvider, useWorkspace } from "./workspace-provider";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

let renders = 0;
let workspace: ReturnType<typeof useWorkspace> | null = null;
function Probe() {
  const value = useWorkspace();
  // 렌더 중에 세면 부작용이라 결과가 흔들린다. 커밋된 렌더만 센다.
  useEffect(() => {
    workspace = value;
    renders += 1;
  });
  return <span data-testid="hydrated">{String(value.hydrated)}</span>;
}

async function mountAt(when: Date, seed: Partial<AppState> = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(when);
  saveState({ ...createStarterState("2026-08-20"), ...seed }, window.localStorage);
  render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
  await waitFor(() => {
    expect(screen.getByTestId("hydrated")).toHaveTextContent("true");
    expect(workspace?.hydrated).toBe(true);
  });
}

beforeEach(() => {
  renders = 0;
  workspace = null;
  Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
});

describe("기준 시각 틱", () => {
  it("조용한 시간에는 다시 그리지 않는다", async () => {
    try {
      // 03:10 로컬. 자정도 브리핑 시각(09:00)도 넘지 않는 구간.
      await mountAt(new Date(2026, 7, 21, 3, 10, 0));
      const baseline = renders;
      await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60_000); });
      expect(renders - baseline).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("로컬 자정을 넘기면 다시 그린다", async () => {
    try {
      // 23:58 로컬에서 시작해 자정을 넘긴다. UTC 기준으로 재면 KST에서는 이때 날짜가 안 바뀐다.
      await mountAt(new Date(2026, 7, 21, 23, 58, 0));
      const baseline = renders;
      await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
      expect(renders).toBeGreaterThan(baseline);
    } finally {
      vi.useRealTimers();
    }
  });

  it("브리핑 시각을 넘기면 다시 그린다", async () => {
    try {
      // 브리핑 07:00 설정, 06:58에 열어둔다.
      const base = createStarterState("2026-08-20");
      await mountAt(new Date(2026, 7, 21, 6, 58, 0), {
        settings: { ...base.settings, morningDigestEnabled: true, morningDigestTime: "07:00" },
      });
      const baseline = renders;
      await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
      expect(renders).toBeGreaterThan(baseline);
    } finally {
      vi.useRealTimers();
    }
  });
});
