import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// vendor/minimatch-v3-compat: minimatch 3.x를 부르는 eslint 생태계에 패치된 11 엔진을 끼우는 래퍼.
// 배경·범위는 vendor/minimatch-v3-compat/index.js 머리말과 package.json overrides를 본다.

const root = process.cwd();
const rootRequire = createRequire(resolve(root, "package.json"));
const compatEntry = resolve(root, "vendor/minimatch-v3-compat/index.js");
const isWindows = process.platform === "win32";
const BS = "\\";

/** 실제 사용처 위치에서 minimatch를 불러온다(override가 그 자리에 걸렸는지까지 확인). */
function minimatchFrom(consumer) {
  const consumerRequire = createRequire(rootRequire.resolve(consumer));
  return { mm: consumerRequire("minimatch"), path: consumerRequire.resolve("minimatch") };
}

/** semver 정식 규칙: 핵심 버전이 같으면 프리릴리스(-rc.0 등)가 더 낮다. */
function isBelow(version, floor) {
  const [core, pre] = version.split(/-(.*)/s);
  const a = core.split(".").map(Number);
  const b = floor.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return Boolean(pre);
}

const v3Consumers = [
  "eslint",
  "@eslint/eslintrc",
  "@eslint/config-array",
  "eslint-plugin-import",
  "eslint-plugin-react",
  "eslint-plugin-jsx-a11y",
];

describe("minimatch 3.x 호환 래퍼", () => {
  it.each(v3Consumers)("%s 는 래퍼를 쓰고, 래퍼 엔진은 패치된 11.0.1 이상이다", (consumer) => {
    expect(minimatchFrom(consumer).path).toBe(compatEntry);
    const engine = createRequire(compatEntry)("minimatch-patched/package.json");
    expect(isBelow(engine.version, "11.0.1")).toBe(false);
  });

  it("10.x를 쓰는 typescript-estree는 래퍼가 아니라 패치된 11을 바로 쓴다", () => {
    const { mm, path } = minimatchFrom("@typescript-eslint/typescript-estree");
    expect(path).not.toBe(compatEntry);
    expect(typeof mm.minimatch).toBe("function");
    expect(mm.minimatch("src/a.ts", "**/*.ts", { dot: true })).toBe(true);
  });

  it("3.x처럼 함수로 부르고, Babel의 기본 내보내기 감싸기로도 부를 수 있다", () => {
    const { mm } = minimatchFrom("eslint-plugin-import");
    expect(typeof mm).toBe("function");
    // eslint-plugin-import·jsx-a11y가 쓰는 _interopRequireDefault와 같은 결과
    const interop = mm && mm.__esModule ? mm : { default: mm };
    expect(interop.default("src/a.ts", "**/*.ts")).toBe(true);
    expect(mm.minimatch("src/a.ts", "**/*.js")).toBe(false);
  });

  it("eslint가 쓰는 Minimatch 객체 사용법(match·partial·pattern·negate)이 그대로 동작한다", () => {
    const { mm } = minimatchFrom("eslint");
    const matcher = new mm.Minimatch("**/node_modules/", { dot: true });
    expect(matcher.pattern).toBe("**/node_modules/");
    expect(matcher.match("node_modules/")).toBe(true);
    expect(matcher.match("src/node_modules/")).toBe(true);
    expect(matcher.match("src/a.ts")).toBe(false);
    expect(matcher.match("src", true)).toBe(true);
    expect(new mm.Minimatch("!**/*.ts").negate).toBe(true);
  });

  it("3.x처럼 패턴 앞뒤 공백을 지운다", () => {
    const { mm } = minimatchFrom("eslint-plugin-react");
    expect(mm("src/a.ts", " src/** ")).toBe(true);
    expect(new mm.Minimatch("  **/*.ts ").pattern).toBe("**/*.ts");
  });

  it("3.x처럼 Windows에서는 패턴의 \\를 경로 구분자로, allowWindowsEscape면 이스케이프로 본다", () => {
    const { mm } = minimatchFrom("eslint-plugin-import");
    const winPattern = `src${BS}**${BS}*.ts`;
    // 3.1.5: Windows이고 allowWindowsEscape가 없을 때만 \를 /로 바꾼다. 다른 OS에서는 이스케이프다.
    expect(mm("src/app/a.ts", winPattern)).toBe(isWindows);
    expect(mm("src/app/a.ts", winPattern, { allowWindowsEscape: true })).toBe(false);
    expect(mm("a*b", `a${BS}*b`, { allowWindowsEscape: true })).toBe(true);
  });

  it("eslint-config-next·이 저장소 ignore 패턴의 일치 결과", () => {
    const { mm } = minimatchFrom("@eslint/config-array");
    const opts = { dot: true, allowWindowsEscape: true };
    const cases = [
      ["src/app/page.tsx", "**/*.{js,jsx,mjs,ts,tsx,mts,cts}", true],
      ["scripts/build.mjs", "**/*.{js,jsx,mjs,ts,tsx,mts,cts}", true],
      ["README.md", "**/*.{js,jsx,mjs,ts,tsx,mts,cts}", false],
      [".next/server/app.js", ".next/**", true],
      [".next-stale-1/a.js", ".next-stale-*/**", true],
      ["src/.hidden.ts", "**/*.ts", true],
      ["dist/client/index.js", "dist/**", true],
      ["src/dist/a.js", "dist/**", false],
      ["vendor/minimatch-v3-compat/index.js", "vendor/**", true],
      ["next-env.d.ts", "next-env.d.ts", true],
      ["src/next-env.d.ts", "next-env.d.ts", false],
    ];
    for (const [path, pattern, expected] of cases) {
      expect(mm(path, pattern, opts), `${pattern} ← ${path}`).toBe(expected);
    }
    expect(mm("deep/a/b.js", "b.js", { matchBase: true })).toBe(true);
  });

  it("11에서 없어진 makeRe는 test()를 가진 객체로 대신한다(no-internal-modules 전용)", () => {
    const { mm } = minimatchFrom("eslint-plugin-import");
    const re = mm.makeRe("src/**/internal/*");
    expect(re.test("src/a/internal/x")).toBe(true);
    expect(re.test("src/a/public/x")).toBe(false);
  });
});

describe("의존성 보안 하한(잠금 파일)", () => {
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const installed = Object.entries(lock.packages).filter(([key, value]) => key && value.version && !value.link);

  it("semver 비교는 프리릴리스를 더 낮게 본다", () => {
    expect(isBelow("11.0.1-rc.0", "11.0.1")).toBe(true);
    expect(isBelow("11.0.1", "11.0.1")).toBe(false);
    expect(isBelow("10.2.6", "11.0.1")).toBe(true);
    expect(isBelow("3.1.5", "11.0.1")).toBe(true);
  });

  it("설치되는 minimatch 엔진은 모두 11.0.1 이상이다 (GHSA-g3hv-75wg-m249)", () => {
    // 래퍼 자신(vendor/minimatch-v3-compat)은 엔진이 아니라서 빼고, 별칭 minimatch-patched는 넣는다.
    const engines = installed.filter(([key, value]) => key.startsWith("node_modules/") && (key.endsWith("node_modules/minimatch") || value.name === "minimatch"));
    expect(engines.length).toBeGreaterThanOrEqual(3);
    for (const [key, value] of engines) {
      expect(isBelow(value.version, "11.0.1"), `${key}@${value.version}`).toBe(false);
    }
  });

  it("zod는 모두 4.6.6 이상이다 (GHSA-mrhx-c7xc-m3w5)", () => {
    const zods = installed.filter(([key]) => key.endsWith("node_modules/zod"));
    expect(zods.length).toBeGreaterThan(0);
    for (const [key, value] of zods) {
      expect(isBelow(value.version, "4.6.6"), `${key}@${value.version}`).toBe(false);
    }
  });

  it("최상위 minimatch는 래퍼로 연결되고, override가 3.x·10.x 요청을 각각 받는다", () => {
    expect(lock.packages["node_modules/minimatch"]).toEqual({ resolved: "vendor/minimatch-v3-compat", link: true });
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    expect(pkg.devDependencies.minimatch).toBe("file:./vendor/minimatch-v3-compat");
    expect(pkg.overrides["minimatch@<10"]).toBe("$minimatch");
    expect(isBelow(pkg.overrides["minimatch@>=10 <11.0.1"], "11.0.1")).toBe(false);
  });
});
