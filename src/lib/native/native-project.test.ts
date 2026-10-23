// Source contract checks, not substitutes for Android/iOS device tests.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("native secure session wiring", () => {
  it("declares the callback scheme on both operating systems", () => {
    const manifest = source("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('android:scheme="com.yeolmaestudio.ilgamcheck"');
    expect(manifest).toContain('android:host="auth"');
    expect(manifest).toContain('android:path="/callback"');
    expect(source("ios/App/App/Info.plist")).toContain("<key>CFBundleURLSchemes</key>");
    expect(source("ios/App/App/Info.plist")).toContain("<string>com.yeolmaestudio.ilgamcheck</string>");
  });
  it("registers the Android Keystore bridge and commits encrypted data", () => {
    const plugin = source("android/app/src/main/java/com/yeolmaestudio/ilgamcheck/SecureSessionPlugin.java");
    expect(plugin).toContain('KeyStore.getInstance("AndroidKeyStore")');
    expect(plugin).toContain('Cipher.getInstance("AES/GCM/NoPadding")');
    expect(plugin).toContain("updateAAD");
    expect(plugin).toContain(".commit()");
    expect(source("android/app/src/main/java/com/yeolmaestudio/ilgamcheck/MainActivity.java"))
      .toContain("registerPlugin(SecureSessionPlugin.class)");
  });
  it("accepts the valid AES-GCM envelope of an empty stored string", () => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", randomBytes(32), iv);
    const encrypted = Buffer.concat([cipher.update(""), cipher.final()]);
    const envelopeLength = iv.length + encrypted.length + cipher.getAuthTag().length;
    const java = source("android/app/src/main/java/com/yeolmaestudio/ilgamcheck/SecureSessionPlugin.java");
    const minimum = Number(java.match(/bytes\.length < (\d+)/)?.[1]);
    expect(Number.isFinite(minimum)).toBe(true);
    expect(envelopeLength).toBeGreaterThanOrEqual(minimum);
  });
  it("clears stale iOS Keychain state before marking a fresh installation", () => {
    const plugin = source("ios/App/App/SecureSessionPlugin.swift");
    expect(plugin).toContain("kSecAttrAccessibleWhenUnlockedThisDeviceOnly");
    const deletion = plugin.indexOf("SecItemDelete(serviceQuery");
    const marker = plugin.indexOf("UserDefaults.standard.set");
    expect(deletion).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(deletion);
    expect(plugin).toContain("errSecItemNotFound");
    expect(plugin).toContain("SECURE_SESSION_UNAVAILABLE");
    expect(source("ios/App/App/IlgamBridgeViewController.swift")).toContain("registerPluginInstance(SecureSessionPlugin())");
    expect(source("ios/App/App/SceneDelegate.swift")).toContain("IlgamBridgeViewController()");
    expect(source("ios/App/App.xcodeproj/project.pbxproj")).toContain("SecureSessionPlugin.swift in Sources");
  });
  it("wires iOS Firebase Messaging separately from the APNs callback without Analytics", () => {
    const plugin = source("ios/App/App/NativeMessagingPlugin.swift");
    expect(plugin).toContain("Messaging.messaging().token");
    expect(plugin).toContain("Messaging.messaging().deleteToken");
    expect(plugin).toContain("tokenRefreshed");
    const delegate = source("ios/App/App/AppDelegate.swift");
    expect(delegate).toContain("Messaging.messaging().apnsToken = deviceToken");
    expect(delegate).toContain(".capacitorDidRegisterForRemoteNotifications");
    expect(source("ios/App/App/IlgamBridgeViewController.swift")).toContain("NativeMessagingPlugin()");
    expect(source("ios/App/App.xcodeproj/project.pbxproj")).toContain("FirebaseMessaging");
    expect(source("ios/App/App.xcodeproj/project.pbxproj")).not.toContain("FirebaseAnalytics");
    expect(source("ios/App/App/Info.plist")).toMatch(/FirebaseMessagingAutoInitEnabled<\/key>\s*<false/);
    expect(source("ios/App/App/App.entitlements")).toContain("aps-environment");
  });
  it("disables Android FCM auto-init until explicit registration and supplies a monochrome icon", () => {
    const manifest = source("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('android:name="firebase_messaging_auto_init_enabled" android:value="false"');
    expect(manifest).toContain('android:name="firebase_analytics_collection_enabled" android:value="false"');
    expect(manifest).toContain("@drawable/ic_stat_revision");
    expect(source("android/app/src/main/res/drawable/ic_stat_revision.xml")).toContain('android:fillColor="#FFFFFFFF"');
  });
});
