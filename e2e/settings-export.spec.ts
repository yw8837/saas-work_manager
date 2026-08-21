import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("downloads workspace data without public revision bearer tokens", async ({ page }) => {
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
