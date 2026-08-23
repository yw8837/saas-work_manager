import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Capacitor copies the already-built web bundle into these native shells.
  // Lint the source and build output separately, not third-party/generated copies.
  globalIgnores([".agents/**", ".next/**", ".next-stale-*/**", ".open-next/**", ".wrangler/**", "dist/**", "android/**", "ios/**", "coverage/**", "playwright-report/**", "test-results/**"]),
]);
