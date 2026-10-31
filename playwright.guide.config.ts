import { defineConfig, devices } from "@playwright/test";

/**
 * 사용설명서(/guide) 그림을 다시 찍는 전용 설정. 출시 E2E(e2e/run-release.mjs)와 분리한다.
 * 로컬 모드 `next start`만 쓰고, 예시 데이터는 src/lib/demo/sample-order.ts에서 가져온다.
 * 실행: npm run build && npx playwright test -c playwright.guide.config.ts
 */
export default defineConfig({
  testDir: "./e2e/capture",
  testMatch: /.*\.capture\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4110", trace: "off" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4110",
    url: "http://127.0.0.1:4110",
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [
    {
      name: "guide-mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 375, height: 760 }, deviceScaleFactor: 2 },
    },
  ],
});
