import { posix, win32 } from "node:path";

/**
 * 정책 스크립트는 node:path의 isAbsolute로 "지금 이 기계"의 절대경로인지 검사한다.
 * 그래서 테스트 픽스처도 호스트 규칙을 따라야 한다.
 * 윈도우 경로를 리눅스 CI에 그대로 넣으면 절대경로로 인정되지 않아 테스트만 깨진다.
 *
 * 구분자를 직접 적지 않고 node:path에서 가져온다. 소스에 백슬래시를 두지 않기 위해서다.
 */
export const ON_WINDOWS = process.platform === "win32";

const SEP = ON_WINDOWS ? win32.sep : posix.sep;

function joinFrom(prefix, segments) {
  return segments.length ? `${prefix}${segments.join(SEP)}` : prefix;
}

/** 저장소가 있다고 가정하는 위치. */
export function fixtureRepoRoot() {
  return ON_WINDOWS
    ? joinFrom(`C:${SEP}`, ["workspace", "ilgamcheck"])
    : joinFrom(SEP, ["workspace", "ilgamcheck"]);
}

/** 저장소 안쪽 경로. 백업 위치로는 거부돼야 한다. */
export function fixtureInsideRepo(...segments) {
  const parts = segments.length ? segments : ["backups"];
  return `${fixtureRepoRoot()}${SEP}${parts.join(SEP)}`;
}

/** 저장소 밖 절대경로. 백업·증거 파일이 있어야 할 위치다. */
export function fixtureOutsideRepo(...segments) {
  const parts = segments.length ? segments : ["encrypted", "ilgamcheck"];
  return ON_WINDOWS
    ? joinFrom(`D:${SEP}`, parts)
    : joinFrom(SEP, ["mnt", "secure", ...parts]);
}
