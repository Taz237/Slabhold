import AVFoundation
import PhotosUI
import UIKit
import Vision

/// The card scanner: a full-screen live camera, like the iPhone camera. The
/// collector frames the card and taps the shutter; nothing is taken on its own.
/// A thin line follows the card's edge when one is in view. The photo button
/// next to the shutter reads a library photo the same way (CardTextReader, the
/// reader the plugin's `recognize` method uses). One hint at a time, 44pt tap
/// targets, and no flash or snap animation when Reduce Motion is on.
///
/// A raw card whose front shows no card number gets one more step: "Flip it
/// over for the card #", then a second tap (or a photo) for the back, or Skip.
/// Slabs never ask: the label carries the number.
final class CardScannerViewController: UIViewController {
    enum Outcome {
        case cancelled
        case captured(CardRead)
        case failed(String)
    }

    enum Hint: String {
        case frame = "Frame the card, then tap to take it"
        case reading = "Reading the card"
        case flip = "Flip it over for the card #"
        case noText = "We couldn't read that one. Try again with the card flat and in good light."
    }

    /// Brand colors from CLAUDE.md: purple #7C3AED, background #09090B, off-white #F4F4F5.
    static let brandPurple = UIColor(red: 124 / 255, green: 58 / 255, blue: 237 / 255, alpha: 1)
    static let background = UIColor(red: 9 / 255, green: 9 / 255, blue: 11 / 255, alpha: 1)
    static let offWhite = UIColor(red: 244 / 255, green: 244 / 255, blue: 245 / 255, alpha: 1)

    static let minTapTarget: CGFloat = 44
    static let shutterSize: CGFloat = 76
    static let sideButtonSize: CGFloat = 52
    /// The line that follows the card's edge: thin, so the card stays the picture.
    static let edgeLineWidth: CGFloat = 2

    private let finish: (Outcome) -> Void
    private var finished = false

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "app.slabhold.scanner.session")
    private let videoQueue = DispatchQueue(label: "app.slabhold.scanner.video")
    private let videoOutput = AVCaptureVideoDataOutput()
    private let photoOutput = AVCapturePhotoOutput()
    private var device: AVCaptureDevice?
    private lazy var previewLayer = AVCaptureVideoPreviewLayer(session: session)

    private let edgeLayer = CAShapeLayer()
    private let hintLabel = UILabel()
    private let closeButton = UIButton(type: .system)
    private let torchButton = UIButton(type: .system)
    private let shutterButton = UIButton(type: .custom)
    private let libraryButton = UIButton(type: .system)
    private let skipButton = UIButton(type: .system)
    private let flashView = UIView()

    /// The front, kept while the camera waits for the back. Main thread only.
    private var front: CardRead?
    /// Main thread only.
    private var capturing = false
    private var currentHint: Hint?
    /// A notice ("We couldn't read that one") stays up this long.
    private var noticeUntil = Date.distantPast
    static let noticeSeconds: TimeInterval = 2.5
    /// Video queue only.
    private var frameCount = 0

    private let captureHaptic = UIImpactFeedbackGenerator(style: .light)
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
        // Edge to edge, filling the screen like the iPhone camera.
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        setUpOverlay()
        configureSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
        edgeLayer.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        show(front == nil ? .frame : .flip)
        captureHaptic.prepare()
        sessionQueue.async { [session] in
            if !session.isRunning { session.startRunning() }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        // The photo picker is a sheet over the camera; the camera keeps running under it.
        guard presentedViewController == nil else { return }
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
        edgeLayer.fillColor = UIColor.clear.cgColor
        edgeLayer.strokeColor = Self.brandPurple.cgColor
        edgeLayer.lineWidth = Self.edgeLineWidth
        edgeLayer.lineJoin = .round
        view.layer.addSublayer(edgeLayer)

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
        hintLabel.layer.shadowColor = UIColor.black.cgColor
        hintLabel.layer.shadowOpacity = 0.6
        hintLabel.layer.shadowRadius = 4
        hintLabel.layer.shadowOffset = .zero
        hintLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hintLabel)

        styleRound(closeButton, symbol: "xmark", size: Self.minTapTarget)
        closeButton.accessibilityLabel = "Close"
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)

        styleRound(torchButton, symbol: "bolt.slash.fill", size: Self.minTapTarget)
        torchButton.accessibilityLabel = "Flashlight"
        torchButton.accessibilityValue = "Off"
        torchButton.isHidden = true
        torchButton.addTarget(self, action: #selector(torchTapped), for: .touchUpInside)

        styleRound(libraryButton, symbol: "photo.on.rectangle", size: Self.sideButtonSize)
        libraryButton.accessibilityLabel = "Choose a photo"
        libraryButton.addTarget(self, action: #selector(libraryTapped), for: .touchUpInside)

        shutterButton.backgroundColor = Self.offWhite
        shutterButton.layer.cornerRadius = Self.shutterSize / 2
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
            closeButton.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 12),

            torchButton.topAnchor.constraint(equalTo: safe.topAnchor, constant: 8),
            torchButton.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -12),

            // Photo · shutter · Skip, in one row low on the screen, where a thumb reaches.
            shutterButton.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -20),
            shutterButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            shutterButton.widthAnchor.constraint(equalToConstant: Self.shutterSize),
            shutterButton.heightAnchor.constraint(equalToConstant: Self.shutterSize),

            libraryButton.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
            libraryButton.trailingAnchor.constraint(equalTo: shutterButton.leadingAnchor, constant: -40),

            skipButton.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
            skipButton.leadingAnchor.constraint(equalTo: shutterButton.trailingAnchor, constant: 40),
            skipButton.widthAnchor.constraint(greaterThanOrEqualToConstant: Self.minTapTarget),
            skipButton.heightAnchor.constraint(equalToConstant: Self.minTapTarget),

            hintLabel.bottomAnchor.constraint(equalTo: shutterButton.topAnchor, constant: -16),
            hintLabel.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 24),
            hintLabel.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -24)
        ])
    }

    /// A round, see-through control over the preview, at least 44pt.
    private func styleRound(_ button: UIButton, symbol: String, size: CGFloat) {
        let config = UIImage.SymbolConfiguration(pointSize: size >= Self.sideButtonSize ? 22 : 17, weight: .medium)
        button.setImage(UIImage(systemName: symbol, withConfiguration: config), for: .normal)
        button.tintColor = Self.offWhite
        button.backgroundColor = UIColor.black.withAlphaComponent(0.4)
        button.layer.cornerRadius = size / 2
        button.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(button)
        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: size),
            button.heightAnchor.constraint(equalToConstant: size)
        ])
    }

    /// A thin line on the card's edge while one is in view. It only shows the
    /// card is seen; it never takes the picture. No line when nothing is found.
    private func drawEdge(_ edge: VNRectangleObservation?) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        guard let edge, !capturing else {
            edgeLayer.path = nil
            return
        }
        // Vision read the frame turned upright (.right): normalized, origin bottom-left.
        // The preview converts from capture-device points: landscape, origin top-left.
        func point(_ p: CGPoint) -> CGPoint {
            previewLayer.layerPointConverted(fromCaptureDevicePoint: CGPoint(x: 1 - p.y, y: 1 - p.x))
        }
        let path = UIBezierPath()
        path.move(to: point(edge.topLeft))
        path.addLine(to: point(edge.topRight))
        path.addLine(to: point(edge.bottomRight))
        path.addLine(to: point(edge.bottomLeft))
        path.close()
        edgeLayer.path = path.cgPath
    }

    /// One hint at a time.
    private func show(_ hint: Hint) {
        guard hint != currentHint else { return }
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

    /// The only way a picture is taken from the camera: the collector taps.
    @objc private func shutterTapped() {
        capture()
    }

    @objc private func libraryTapped() {
        guard !capturing, !finished else { return }
        var config = PHPickerConfiguration()
        config.filter = .images
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        present(picker, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    /// Done without the back: the front's read goes through as it is.
    @objc private func skipTapped() {
        guard let front, !capturing else { return }
        end(.captured(front))
    }

    /// A raw card's front with no card number line: the back usually has it.
    static func needsBack(_ read: CardRead) -> Bool {
        if read.kind == "slab" { return false }
        return !read.lines.contains { line in
            line.range(of: #"(#|\bNO\.)\s*[A-Z0-9]"#, options: [.regularExpression, .caseInsensitive]) != nil
        }
    }

    /// The front is in; wait for the collector to flip it and tap again.
    private func askForBack(_ read: CardRead) {
        front = read
        capturing = false
        skipButton.isHidden = false
        doneHaptic.notificationOccurred(.success)
        show(.flip)
    }

    private func capture() {
        guard !capturing, !finished else { return }
        capturing = true
        captureHaptic.impactOccurred()
        doneHaptic.prepare()
        drawEdge(nil)
        show(.reading)
        flash()
        photoOutput.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
    }

    /// A snapped frame or a library photo: read it on the phone, then finish or ask for the back.
    private func handle(_ image: UIImage) {
        capturing = true
        show(.reading)
        DispatchQueue.global(qos: .userInitiated).async {
            let read = CardTextReader.read(image: image)
            DispatchQueue.main.async { self.finishRead(read) }
        }
    }

    private func finishRead(_ read: CardRead) {
        guard !read.lines.isEmpty else {
            couldNotRead()
            return
        }
        if var front = self.front {
            front.backLines = read.lines
            doneHaptic.notificationOccurred(.success)
            end(.captured(front))
            return
        }
        if Self.needsBack(read) {
            askForBack(read)
            return
        }
        doneHaptic.notificationOccurred(.success)
        end(.captured(read))
    }

    private func couldNotRead() {
        capturing = false
        doneHaptic.notificationOccurred(.warning)
        noticeUntil = Date().addingTimeInterval(Self.noticeSeconds)
        show(.noText)
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.noticeSeconds) { [weak self] in
            guard let self, !self.capturing, !self.finished, Date() >= self.noticeUntil else { return }
            self.show(self.front == nil ? .frame : .flip)
        }
    }

    private func end(_ outcome: Outcome) {
        guard !finished else { return }
        finished = true
        dismiss(animated: !UIAccessibility.isReduceMotionEnabled) { [finish] in
            finish(outcome)
        }
    }
}

extension CardScannerViewController: AVCaptureVideoDataOutputSampleBufferDelegate {
    /// Finds the card's edge for the line on screen. It never triggers a capture.
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        frameCount += 1
        guard frameCount % 3 == 0, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let request = VNDetectRectanglesRequest()
        request.minimumAspectRatio = 0.45
        request.maximumAspectRatio = 0.9
        request.minimumSize = 0.2
        request.minimumConfidence = 0.7
        request.maximumObservations = 1
        request.quadratureTolerance = 20
        // The back camera's frames are landscape; .right reads them the way the phone is held.
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .right, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return
        }
        let edge = request.results?.first
        DispatchQueue.main.async { self.drawEdge(edge) }
    }
}

extension CardScannerViewController: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation(), let image = UIImage(data: data) else {
            DispatchQueue.main.async { self.couldNotRead() }
            return
        }
        DispatchQueue.main.async { self.handle(image) }
    }
}

extension CardScannerViewController: PHPickerViewControllerDelegate {
    /// A library photo goes through the same reader and the same flip step as a snap.
    /// The system picker needs no photo library permission.
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: !UIAccessibility.isReduceMotionEnabled)
        guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else { return }
        capturing = true
        show(.reading)
        provider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                guard let image = object as? UIImage else {
                    self.couldNotRead()
                    return
                }
                self.handle(image)
            }
        }
    }
}
