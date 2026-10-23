import Foundation
import Security
import Capacitor

@objc(SecureSessionPlugin)
public class SecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureSessionPlugin"
    public let jsName = "SecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let service = "com.yeolmaestudio.ilgamcheck.session.v1"
    private let installationKey = "ilgamcheck.session.installation.v1"
    private let lock = NSLock()
    private enum StorageError: Error { case unavailable }

    private var serviceQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrSynchronizable as String: false]
    }

    private func query(_ key: String) -> [String: Any] {
        var result = serviceQuery
        result[kSecAttrAccount as String] = key
        return result
    }

    private func read(_ key: String) throws -> String? {
        var request = query(key)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else { throw StorageError.unavailable }
        return value
    }

    private func write(_ key: String, _ value: String) throws {
        let data = Data(value.utf8)
        guard data.count <= 131072 else { throw StorageError.unavailable }
        let attributes: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query(key) as CFDictionary, attributes as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw StorageError.unavailable }
        var item = query(key)
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw StorageError.unavailable }
    }

    // UserDefaults disappears on uninstall; Keychain can survive it.
    // Compare both markers and purge only this plugin's service before any session read.
    private func ensureInstallation() throws {
        let local = UserDefaults.standard.string(forKey: installationKey)
        let stored = try read("_installation")
        if let local, stored == local { return }
        let status = SecItemDelete(serviceQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw StorageError.unavailable }
        let identifier = UUID().uuidString
        try write("_installation", identifier)
        UserDefaults.standard.set(identifier, forKey: installationKey)
    }

    private func key(_ call: CAPPluginCall) throws -> String {
        guard let value = call.getString("key"),
              value.range(of: "^(sb-|ilgam-native-)[A-Za-z0-9._-]{1,200}$", options: .regularExpression) != nil
        else { throw StorageError.unavailable }
        return value
    }

    @objc public func get(_ call: CAPPluginCall) {
        lock.lock()
        defer { lock.unlock() }
        do {
            let name = try key(call)
            try ensureInstallation()
            if let value = try read(name) { call.resolve(["value": value]) }
            else { call.resolve(["value": NSNull()]) }
        } catch { call.reject("SECURE_SESSION_UNAVAILABLE") }
    }

    @objc public func set(_ call: CAPPluginCall) {
        lock.lock()
        defer { lock.unlock() }
        do {
            let name = try key(call)
            guard let value = call.getString("value") else { throw StorageError.unavailable }
            try ensureInstallation()
            try write(name, value)
            call.resolve()
        } catch { call.reject("SECURE_SESSION_UNAVAILABLE") }
    }

    @objc public func remove(_ call: CAPPluginCall) {
        lock.lock()
        defer { lock.unlock() }
        do {
            let name = try key(call)
            try ensureInstallation()
            let status = SecItemDelete(query(name) as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw StorageError.unavailable }
            call.resolve()
        } catch { call.reject("SECURE_SESSION_UNAVAILABLE") }
    }
}
