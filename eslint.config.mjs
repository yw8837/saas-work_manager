import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Capacitor copies the already-built web bundle into these native shells.
  // Lint the source and build output separately, not third-party/generated copies.
  // vendor/: npm override로 끼운 의존성 호환 래퍼(CommonJS 필수). 원본 패키지처럼 lint하지 않는다.
  globalIgnores([".agents/**", ".next/**", ".next-stale-*/**", ".open-next/**", ".wrangler/**", "dist/**", "android/**", "ios/**", "coverage/**", "playwright-report/**", "test-results/**", "vendor/**"]),
]);
