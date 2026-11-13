import AVFoundation
import CoreImage
import PhotosUI
import UIKit

/// The card scanner: a full-screen live camera, like the iPhone camera. The
/// collector frames the card and taps the shutter; nothing is taken on its own.
/// Nothing is drawn over the live picture: no outline, no guide box. The photo button
/// next to the shutter reads a library photo the same way (CardTextReader, the
/// reader the plugin's `recognize` method uses). One hint at a time, 44pt tap
/// targets, and no flash or snap animation when Reduce Motion is on.
///
/// A raw card whose front shows no card number gets one more step: "Flip it
/// over for the card #", then a second tap (or a photo) for the back, or Skip.
/// Slabs never ask: the label carries the number.
///
/// While the collector frames the card, the live frames are scored for sharpness and glare
/// (FrameQuality). That only changes the hint ("Hold steady", "Tilt to cut glare") and keeps
/// the sharpest few frames so their text can vote with the photo. It never takes a picture.
///
/// A phone call, another app taking the camera, or a trip to the background pauses the camera.
/// It starts again when it can; when it won't, the scanner closes and the web side says the
/// read failed, with Scan a card right there to try again.
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
        case steady = "Hold steady"
        case glare = "Tilt to cut glare"
        case noText = "We couldn't read that one. Try again with the card flat and in good light."
    }

    /// Brand colors from CLAUDE.md: background #09090B, off-white #F4F4F5.
    static let background = UIColor(red: 9 / 255, green: 9 / 255, blue: 11 / 255, alpha: 1)
    static let offWhite = UIColor(red: 244 / 255, green: 244 / 255, blue: 245 / 255, alpha: 1)

    static let minTapTarget: CGFloat = 44
    static let shutterSize: CGFloat = 76
    static let sideButtonSize: CGFloat = 52

    private let finish: (Outcome) -> Void
    private var finished = false

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "app.slabhold.scanner.session")
    private let photoOutput = AVCapturePhotoOutput()
    private let frameOutput = AVCaptureVideoDataOutput()
    private let frameQueue = DispatchQueue(label: "app.slabhold.scanner.frames")
    private var device: AVCaptureDevice?

    /// What the live frames have shown lately. Touched only on `frameQueue`.
    private nonisolated let watch = FrameWatch()
    /// The frames whose text votes with the photo. Main thread only.
    private var voteFrames: [CGImage] = []
    private lazy var previewLayer = AVCaptureVideoPreviewLayer(session: session)

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

    /// True while iOS has the camera paused (a call, another app, the background). Main thread only.
    private var interrupted = false
    /// When the camera was last started again after an error. Main thread only.
    private var lastRestart = Date.distantPast
    /// A second error this soon after a restart means the camera won't come back.
    static let restartGap: TimeInterval = 3

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
        observeSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
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
                // A card is held close: keep the lens hunting near, not across the room.
                if device.isAutoFocusRangeRestrictionSupported { device.autoFocusRangeRestriction = .near }
                device.unlockForConfiguration()
            }
            if self.session.canAddOutput(self.photoOutput) { self.session.addOutput(self.photoOutput) }
            // Live frames, for the sharpness hint and the vote only. Late frames are dropped.
            self.frameOutput.alwaysDiscardsLateVideoFrames = true
            self.frameOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
            self.frameOutput.setSampleBufferDelegate(self, queue: self.frameQueue)
            if self.session.canAddOutput(self.frameOutput) {
                self.session.addOutput(self.frameOutput)
                if let connection = self.frameOutput.connection(with: .video) {
                    // Upright frames, so their text lines up with the photo's.
                    if #available(iOS 17.0, *) {
                        if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
                    } else if connection.isVideoOrientationSupported {
                        connection.videoOrientation = .portrait
                    }
                }
            }
            self.session.commitConfiguration()
            let hasTorch = device.hasTorch
            DispatchQueue.main.async { self.torchButton.isHidden = !hasTorch }
        }
    }

    private func setTorch(on: Bool) {
        guard let device, device.hasTorch, (try? device.lockForConfiguration()) != nil else { return }
        device.torchMode = on ? .on : .off
        device.unlockForConfiguration()
        DispatchQueue.main.async { self.showTorch(on: on) }
    }

    /// The flashlight button's picture and spoken value. Main thread only.
    private func showTorch(on: Bool) {
        let image = UIImage(systemName: on ? "bolt.fill" : "bolt.slash.fill")
        if torchButton.configuration != nil {
            torchButton.configuration?.image = image
        } else {
            torchButton.setImage(image, for: .normal)
        }
        torchButton.accessibilityValue = on ? "On" : "Off"
    }

    // MARK: Interruptions

    /// iOS posts these on any thread, so each handler hops to the main thread.
    private func observeSession() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(sessionRuntimeError(_:)), name: AVCaptureSession.runtimeErrorNotification, object: session)
        center.addObserver(self, selector: #selector(sessionWasInterrupted(_:)), name: AVCaptureSession.wasInterruptedNotification, object: session)
        center.addObserver(self, selector: #selector(sessionInterruptionEnded(_:)), name: AVCaptureSession.interruptionEndedNotification, object: session)
    }

    /// The camera hit an error (the media services reset, say).
    @objc private nonisolated func sessionRuntimeError(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in self?.recoverFromError() }
    }

    /// A phone call, another app using the camera, or the app going to the background.
    @objc private nonisolated func sessionWasInterrupted(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.interrupted = true
            // iOS turns the flashlight off with the camera.
            self.showTorch(on: false)
        }
    }

    @objc private nonisolated func sessionInterruptionEnded(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.interrupted = false
            self.restartSession()
        }
    }

    /// One fresh start per error. A second error right after a restart means it won't come back.
    private func recoverFromError() {
        guard !finished, viewIfLoaded?.window != nil else { return }
        showTorch(on: false)
        guard Date().timeIntervalSince(lastRestart) > Self.restartGap else {
            end(.failed("The camera stopped."))
            return
        }
        lastRestart = Date()
        restartSession()
    }

    /// Starts the camera again if it stopped. If it won't start, the scanner closes and the
    /// web side shows its read-failed message.
    private func restartSession() {
        guard !finished, !interrupted, viewIfLoaded?.window != nil else { return }
        sessionQueue.async { [weak self, session] in
            if !session.isRunning { session.startRunning() }
            let running = session.isRunning
            DispatchQueue.main.async {
                guard let self, !self.finished, !self.interrupted, !running else { return }
                self.end(.failed("The camera stopped."))
            }
        }
    }

    /// The camera is live and can take a photo. Asking a stopped camera for one crashes.
    private var cameraReady: Bool {
        !interrupted && session.isRunning && photoOutput.connection(with: .video)?.isActive == true
    }

    // MARK: Overlay

    private func setUpOverlay() {
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

        if #available(iOS 26.0, *) {
            var glass = UIButton.Configuration.glass()
            glass.title = "Skip"
            glass.baseForegroundColor = Self.offWhite
            glass.cornerStyle = .capsule
            skipButton.configuration = glass
        } else {
            skipButton.setTitle("Skip", for: .normal)
            skipButton.setTitleColor(Self.offWhite, for: .normal)
            skipButton.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        }
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

    /// A round, see-through control over the preview, at least 44pt. The system's glass on
    /// iOS 26 and up; the same dark circle as before below that.
    private func styleRound(_ button: UIButton, symbol: String, size: CGFloat) {
        let config = UIImage.SymbolConfiguration(pointSize: size >= Self.sideButtonSize ? 22 : 17, weight: .medium)
        if #available(iOS 26.0, *) {
            var glass = UIButton.Configuration.glass()
            glass.image = UIImage(systemName: symbol)
            glass.preferredSymbolConfigurationForImage = config
            glass.baseForegroundColor = Self.offWhite
            glass.cornerStyle = .capsule
            glass.contentInsets = .zero
            button.configuration = glass
        } else {
            button.setImage(UIImage(systemName: symbol, withConfiguration: config), for: .normal)
            button.tintColor = Self.offWhite
            button.backgroundColor = UIColor.black.withAlphaComponent(0.4)
            button.layer.cornerRadius = size / 2
        }
        button.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(button)
        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: size),
            button.heightAnchor.constraint(equalToConstant: size)
        ])
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

    /// The sharpest frames from the last moment, sharpest first, for the vote. From here
    /// until the read ends, no live frame is scored or kept.
    private func sharpestFrames() -> [CGImage] {
        frameQueue.sync { [watch] () -> [CGImage] in
            watch.reading = true
            return watch.takeSharpest(within: FrameWatch.steadyWindow)
        }
    }

    /// The read is over: live frames are scored again.
    private func resumeFrames() {
        frameQueue.async { [watch] in watch.reading = false }
    }

    /// The hint follows the live frames, only while the collector is framing the card.
    private func showQuality(soft: Bool, glare: Bool) {
        guard !capturing, !finished, Date() >= noticeUntil else { return }
        guard let current = currentHint, current == .frame || current == .flip || current == .steady || current == .glare else { return }
        if glare {
            show(.glare)
        } else if soft {
            show(.steady)
        } else {
            show(front == nil ? .frame : .flip)
        }
    }

    private func capture() {
        guard !capturing, !finished else { return }
        // Paused by a call or another app: say so with the read-failed hint and stay open.
        guard cameraReady else {
            couldNotRead()
            return
        }
        capturing = true
        voteFrames = sharpestFrames()
        captureHaptic.impactOccurred()
        doneHaptic.prepare()
        show(.reading)
        flash()
        photoOutput.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
    }

    /// A snapped frame or a library photo: read it on the phone, then finish or ask for the back.
    /// A snap also brings the sharpest recent frames, whose text votes with the photo's.
    private func handle(_ image: UIImage) {
        capturing = true
        show(.reading)
        let frames = voteFrames
        voteFrames = []
        DispatchQueue.global(qos: .userInitiated).async {
            let read = CardTextReader.read(image: image, frames: frames)
            DispatchQueue.main.async { self.finishRead(read) }
        }
    }

    private func finishRead(_ read: CardRead) {
        resumeFrames()
        guard !read.lines.isEmpty else {
            couldNotRead()
            return
        }
        if var front = self.front {
            front.backLines = read.lines
            front.backDetails = read.details
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
        resumeFrames()
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
        // A library photo has no live frames to vote with.
        voteFrames = []
        capturing = true
        frameQueue.async { [watch] in watch.reading = true }
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

extension CardScannerViewController: AVCaptureVideoDataOutputSampleBufferDelegate {
    /// Scores a live frame, on the frame queue. Sharp ones are kept for the vote; a run of soft
    /// or glaring ones changes the hint. The picture is still only taken when the collector taps.
    nonisolated func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer), let change = watch.score(buffer) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.showQuality(soft: change.soft, glare: change.glare)
        }
    }
}

/// The live frames' recent sharpness and glare, and the sharpest few frames, kept so their text
/// can vote with the photo. Every property and method is used only on the scanner's frame queue.
final class FrameWatch: @unchecked Sendable {
    /// A recent sharp frame.
    private struct SharpFrame {
        let image: CGImage
        let sharpness: Double
        let time: CFAbsoluteTime
    }

    /// Frames are scored about 8 times a second.
    static let scoreEvery: CFAbsoluteTime = 0.12
    /// Frames older than this don't vote: the card may have moved.
    static let steadyWindow: CFAbsoluteTime = 0.6
    /// This many soft (or glaring, or clear) scores in a row change the hint, so it doesn't flicker.
    static let hintRun = 3

    /// True from the tap until the read ends: no frame is scored or kept meanwhile.
    var reading = false
    private var sharpFrames: [SharpFrame] = []
    private var lastScored: CFAbsoluteTime = 0
    private var softRun = 0
    private var glareRun = 0
    private var clearRun = 0
    private let context = CIContext()

    /// The sharpest frames inside the window, sharpest first. The kept frames are dropped.
    func takeSharpest(within window: CFAbsoluteTime) -> [CGImage] {
        let now = CFAbsoluteTimeGetCurrent()
        let frames = sharpFrames
            .filter { now - $0.time <= window }
            .sorted { $0.sharpness > $1.sharpness }
            .prefix(2)
            .map { $0.image }
        sharpFrames = []
        softRun = 0
        glareRun = 0
        clearRun = 0
        return frames
    }

    /// Scores one frame. Returns the hint to show when a run of frames changes it, else nil.
    func score(_ buffer: CVPixelBuffer) -> (soft: Bool, glare: Bool)? {
        guard !reading else { return nil }
        let now = CFAbsoluteTimeGetCurrent()
        guard now - lastScored >= Self.scoreEvery else { return nil }
        lastScored = now
        guard let quality = FrameQuality.score(buffer) else { return nil }
        let soft = quality.sharpness < FrameQuality.sharpEnough
        let glare = quality.glare > FrameQuality.glareShare
        sharpFrames.removeAll { now - $0.time > Self.steadyWindow }
        if !soft {
            let weakest = sharpFrames.min { $0.sharpness < $1.sharpness }
            if sharpFrames.count < 3 || quality.sharpness > (weakest?.sharpness ?? 0) {
                let frame = CIImage(cvPixelBuffer: buffer)
                if let image = context.createCGImage(frame, from: frame.extent) {
                    if sharpFrames.count >= 3, let index = sharpFrames.indices.min(by: { sharpFrames[$0].sharpness < sharpFrames[$1].sharpness }) {
                        sharpFrames.remove(at: index)
                    }
                    sharpFrames.append(SharpFrame(image: image, sharpness: quality.sharpness, time: now))
                }
            }
        }
        softRun = soft ? softRun + 1 : 0
        glareRun = glare ? glareRun + 1 : 0
        clearRun = (soft || glare) ? 0 : clearRun + 1
        let showGlare = glareRun >= Self.hintRun
        let showSoft = softRun >= Self.hintRun
        guard showGlare || showSoft || clearRun == Self.hintRun else { return nil }
        return (showSoft, showGlare)
    }
}
