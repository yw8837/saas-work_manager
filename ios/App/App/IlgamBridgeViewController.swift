import Capacitor

class IlgamBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureSessionPlugin())
        bridge?.registerPluginInstance(NativeMessagingPlugin())
    }
}
