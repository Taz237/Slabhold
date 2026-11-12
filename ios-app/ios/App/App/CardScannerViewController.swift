import AVFoundation
import UIKit
import Vision

/// The live card scanner: a full-screen camera with a card-shaped guide. When a
/// card fills the guide and holds steady for about half a second it captures on
/// its own, straightens the card and reads it on the phone. The shutter button
/// takes it by hand at any time. One hint at a time, 44pt tap targets, and no
/// flash or snap animation when Reduce Motion is on.
///
/// A raw card whose front shows no card number gets one more step: "Flip it
/// over for the card #", read the back the same way, or Skip. Slabs never ask:
/// the label carries the number.
final class CardScannerViewController: UIViewController {
    enum Outcome {
        case cancelled
        case captured(CardRead)
        case failed(String)
    }

    enum Hint: String {
        case fit = "Fit the card in the frame"
        case closer = "Move a little closer"
        case holdStill = "Hold still"
        case gotIt = "Got it"
        case manual = "Tap the button to take it yourself"
        case flip = "Flip it over for the card #"
        case noText = "We couldn't read that one. Try again with the card flat and in good light."
    }

    /// Brand colors from CLAUDE.md: purple #7C3AED, background #09090B, off-white #F4F4F5.
    static let brandPurple = UIColor(red: 124 / 255, green: 58 / 255, blue: 237 / 255, alpha: 1)
    static let background = UIColor(red: 9 / 255, green: 9 / 255, blue: 11 / 255, alpha: 1)
    static let offWhite = UIColor(red: 244 / 255, green: 244 / 255, blue: 245 / 255, alpha: 1)

    /// Raw card 2.5 x 3.5 in; slab about 3.1 x 5.3 in.
    static let cardAspect: CGFloat = 2.5 / 3.5
    static let slabAspect: CGFloat = 3.1 / 5.3
    /// Steady checks in a row before auto-capture. Every 2nd frame at 30 fps: about 0.4 s.
    static let steadyFramesNeeded = 6
    /// Most a corner may move between checks, as a share of the frame, and still be steady.
    static let maxCornerDrift: CGFloat = 0.02
    /// The card must cover at least this share of the frame.
    static let minEdgeArea: CGFloat = 0.2
    /// With no lock after this long, the hint points to the shutter.
    static let manualHintAfter: TimeInterval = 6
    static let minTapTarget: CGFloat = 44

    private let finish: (Outcome) -> Void
    private var finished = false

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "app.slabhold.scanner.session")
    private let videoQueue = DispatchQueue(label: "app.slabhold.scanner.video")
    private let videoOutput = AVCaptureVideoDataOutput()
    private let photoOutput = AVCapturePhotoOutput()
    private var device: AVCaptureDevice?
    private lazy var previewLayer = AVCaptureVideoPreviewLayer(session: session)

    private let dimLayer = CAShapeLayer()
    private let guideLayer = CAShapeLayer()
    private let hintLabel = UILabel()
    private let closeButton = UIButton(type: .system)
    private let torchButton = UIButton(type: .system)
    private let shutterButton = UIButton(type: .custom)
    private let skipButton = UIButton(type: .system)
    private let modeControl = UISegmentedControl(items: ["Card", "Slab"])
    private let flashView = UIView()

    /// The front, kept while the camera waits for the back. Main thread only.
    private var front: CardRead?
    /// Main thread only.
    private var capturing = false
    private var currentHint: Hint?
    private var appearedAt = Date()
    /// A notice ("We couldn't read that one") stays up this long before frame hints take over again.
    private var noticeUntil = Date.distantPast
    static let noticeSeconds: TimeInterval = 2.5

    /// Video queue only. After the front is taken, the card must leave the frame
    /// (it's being flipped) before the back can lock.
    private var needsClearFrame = false
    private var clearRequestedAt = Date.distantPast
    /// A quick flip may never leave the frame; after this long the back can lock anyway.
    static let flipClearSeconds: TimeInterval = 1.2
    /// Video queue only.
    private var frameCount = 0
    private var steadyFrames = 0
    private var lastEdge: VNRectangleObservation?

    private let lockHaptic = UIImpactFeedbackGenerator(style: .light)
    private let doneHaptic = UINotificationFeedbackGenerator()

    init(finish: @escaping (Outcome) -> Void) {
        self.finish = finish
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.background
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        setUpOverlay()
        configureSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
        layoutGuide()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        appearedAt = Date()
        show(.fit, locked: false)
        lockHaptic.prepare()
        sessionQueue.async { [session] in
            if !session.isRunning { session.startRunning() }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        setTorch(on: false)
        sessionQueue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    // MARK: Camera

    private func configureSession() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            self.session.sessionPreset = .photo
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                  let input = try? AVCaptureDeviceInput(device: device),
                  self.session.canAddInput(input) else {
                self.session.commitConfiguration()
                DispatchQueue.main.async { self.end(.failed("The camera couldn't start.")) }
                return
            }
            self.session.addInput(input)
            self.device = device
            if device.isFocusModeSupported(.continuousAutoFocus), (try? device.lockForConfiguration()) != nil {
                device.focusMode = .continuousAutoFocus
                device.unlockForConfiguration()
            }
            self.videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            self.videoOutput.alwaysDiscardsLateVideoFrames = true
            self.videoOutput.setSampleBufferDelegate(self, queue: self.videoQueue)
            if self.session.canAddOutput(self.videoOutput) { self.session.addOutput(self.videoOutput) }
            if self.session.canAddOutput(self.photoOutput) { self.session.addOutput(self.photoOutput) }
            self.session.commitConfiguration()
            let hasTorch = device.hasTorch
            DispatchQueue.main.async { self.torchButton.isHidden = !hasTorch }
        }
    }

    private func setTorch(on: Bool) {
        guard let device, device.hasTorch, (try? device.lockForConfiguration()) != nil else { return }
        device.torchMode = on ? .on : .off
        device.unlockForConfiguration()
        let symbol = on ? "bolt.fill" : "bolt.slash.fill"
        DispatchQueue.main.async {
            self.torchButton.setImage(UIImage(systemName: symbol), for: .normal)
            self.torchButton.accessibilityValue = on ? "On" : "Off"
        }
    }

    // MARK: Overlay

    private func setUpOverlay() {
        dimLayer.fillRule = .evenOdd
        dimLayer.fillColor = UIColor.black.withAlphaComponent(0.55).cgColor
        view.layer.addSublayer(dimLayer)

        guideLayer.fillColor = UIColor.clear.cgColor
        guideLayer.strokeColor = Self.offWhite.cgColor
        guideLayer.lineWidth = 4
        guideLayer.lineCap = .round
        view.layer.addSublayer(guideLayer)

        flashView.backgroundColor = .white
        flashView.alpha = 0
        flashView.isUserInteractionEnabled = false
        flashView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(flashView)

        hintLabel.textColor = Self.offWhite
        hintLabel.font = UIFont.systemFont(ofSize: 15, weight: .medium)
        hintLabel.textAlignment = .center
        hintLabel.numberOfLines = 2
        hintLabel.adjustsFontForContentSizeCategory = true
        hintLabel.accessibilityTraits = .updatesFrequently
        hintLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hintLabel)

        closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
        closeButton.tintColor = Self.offWhite
        closeButton.accessibilityLabel = "Close"
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(closeButton)

        torchButton.setImage(UIImage(systemName: "bolt.slash.fill"), for: .normal)
        torchButton.tintColor = Self.offWhite
        torchButton.accessibilityLabel = "Flashlight"
        torchButton.accessibilityValue = "Off"
        torchButton.isHidden = true
        torchButton.addTarget(self, action: #selector(torchTapped), for: .touchUpInside)
        torchButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(torchButton)

        modeControl.selectedSegmentIndex = 0
        modeControl.selectedSegmentTintColor = Self.offWhite
        modeControl.setTitleTextAttributes([.foregroundColor: Self.background], for: .selected)
        modeControl.setTitleTextAttributes([.foregroundColor: Self.offWhite], for: .normal)
        modeControl.accessibilityLabel = "Card or slab"
        modeControl.addTarget(self, action: #selector(modeChanged), for: .valueChanged)
        modeControl.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(modeControl)

        shutterButton.backgroundColor = Self.offWhite
        shutterButton.layer.cornerRadius = 36
        shutterButton.layer.borderWidth = 4
        shutterButton.layer.borderColor = Self.background.withAlphaComponent(0.6).cgColor
        shutterButton.accessibilityLabel = "Take photo"
        shutterButton.addTarget(self, action: #selector(shutterTapped), for: .touchUpInside)
        shutterButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(shutterButton)

        skipButton.setTitle("Skip", for: .normal)
        skipButton.setTitleColor(Self.offWhite, for: .normal)
        skipButton.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        skipButton.accessibilityLabel = "Skip the back"
        skipButton.isHidden = true
        skipButton.addTarget(self, action: #selector(skipTapped), for: .touchUpInside)
        skipButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(skipButton)

        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            flashView.topAnchor.constraint(equalTo: view.topAnchor),
            flashView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            flashView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            flashView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            closeButton.topAnchor.constraint(equalTo: safe.topAnchor, constant: 8),
            closeButton.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 8),
            closeButton.widthAnchor.constraint(equalToConstant: Self.minTapTarget),
            closeButton.heightAnchor.constraint(equalToConstant: Self.minTapTarget),

            torchButton.topAnchor.constraint(equalTo: safe.topAnchor, constant: 8),
            torchButton.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -8),
            torchButton.widthAnchor.constraint(equalToConstant: Self.minTapTarget),
            torchButton.heightAnchor.constraint(equalToConstant: Self.minTapTarget),

            shutterButton.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -24),
            shutterButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            shutterButton.widthAnchor.constraint(equalToConstant: 72),
            shutterButton.heightAnchor.constraint(equalToConstant: 72),

            skipButton.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
            skipButton.leadingAnchor.constraint(equalTo: shutterButton.trailingAnchor, constant: 24),
            skipButton.widthAnchor.constraint(greaterThanOrEqualToConstant: Self.minTapTarget),
            skipButton.heightAnchor.constraint(equalToConstant: Self.minTapTarget),

            modeControl.bottomAnchor.constraint(equalTo: shutterButton.topAnchor, constant: -20),
            modeControl.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            modeControl.widthAnchor.constraint(equalToConstant: 200),
            modeControl.heightAnchor.constraint(greaterThanOrEqualToConstant: Self.minTapTarget),

            hintLabel.bottomAnchor.constraint(equalTo: modeControl.topAnchor, constant: -20),
            hintLabel.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 24),
            hintLabel.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -24)
        ])
    }

    /// The guide's rectangle: the card shape (or slab shape), centered a little above the middle.
    private func guideRect() -> CGRect {
        let bounds = view.bounds
        let aspect = modeControl.selectedSegmentIndex == 1 ? Self.slabAspect : Self.cardAspect
        var width = bounds.width - 64
        var height = width / aspect
        let maxHeight = bounds.height * 0.58
        if height > maxHeight {
            height = maxHeight
            width = height * aspect
        }
        return CGRect(x: (bounds.width - width) / 2, y: bounds.height * 0.42 - height / 2, width: width, height: height)
    }

    private func layoutGuide() {
        let rect = guideRect()
        let dim = UIBezierPath(rect: view.bounds)
        dim.append(UIBezierPath(roundedRect: rect, cornerRadius: 14))
        dimLayer.path = dim.cgPath

        let arm: CGFloat = 28
        let corners = UIBezierPath()
        corners.move(to: CGPoint(x: rect.minX, y: rect.minY + arm))
        corners.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        corners.addLine(to: CGPoint(x: rect.minX + arm, y: rect.minY))
        corners.move(to: CGPoint(x: rect.maxX - arm, y: rect.minY))
        corners.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        corners.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + arm))
        corners.move(to: CGPoint(x: rect.maxX, y: rect.maxY - arm))
        corners.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        corners.addLine(to: CGPoint(x: rect.maxX - arm, y: rect.maxY))
        corners.move(to: CGPoint(x: rect.minX + arm, y: rect.maxY))
        corners.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        corners.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - arm))
        guideLayer.path = corners.cgPath
    }

    /// One hint at a time; the guide turns brand purple while a card is locked.
    private func show(_ hint: Hint, locked: Bool) {
        var hint = hint
        if front != nil && (hint == .fit || hint == .closer || hint == .manual) {
            hint = .flip
        }
        if (hint == .fit || hint == .closer) && Date().timeIntervalSince(appearedAt) > Self.manualHintAfter {
            hint = .manual
        }
        let color = (locked ? Self.brandPurple : Self.offWhite).cgColor
        CATransaction.begin()
        CATransaction.setDisableActions(UIAccessibility.isReduceMotionEnabled)
        CATransaction.setAnimationDuration(0.16)
        guideLayer.strokeColor = color
        CATransaction.commit()
        guard hint != currentHint else { return }
        if hint == .holdStill && currentHint != .holdStill { lockHaptic.impactOccurred() }
        currentHint = hint
        hintLabel.text = hint.rawValue
        UIAccessibility.post(notification: .announcement, argument: hint.rawValue)
    }

    private func flash() {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        flashView.alpha = 0.7
        UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseOut]) {
            self.flashView.alpha = 0
        }
    }

    // MARK: Actions

    @objc private func closeTapped() {
        end(.cancelled)
    }

    @objc private func torchTapped() {
        setTorch(on: device?.torchMode != .on)
    }

    @objc private func modeChanged() {
        if UIAccessibility.isReduceMotionEnabled {
            layoutGuide()
        } else {
            CATransaction.begin()
            CATransaction.setAnimationDuration(0.3)
            layoutGuide()
            CATransaction.commit()
        }
    }

    @objc private func shutterTapped() {
        capture()
    }

    /// Done without the back: the front's read goes through as it is.
    @objc private func skipTapped() {
        guard let front, !capturing else { return }
        end(.captured(front))
    }

    /// The front is in; wait for the back.
    private func askForBack(_ read: CardRead) {
        front = read
        capturing = false
        appearedAt = Date()
        skipButton.isHidden = false
        modeControl.isEnabled = false
        videoQueue.async { [weak self] in
            self?.needsClearFrame = true
            self?.clearRequestedAt = Date()
            self?.steadyFrames = 0
            self?.lastEdge = nil
        }
        doneHaptic.notificationOccurred(.success)
        show(.flip, locked: false)
    }

    /// A raw card's front with no card number line: the back usually has it.
    static func needsBack(_ read: CardRead) -> Bool {
        if read.kind == "slab" { return false }
        return !read.lines.contains { line in
            line.range(of: #"(#|\bNO\.)\s*[A-Z0-9]"#, options: [.regularExpression, .caseInsensitive]) != nil
        }
    }

    private func capture() {
        guard !capturing, !finished else { return }
        capturing = true
        doneHaptic.prepare()
        show(.gotIt, locked: true)
        flash()
        photoOutput.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
    }

    private func end(_ outcome: Outcome) {
        guard !finished else { return }
        finished = true
        dismiss(animated: !UIAccessibility.isReduceMotionEnabled) { [finish] in
            finish(outcome)
        }
    }

    // MARK: Auto-capture (video queue)

    private func evaluate(_ edge: VNRectangleObservation?) {
        if needsClearFrame {
            if edge == nil || Date().timeIntervalSince(clearRequestedAt) > Self.flipClearSeconds {
                needsClearFrame = false
            }
            return
        }
        guard let edge, edge.confidence >= 0.7 else {
            steadyFrames = 0
            lastEdge = nil
            DispatchQueue.main.async { self.showIfIdle(.fit, locked: false) }
            return
        }
        let box = edge.boundingBox
        if box.width * box.height < Self.minEdgeArea {
            steadyFrames = 0
            lastEdge = edge
            DispatchQueue.main.async { self.showIfIdle(.closer, locked: false) }
            return
        }
        if let last = lastEdge, Self.drift(last, edge) < Self.maxCornerDrift {
            steadyFrames += 1
        } else {
            steadyFrames = 0
        }
        lastEdge = edge
        if steadyFrames >= Self.steadyFramesNeeded {
            steadyFrames = 0
            DispatchQueue.main.async { self.capture() }
            return
        }
        DispatchQueue.main.async { self.showIfIdle(.holdStill, locked: true) }
    }

    /// While a capture is being read, the hint stays on "Got it".
    private func showIfIdle(_ hint: Hint, locked: Bool) {
        guard !capturing, !finished, Date() >= noticeUntil else { return }
        show(hint, locked: locked)
    }

    /// The largest distance any corner moved between two checks.
    static func drift(_ a: VNRectangleObservation, _ b: VNRectangleObservation) -> CGFloat {
        let pairs = [(a.topLeft, b.topLeft), (a.topRight, b.topRight), (a.bottomLeft, b.bottomLeft), (a.bottomRight, b.bottomRight)]
        return pairs.map { hypot($0.0.x - $0.1.x, $0.0.y - $0.1.y) }.max() ?? 1
    }
}

extension CardScannerViewController: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        frameCount += 1
        guard frameCount % 2 == 0, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let request = VNDetectRectanglesRequest()
        request.minimumAspectRatio = 0.45
        request.maximumAspectRatio = 0.9
        request.minimumSize = 0.2
        request.minimumConfidence = 0.6
        request.maximumObservations = 1
        request.quadratureTolerance = 20
        // The back camera's frames are landscape; .right reads them the way the phone is held.
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .right, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return
        }
        evaluate(request.results?.first)
    }
}

extension CardScannerViewController: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation(), let image = UIImage(data: data) else {
            DispatchQueue.main.async {
                self.capturing = false
                self.noticeUntil = Date().addingTimeInterval(Self.noticeSeconds)
                self.show(.noText, locked: false)
            }
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let read = CardTextReader.read(image: image)
            DispatchQueue.main.async {
                guard !read.lines.isEmpty else {
                    self.capturing = false
                    self.doneHaptic.notificationOccurred(.warning)
                    self.noticeUntil = Date().addingTimeInterval(Self.noticeSeconds)
                    self.show(.noText, locked: false)
                    return
                }
                if var front = self.front {
                    front.backLines = read.lines
                    self.doneHaptic.notificationOccurred(.success)
                    self.end(.captured(front))
                    return
                }
                if Self.needsBack(read) {
                    self.askForBack(read)
                    return
                }
                self.doneHaptic.notificationOccurred(.success)
                self.end(.captured(read))
            }
        }
    }
}
