import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { seedWorkspace } from "./seed-state";

test("downloads workspace data without public revision bearer tokens", async ({ page }) => {
  // 내보낼 일감이 있어야 토큰 제거를 검증할 수 있다. 앱은 빈 상태로 시작한다.
  await seedWorkspace(page, "ilgamcheck-export-e2e-seeded");
  await page.goto("/settings");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-workspace").click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();

  const payload = JSON.parse(await readFile(path!, "utf8")) as {
    schemaVersion: number;
    product: string;
    workspace: { jobs: Array<Record<string, unknown>> };
  };
  expect(payload.schemaVersion).toBe(1);
  expect(payload.product).toBe("ilgamcheck");
  expect(payload.workspace.jobs.length).toBeGreaterThan(0);
  expect(payload.workspace.jobs.every((job) => !("revisionPortalToken" in job))).toBe(true);
});
