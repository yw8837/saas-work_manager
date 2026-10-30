import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const playwrightCli = fileURLToPath(
  new URL("../node_modules/@playwright/test/cli.js", import.meta.url),
);

if (!existsSync(playwrightCli)) {
  console.error("[e2e-release] @playwright/test CLI를 찾지 못했습니다. npm ci를 먼저 실행하세요.");
  process.exit(1);
}

const batches = [
  {
    name: "core",
    files: ["e2e/mvp-happy-path.spec.ts", "e2e/portal-controls.spec.ts"],
  },
  {
    name: "surface",
    files: [
      "e2e/guide-demo.spec.ts",
      "e2e/invite-link.spec.ts",
      "e2e/renewal-first-send.spec.ts",
      "e2e/responsive-ui.spec.ts",
      "e2e/settings-export.spec.ts",
      "e2e/visual-capture.spec.ts",
    ],
  },
];

const assignedFiles = batches.flatMap((batch) => batch.files).sort();
const discoveredFiles = readdirSync(new URL(".", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.ts"))
  .map((entry) => `e2e/${entry.name}`)
  .sort();

if (
  new Set(assignedFiles).size !== assignedFiles.length
  || JSON.stringify(assignedFiles) !== JSON.stringify(discoveredFiles)
) {
  console.error("[e2e-release] spec 배치가 실제 e2e/*.spec.ts 목록과 일치하지 않습니다.");
  console.error(`[e2e-release] assigned=${assignedFiles.join(",")}`);
  console.error(`[e2e-release] discovered=${discoveredFiles.join(",")}`);
  process.exit(1);
}

for (const project of ["desktop", "mobile"]) {
  for (const batch of batches) {
    const label = `${project}/${batch.name}`;
    console.log(`[e2e-release] START ${label}`);
    const result = spawnSync(
      process.execPath,
      [
        playwrightCli,
        "test",
        ...batch.files,
        `--project=${project}`,
        "--workers=1",
        "--reporter=list",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
        shell: false,
      },
    );

    if (result.error) {
      console.error(`[e2e-release] FAIL ${label}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(`[e2e-release] FAIL ${label}: exit ${result.status ?? 1}`);
      process.exit(result.status ?? 1);
    }
    console.log(`[e2e-release] PASS ${label}`);
  }
}

console.log("[e2e-release] PASS all tests / 4 isolated browser batches");
