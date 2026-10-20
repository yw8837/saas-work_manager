import Capacitor
import FirebaseCore
import FirebaseMessaging

// FCM token bridge only. APNs tokens remain inside AppDelegate/Capacitor.
@objc(NativeMessagingPlugin)
public class NativeMessagingPlugin: CAPPlugin, CAPBridgedPlugin, MessagingDelegate {
    public let identifier = "NativeMessagingPlugin"
    public let jsName = "NativeMessaging"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteToken", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        if FirebaseApp.app() != nil { Messaging.messaging().delegate = self }
    }

    @objc func getToken(_ call: CAPPluginCall) {
        guard FirebaseApp.app() != nil, Messaging.messaging().apnsToken != nil else {
            call.reject("알림 설정과 APNs 등록을 확인해주세요.", "MESSAGING_UNAVAILABLE")
            return
        }
        Messaging.messaging().autoInitEnabled = true
        Messaging.messaging().token { token, error in
            guard error == nil, let token = token, !token.isEmpty else {
                call.reject("알림 기기를 등록하지 못했어요.", "MESSAGING_UNAVAILABLE")
                return
            }
            call.resolve(["token": token])
        }
    }

    @objc func deleteToken(_ call: CAPPluginCall) {
        guard FirebaseApp.app() != nil else { call.resolve(); return }
        Messaging.messaging().autoInitEnabled = false
        Messaging.messaging().deleteToken { error in
            if error != nil {
                call.reject("알림 등록을 해제하지 못했어요.", "MESSAGING_UNAVAILABLE")
            } else { call.resolve() }
        }
    }

    public func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken, !token.isEmpty else { return }
        notifyListeners("tokenRefreshed", data: ["token": token])
    }
}
