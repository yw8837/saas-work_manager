'use strict';

/*
 * minimatch 3.x API를 패치된 minimatch 11 엔진 위에 제공한다.
 *
 * 왜: eslint 9, @eslint/eslintrc, @eslint/config-array, eslint-plugin-import·jsx-a11y·react는 아직
 * minimatch 3.x를 `minimatch(path, pattern)` 함수 호출로 쓴다. 11.x는 객체({ minimatch, Minimatch, ... })만
 * 내보내서 그대로 바꾸면 호출이 깨진다. GHSA-g3hv-75wg-m249는 11.0.1에서만 패치됐다.
 * (10.x를 쓰는 typescript-estree는 API가 같아 package.json override로 11을 직접 쓴다.)
 *
 * 3.x 동작을 그대로 맞추는 것:
 * - 패턴 앞뒤 공백을 지운다(3.1.5 minimatch.js:137 `pattern.trim()`).
 * - Windows에서 allowWindowsEscape가 없으면 패턴의 `\`를 경로 구분자로 본다(3.1.5 :140-141).
 *   11에서는 windowsPathsNoEscape 옵션이 같은 일을 한다. 파일 경로 쪽 `\` 처리는 11도 3.x와 같다.
 * 11에서 없어진 makeRe는 test()를 가진 객체로 대신한다(eslint-plugin-import no-internal-modules만 쓴다).
 * 업스트림이 11.0.1 이상으로 올라가면 package.json의 override와 함께 이 폴더를 지운다.
 */
const patched = require('minimatch-patched');

const isWindows = process.platform === 'win32';

function v3Pattern(pattern) {
  return typeof pattern === 'string' ? pattern.trim() : pattern;
}

function v3Options(options) {
  const opts = options || {};
  if (!isWindows || opts.allowWindowsEscape || opts.windowsPathsNoEscape !== undefined) return opts;
  return Object.assign({}, opts, { windowsPathsNoEscape: true });
}

class Minimatch extends patched.Minimatch {
  constructor(pattern, options) {
    super(v3Pattern(pattern), v3Options(options));
  }
}

function minimatch(path, pattern, options) {
  return patched.minimatch(path, v3Pattern(pattern), v3Options(options));
}

minimatch.minimatch = minimatch;
minimatch.Minimatch = Minimatch;
minimatch.sep = patched.sep;
minimatch.GLOBSTAR = patched.GLOBSTAR;
minimatch.escape = patched.escape;
minimatch.unescape = patched.unescape;
minimatch.braceExpand = (pattern, options) => patched.braceExpand(v3Pattern(pattern), v3Options(options));
minimatch.filter = (pattern, options) => (path) => minimatch(path, pattern, options);
minimatch.match = (list, pattern, options) => patched.match(list, v3Pattern(pattern), v3Options(options));
minimatch.makeRe = function makeRe(pattern, options) {
  const matcher = new Minimatch(pattern, options);
  return {
    source: matcher.pattern,
    test: (path) => matcher.match(path),
    toString: () => `minimatch(${matcher.pattern})`,
  };
};
minimatch.defaults = function defaults(def) {
  const base = def || {};
  const withDefaults = (path, pattern, options) => minimatch(path, pattern, Object.assign({}, base, options));
  Object.assign(withDefaults, minimatch);
  withDefaults.minimatch = withDefaults;
  withDefaults.Minimatch = class extends Minimatch {
    constructor(pattern, options) {
      super(pattern, Object.assign({}, base, options));
    }
  };
  withDefaults.defaults = (more) => minimatch.defaults(Object.assign({}, base, more));
  return withDefaults;
};

module.exports = minimatch;
