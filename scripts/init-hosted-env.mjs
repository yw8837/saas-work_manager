import { constants, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function initializeHostedEnv(root = process.cwd()) {
  const source = join(root, ".env.hosted.example");
  const destination = join(root, ".env.local");
  if (!existsSync(source)) throw new Error(".env.hosted.example이 없습니다.");
  if (existsSync(destination)) {
    throw new Error(".env.local이 이미 있어 덮어쓰지 않았습니다. 기존 파일을 직접 검토하세요.");
  }
  copyFileSync(source, destination, constants.COPYFILE_EXCL);
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    initializeHostedEnv();
    console.log("[hosted-env] .env.local 초안을 만들었습니다. 실제 값으로 바꾼 뒤 npm run status:domain-ready를 실행하세요.");
  } catch (error) {
    console.error(`[hosted-env] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
