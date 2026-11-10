import Foundation
import Capacitor
import StoreKit
import UIKit
import UserNotifications

/// Slabhold's own native bits, registered by SlabholdBridgeViewController.
/// The web calls it as `SlabholdNative` through lib/ios/native.ts only.
@objc(SlabholdNativePlugin)
public class SlabholdNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SlabholdNativePlugin"
    public let jsName = "SlabholdNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBadge", returnType: CAPPluginReturnPromise)
    ]

    /// Apple's "Rate Slabhold" popup. Apple decides whether it shows (and caps it
    /// at 3 a year), so `asked` only means we asked. Never rejects.
    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) else {
                call.resolve(["asked": false])
                return
            }
            SKStoreReviewController.requestReview(in: scene)
            call.resolve(["asked": true])
        }
    }

    /// The red number on the app icon. 0 clears it. Never rejects.
    @objc func setBadge(_ call: CAPPluginCall) {
        let count = max(0, call.getInt("count") ?? 0)
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(count) { _ in
                call.resolve()
            }
        } else {
            DispatchQueue.main.async {
                UIApplication.shared.applicationIconBadgeNumber = count
                call.resolve()
            }
        }
    }
}
