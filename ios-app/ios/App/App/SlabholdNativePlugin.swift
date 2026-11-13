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
        CAPPluginMethod(name: "setBadge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFiles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    /// Most a single share may carry, all files together.
    private static let maxShareBytes = 10 * 1024 * 1024

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

    /// Slabhold's page in the Settings app, where the collector can turn the camera
    /// back on. `opened` says whether iOS opened it. Never rejects.
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString),
                  UIApplication.shared.canOpenURL(url) else {
                call.resolve(["opened": false])
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                call.resolve(["opened": opened])
            }
        }
    }

    /// The iOS share sheet for files (the collection chart, the Story image).
    /// Images go in as UIImage, so the sheet offers Save Image, Instagram and
    /// Messages; anything else goes in as a temporary file. Never rejects:
    /// `shown: false` when it can't show, `completed` once it closes.
    @objc func shareFiles(_ call: CAPPluginCall) {
        let input = call.getArray("files", JSObject.self) ?? []
        var items: [Any] = []
        var tempFiles: [URL] = []
        var total = 0
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("slabhold-share", isDirectory: true)

        func cleanUp() {
            for url in tempFiles { try? FileManager.default.removeItem(at: url) }
        }

        for entry in input {
            guard let base64 = entry["base64"] as? String,
                  let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { continue }
            total += data.count
            if total > SlabholdNativePlugin.maxShareBytes {
                cleanUp()
                call.resolve(["shown": false])
                return
            }
            let mime = (entry["mime"] as? String) ?? ""
            if mime.hasPrefix("image/"), let image = UIImage(data: data) {
                items.append(image)
                continue
            }
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let url = folder.appendingPathComponent(SlabholdNativePlugin.safeFileName(entry["name"] as? String))
                try data.write(to: url, options: .atomic)
                tempFiles.append(url)
                items.append(url)
            } catch {
                continue
            }
        }
        if let text = call.getString("text"), !text.isEmpty {
            items.append(text)
        }
        guard !items.isEmpty else {
            cleanUp()
            call.resolve(["shown": false])
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.bridge?.viewController else {
                cleanUp()
                call.resolve(["shown": false])
                return
            }
            var top = presenter
            while let next = top.presentedViewController { top = next }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            // iPad shows the sheet as a popover; without an anchor it crashes.
            if let popover = sheet.popoverPresentationController, let view = top.view {
                popover.sourceView = view
                popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            sheet.completionWithItemsHandler = { _, completed, _, _ in
                cleanUp()
                call.resolve(["shown": true, "completed": completed])
            }
            top.present(sheet, animated: true)
        }
    }

    /// A plain file name: letters, digits, dot, dash and underscore only.
    private static func safeFileName(_ name: String?) -> String {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
        let cleaned = String((name ?? "").unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" })
            .trimmingCharacters(in: CharacterSet(charactersIn: ".-"))
        return cleaned.isEmpty ? "slabhold-share" : String(cleaned.prefix(80))
    }
}
