import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const requiredPaths = [
  "capacitor.config.ts",
  "dist/client/index.html",
  "android/app",
  "ios/App",
];

for (const requiredPath of requiredPaths) {
  const absolutePath = resolve(root, requiredPath);
  if (!existsSync(absolutePath)) throw new Error(`missing ${requiredPath}`);
}

const config = readFileSync(resolve(root, "capacitor.config.ts"), "utf8");
for (const expected of [
  'appId: "com.yeolmaestudio.ilgamcheck"',
  'appName: "일감체크"',
  'webDir: "dist/client"',
]) {
  if (!config.includes(expected)) throw new Error(`capacitor config is missing ${expected}`);
}

const bundle = statSync(resolve(root, "dist/client/index.html"));
if (bundle.size === 0) throw new Error("mobile web bundle is empty");

console.log("[mobile-verify] PASS Android/iOS shell and production web bundle are ready.");
