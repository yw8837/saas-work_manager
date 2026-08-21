import { basename, dirname, join } from "node:path";

export function resolveWindowsNpxCli({
  nodeExecutable = process.execPath,
  npmExecPath = process.env.npm_execpath,
} = {}) {
  if (typeof npmExecPath === "string" && /^(?:npm|npx)-cli\.js$/i.test(basename(npmExecPath))) {
    return join(dirname(npmExecPath), "npx-cli.js");
  }
  return join(dirname(nodeExecutable), "node_modules", "npm", "bin", "npx-cli.js");
}

export function pinnedNpxInvocation(
  packageSpec,
  args,
  platform = process.platform,
  {
    nodeExecutable = process.execPath,
    npxCliPath = resolveWindowsNpxCli({ nodeExecutable }),
  } = {},
) {
  if (typeof packageSpec !== "string" || !/^[a-z0-9@./_-]+$/i.test(packageSpec)) {
    throw new Error("고정 실행할 npm package spec이 올바르지 않습니다.");
  }
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) {
    throw new Error("npx 인자는 문자열 배열이어야 합니다.");
  }
  if (platform === "win32") {
    return {
      executable: nodeExecutable,
      args: [npxCliPath, "-y", packageSpec, ...args],
    };
  }
  return {
    executable: "npx",
    args: ["-y", packageSpec, ...args],
  };
}
