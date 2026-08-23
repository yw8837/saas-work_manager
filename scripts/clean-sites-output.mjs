import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";

const projectRoot = resolve(process.cwd());
const outputDirectory = resolve(projectRoot, "dist");

if (!outputDirectory.startsWith(`${projectRoot}${sep}`)) {
  throw new Error("Sites output directory must stay inside this project.");
}

rmSync(outputDirectory, { recursive: true, force: true });
