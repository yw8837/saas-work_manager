export function verifyNativeSources(read) {
  const requirements = [
    ["android/app/src/main/java/com/yeolmaestudio/ilgamcheck/MainActivity.java", "registerPlugin(SecureSessionPlugin.class)"],
    ["ios/App/App/IlgamBridgeViewController.swift", "registerPluginInstance(SecureSessionPlugin())"],
    ["ios/App/App/IlgamBridgeViewController.swift", "registerPluginInstance(NativeMessagingPlugin())"],
    ["android/app/src/main/AndroidManifest.xml", 'android:scheme="com.yeolmaestudio.ilgamcheck"'],
    ["android/app/src/main/AndroidManifest.xml", "firebase_messaging_auto_init_enabled"],
    ["ios/App/App/Info.plist", "com.yeolmaestudio.ilgamcheck"],
    ["ios/App/App/Info.plist", "FirebaseMessagingAutoInitEnabled"],
    ["ios/App/App/AppDelegate.swift", "Messaging.messaging().apnsToken = deviceToken"],
    ["ios/App/App/App.entitlements", "aps-environment"],
    ["src/lib/native/auth.ts", "code"],
    ["src/lib/native/push.ts", "register_native_push_device"],
  ];
  for (const [path, token] of requirements) {
    if (!read(path).includes(token)) throw new Error(`missing native contract: ${path}: ${token}`);
  }
  return ["secure-session", "oauth-callback", "push-source-wiring"];
}
export function mobileVerificationSummary() {
  return "[mobile-verify] PASS source contracts and bundled web assets only. NOT VERIFIED: real-device OAuth, background push, Android install, iOS compilation/signing/TestFlight, production settings.";
}
