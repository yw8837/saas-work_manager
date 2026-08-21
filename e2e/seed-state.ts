import type { Page } from "@playwright/test";

import { createSeedState, STORAGE_KEY } from "../src/lib/store";

/**
 * 앱은 새 사용자에게 가짜 일감을 보여주지 않으려고 일감 없는 상태로 시작한다.
 * 그래서 시드 일감(job_seed_mora 등)에 의존하는 E2E는 자기 데이터를 직접 깔아야 한다.
 * 시드 정의는 앱과 같은 함수를 써서 한 곳에서만 관리한다.
 */
export async function seedWorkspace(page: Page, marker: string): Promise<void> {
  const state = JSON.stringify(createSeedState("2026-08-16"));
  await page.addInitScript(
    ([key, payload, flag]) => {
      if (sessionStorage.getItem(flag)) return;
      localStorage.clear();
      localStorage.setItem(key, payload);
      sessionStorage.setItem(flag, "1");
    },
    [STORAGE_KEY, state, marker] as const,
  );
}
