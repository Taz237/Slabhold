import UIKit
import Capacitor

/// Capacitor's bridge, plus our local plugin (SlabholdNativePlugin).
/// SceneDelegate and Main.storyboard both use this class.
class SlabholdBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SlabholdNativePlugin())
    }
}
