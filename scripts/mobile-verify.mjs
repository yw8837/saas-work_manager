import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { verifyNativeSources, mobileVerificationSummary } from "./mobile-verify-policy.mjs";

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

const document = readFileSync(resolve(root, "index.html"), "utf8");
if (!document.includes("viewport-fit=cover")) throw new Error("mobile viewport does not enable safe areas");

const styles = readFileSync(resolve(root, "src/styles/theme.css"), "utf8");
for (const safeAreaToken of ["safe-area-inset-top", "safe-area-inset-bottom", "100svh"]) {
  if (!styles.includes(safeAreaToken)) throw new Error(`mobile styles are missing ${safeAreaToken}`);
}

const androidManifest = readFileSync(resolve(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
if (!androidManifest.includes('android:windowSoftInputMode="adjustResize"')) {
  throw new Error("Android activity does not resize for the software keyboard");
}
for (const securitySetting of ['android:allowBackup="false"', 'android:usesCleartextTraffic="false"']) {
  if (!androidManifest.includes(securitySetting)) throw new Error(`Android manifest is missing ${securitySetting}`);
}

const iosInfo = readFileSync(resolve(root, "ios/App/App/Info.plist"), "utf8");
for (const orientation of ["UIInterfaceOrientationPortrait", "UIInterfaceOrientationLandscapeLeft"]) {
  if (!iosInfo.includes(orientation)) throw new Error(`iOS Info.plist is missing ${orientation}`);
}

const bundle = statSync(resolve(root, "dist/client/index.html"));
if (bundle.size === 0) throw new Error("mobile web bundle is empty");

verifyNativeSources((path) => readFileSync(resolve(root, path), "utf8"));
console.log(mobileVerificationSummary());
