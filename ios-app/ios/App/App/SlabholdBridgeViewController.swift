import UIKit
import Capacitor

/// Capacitor's bridge, plus our local plugins (SlabholdNativePlugin, SlabholdScannerPlugin).
/// SceneDelegate and Main.storyboard both use this class.
class SlabholdBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SlabholdNativePlugin())
        bridge?.registerPluginInstance(SlabholdScannerPlugin())
    }
}
