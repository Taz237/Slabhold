import AVFoundation
import Capacitor
import Foundation
import UIKit

/// The card scanner, registered by SlabholdBridgeViewController.
/// The web calls it as `SlabholdScanner` through lib/ios/native.ts only, and
/// lib/ios/scanner.ts checks every result. Reading happens on the phone with
/// Apple Vision; this plugin makes no network calls.
@objc(SlabholdScannerPlugin)
public class SlabholdScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SlabholdScannerPlugin"
    public let jsName = "SlabholdScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scanCard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    /// The full-screen camera: a card guide, auto-capture, then the read.
    /// Resolves `{ cancelled: true }` on Close, and `{ cancelled: true, denied: true }`
    /// when camera access is off. Rejects only when the camera can't start.
    @objc func scanCard(_ call: CAPPluginCall) {
        CardScannerAccess.request { granted in
            DispatchQueue.main.async { [weak self] in
                guard granted else {
                    call.resolve(["cancelled": true, "denied": true])
                    return
                }
                guard let presenter = self?.bridge?.viewController else {
                    call.reject("The camera isn't available right now.")
                    return
                }
                let scanner = CardScannerViewController { outcome in
                    switch outcome {
                    case .cancelled:
                        call.resolve(["cancelled": true])
                    case .captured(let read):
                        call.resolve(read.jsObject)
                    case .failed(let message):
                        call.reject(message)
                    }
                }
                scanner.modalPresentationStyle = .fullScreen
                presenter.present(scanner, animated: true)
            }
        }
    }

    /// Reads a photo the web already has (a library pick) the same way.
    @objc func recognize(_ call: CAPPluginCall) {
        guard let input = call.getString("image"), let image = CardTextReader.decode(input) else {
            call.reject("That photo couldn't be read.")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            call.resolve(CardTextReader.read(image: image).jsObject)
        }
    }
}

extension SlabholdScannerPlugin {
    /// Slabhold's page in Settings, where camera access is turned back on. Never rejects.
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.resolve(["opened": false])
                return
            }
            UIApplication.shared.open(url) { opened in
                call.resolve(["opened": opened])
            }
        }
    }
}

/// Camera permission. NSCameraUsageDescription in Info.plist explains it.
enum CardScannerAccess {
    static func request(_ done: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            done(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video, completionHandler: done)
        default:
            done(false)
        }
    }
}
