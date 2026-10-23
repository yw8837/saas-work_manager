import { expect, it } from "vitest";
import { normalizeIosPackagePaths } from "./normalize-ios-spm.mjs";
it("normalizes generated Windows package paths without changing SDK pins or URLs", () => {
  const text = String.raw`.package(name: "CapacitorApp", path: "..\..\..\node_modules\@capacitor\app"),
.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.3")`;
  expect(normalizeIosPackagePaths(text)).toBe(`.package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.3")`);
});
it("leaves macOS-generated paths unchanged", () => {
  const text = '.package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app")';
  expect(normalizeIosPackagePaths(text)).toBe(text);
});
