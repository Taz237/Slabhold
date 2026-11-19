import AVFoundation
import CoreImage
import PhotosUI
import UIKit

/// The card scanner: a full-screen live camera, like the iPhone camera. Purple corner guides
/// show where the card goes; the collector lines it up and taps the shutter. Nothing is ever
/// taken on its own. The photo button next to the shutter reads a library photo the same way
/// (CardTextReader, the reader the plugin's `recognize` method uses). One hint at a time, 44pt
/// tap targets, a light tap of haptics on the shutter, and no flash or snap animation when
/// Reduce Motion is on.
///
/// Right after the shutter the photo holds on screen and the card is cropped flat in front of
/// the collector (CropRevealView), while the read runs. It never adds a wait of its own.
///
/// Front, then back: after the front of a raw card, "Now flip it over", then a second tap (or a
/// photo) for the back, or Skip. The back's photo comes back too, for the reveal on the web side.
/// Slabs never ask: the label carries everything.
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
        case frame = "Line the card up in the box, then tap"
        case reading = "Reading the card"
        case flip = "Now flip it over"
        case steady = "Hold steady"
        case glare = "Tilt to cut glare"
        case noText = "We couldn't read that one. Try again with the card flat and in good light."
    }

    /// Brand colors from CLAUDE.md: background #09090B, off-white #F4F4F5, purple #7C3AED.
    static let background = UIColor(red: 9 / 255, green: 9 / 255, blue: 11 / 255, alpha: 1)
    static let offWhite = UIColor(red: 244 / 255, green: 244 / 255, blue: 245 / 255, alpha: 1)
    static let purple = UIColor(red: 124 / 255, green: 58 / 255, blue: 237 / 255, alpha: 1)
    /// The guide box: a card's shape (2.5 x 3.5 in), this share of the screen's width.
    static let guideWidthShare: CGFloat = 0.78
    static let guideAspect: CGFloat = 3.5 / 2.5

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
    private let guides = CardGuideView()

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
    /// One firm tap when the cropped card lands flat.
    private let lockHaptic = UIImpactFeedbackGenerator(style: .rigid)

    /// The photo held on screen while it is read, with the card cropped flat. Main thread only.
    private var reveal: CropRevealView?
    /// True once the crop animation is over (or was never shown). Main thread only.
    private var revealDone = true
    /// A read that came back while the crop animation was still playing. Main thread only.
    private var waitingRead: CardRead?
    /// Counts the shots, so a late callback from an earlier one is ignored. Main thread only.
    private var revealShot = 0
    /// The card moves from where it sat in the photo to flat and centered in this long.
    static let cropSeconds: TimeInterval = 0.45
    /// The back's crop is shorter.
    static let backCropSeconds: TimeInterval = 0.3
    /// A read that is already in waits for the animation no longer than this.
    static let revealWaitSeconds: TimeInterval = 0.5

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
        guides.translatesAutoresizingMaskIntoConstraints = false
        guides.isUserInteractionEnabled = false
        guides.isAccessibilityElement = false
        view.addSubview(guides)

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
        // As wide as the share allows; the limits below win on a short screen.
        let guideWidth = guides.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: Self.guideWidthShare)
        guideWidth.priority = .defaultHigh
        guideWidth.isActive = true
        NSLayoutConstraint.activate([
            flashView.topAnchor.constraint(equalTo: view.topAnchor),
            flashView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            flashView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            flashView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            // The card's shape, centered a little above the middle, clear of the hint and shutter.
            guides.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            guides.centerYAnchor.constraint(equalTo: safe.centerYAnchor, constant: -36),
            guides.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: Self.guideWidthShare),
            guides.heightAnchor.constraint(equalTo: guides.widthAnchor, multiplier: Self.guideAspect),
            // On a short screen the box shrinks to stay clear of the top buttons and the hint.
            guides.topAnchor.constraint(greaterThanOrEqualTo: closeButton.bottomAnchor, constant: 12),
            guides.bottomAnchor.constraint(lessThanOrEqualTo: hintLabel.topAnchor, constant: -16),

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
        guard var front, !capturing else { return }
        front.backAsked = true
        end(.captured(front))
    }

    /// Front, then back, on every raw card: the back prints the card #, the set and the year.
    /// A slab's label carries them, so a slab never asks.
    static func needsBack(_ read: CardRead) -> Bool {
        read.kind != "slab"
    }

    /// The front is in; wait for the collector to flip it and tap again.
    private func askForBack(_ read: CardRead) {
        front = read
        capturing = false
        skipButton.isHidden = false
        clearReveal()
        doneHaptic.notificationOccurred(.success)
        guides.flipped()
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
        guides.taken()
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
        // The sideways serial pass is for a card's front only.
        let isFront = front == nil
        // The crop animation plays beside the read, never before it.
        beginReveal(of: image, seconds: isFront ? Self.cropSeconds : Self.backCropSeconds)
        DispatchQueue.global(qos: .userInitiated).async {
            let read = CardTextReader.read(image: image, frames: frames, edges: isFront)
            DispatchQueue.main.async { self.readArrived(read) }
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
            front.backImage = read.image
            front.backAsked = true
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
        clearReveal()
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
        // A card on screen cross-fades into the web's reveal instead of sliding away.
        var crossFade = false
        if case .captured = outcome, reveal != nil {
            crossFade = true
            modalTransitionStyle = .crossDissolve
        }
        dismiss(animated: crossFade || !UIAccessibility.isReduceMotionEnabled) { [finish] in
            finish(outcome)
        }
    }

    // MARK: Crop reveal

    /// Holds the photo on screen and crops the card flat, off the main thread first: the
    /// small upright copy and the card's corners are found beside the read.
    private func beginReveal(of image: UIImage, seconds: TimeInterval) {
        revealShot += 1
        let shot = revealShot
        revealDone = false
        waitingRead = nil
        lockHaptic.prepare()
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let preview = CardTextReader.cropPreview(of: image)
            DispatchQueue.main.async {
                guard let self, shot == self.revealShot, !self.finished, !self.revealDone else { return }
                guard let preview else {
                    self.revealEnded(shot)
                    return
                }
                self.playReveal(preview, seconds: seconds, shot: shot)
            }
        }
    }

    private func playReveal(_ preview: CardCropPreview, seconds: TimeInterval, shot: Int) {
        reveal?.removeFromSuperview()
        let cover = CropRevealView(still: preview.still)
        cover.frame = view.bounds
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        // Over the live preview and the guides, under the hint and the buttons.
        view.insertSubview(cover, aboveSubview: guides)
        reveal = cover
        let found = preview.corners != nil && preview.flat != nil
        cover.play(
            corners: preview.corners,
            flat: preview.flat,
            cardBox: guides.frame,
            seconds: seconds,
            reduceMotion: UIAccessibility.isReduceMotionEnabled,
            lock: { [weak self] in
                guard let self, shot == self.revealShot, self.reveal != nil, !self.finished else { return }
                // Flat and centered: one firm tap. No card edge: a light one, as the shutter's.
                if found {
                    self.lockHaptic.impactOccurred()
                } else {
                    self.captureHaptic.impactOccurred()
                }
            },
            done: { [weak self] in
                self?.revealEnded(shot)
            }
        )
    }

    /// The read is in. It goes on at once when the animation is over; otherwise it waits for
    /// the animation, and never longer than revealWaitSeconds.
    private func readArrived(_ read: CardRead) {
        if revealDone {
            finishRead(read)
            return
        }
        waitingRead = read
        let shot = revealShot
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.revealWaitSeconds) { [weak self] in
            self?.revealEnded(shot)
        }
    }

    /// The animation is over (or its time is up): a read that was waiting goes on. Once per shot.
    private func revealEnded(_ shot: Int) {
        guard shot == revealShot, !revealDone else { return }
        revealDone = true
        guard let read = waitingRead else { return }
        waitingRead = nil
        finishRead(read)
    }

    /// Back to the live camera: for the back's turn, or after a photo that couldn't be read.
    private func clearReveal() {
        guard let cover = reveal else { return }
        reveal = nil
        guard !UIAccessibility.isReduceMotionEnabled else {
            cover.removeFromSuperview()
            return
        }
        UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseOut], animations: {
            cover.alpha = 0
        }, completion: { _ in
            cover.removeFromSuperview()
        })
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

/// Four purple corner brackets in a card's shape: where the card goes. Drawn only, never a
/// trigger: the picture is taken when the collector taps. A tap brightens them for a moment, and
/// the flip to the back gives them one small turn; neither moves with Reduce Motion on.
final class CardGuideView: UIView {
    private let corners = CAShapeLayer()
    /// Corner arm length and line width, in points.
    static let arm: CGFloat = 28
    static let lineWidth: CGFloat = 4
    static let restingAlpha: Float = 0.85

    override init(frame: CGRect) {
        super.init(frame: frame)
        corners.strokeColor = CardScannerViewController.purple.cgColor
        corners.fillColor = UIColor.clear.cgColor
        corners.lineWidth = Self.lineWidth
        corners.lineCap = .round
        corners.lineJoin = .round
        corners.opacity = Self.restingAlpha
        // A soft dark edge so the purple reads on a light table too.
        corners.shadowColor = UIColor.black.cgColor
        corners.shadowOpacity = 0.35
        corners.shadowRadius = 3
        corners.shadowOffset = .zero
        layer.addSublayer(corners)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        corners.frame = bounds
        let inset = Self.lineWidth / 2
        let box = bounds.insetBy(dx: inset, dy: inset)
        let arm = min(Self.arm, box.width / 3)
        let radius: CGFloat = 12
        let path = UIBezierPath()
        // Top left, top right, bottom right, bottom left: each a short L with a rounded corner.
        path.move(to: CGPoint(x: box.minX, y: box.minY + arm))
        path.addLine(to: CGPoint(x: box.minX, y: box.minY + radius))
        path.addQuadCurve(to: CGPoint(x: box.minX + radius, y: box.minY), controlPoint: CGPoint(x: box.minX, y: box.minY))
        path.addLine(to: CGPoint(x: box.minX + arm, y: box.minY))
        path.move(to: CGPoint(x: box.maxX - arm, y: box.minY))
        path.addLine(to: CGPoint(x: box.maxX - radius, y: box.minY))
        path.addQuadCurve(to: CGPoint(x: box.maxX, y: box.minY + radius), controlPoint: CGPoint(x: box.maxX, y: box.minY))
        path.addLine(to: CGPoint(x: box.maxX, y: box.minY + arm))
        path.move(to: CGPoint(x: box.maxX, y: box.maxY - arm))
        path.addLine(to: CGPoint(x: box.maxX, y: box.maxY - radius))
        path.addQuadCurve(to: CGPoint(x: box.maxX - radius, y: box.maxY), controlPoint: CGPoint(x: box.maxX, y: box.maxY))
        path.addLine(to: CGPoint(x: box.maxX - arm, y: box.maxY))
        path.move(to: CGPoint(x: box.minX + arm, y: box.maxY))
        path.addLine(to: CGPoint(x: box.minX + radius, y: box.maxY))
        path.addQuadCurve(to: CGPoint(x: box.minX, y: box.maxY - radius), controlPoint: CGPoint(x: box.minX, y: box.maxY))
        path.addLine(to: CGPoint(x: box.minX, y: box.maxY - arm))
        corners.path = path.cgPath
    }

    /// The shutter was tapped: full strength for a beat, then back to resting.
    func taken() {
        corners.opacity = 1
        guard !UIAccessibility.isReduceMotionEnabled else {
            corners.opacity = Self.restingAlpha
            return
        }
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 1
        fade.toValue = Self.restingAlpha
        fade.duration = 0.35
        fade.timingFunction = CAMediaTimingFunction(name: .easeOut)
        corners.opacity = Self.restingAlpha
        corners.add(fade, forKey: "taken")
    }

    /// The front is in: one quick turn about the vertical axis, so "flip it over" reads at a glance.
    func flipped() {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        var turn = CATransform3DIdentity
        turn.m34 = -1 / 600
        let spin = CABasicAnimation(keyPath: "transform")
        spin.fromValue = CATransform3DRotate(turn, .pi, 0, 1, 0)
        spin.toValue = CATransform3DRotate(turn, 0, 0, 1, 0)
        spin.duration = 0.45
        spin.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.7, 0.2, 1)
        layer.add(spin, forKey: "flipped")
    }
}

/// The photo held full screen right after the shutter, and the card cropped out of it: the
/// rest dims, the card's four corners move from where they sat in the photo to a flat, centered
/// card with rounded corners and a soft shadow, then one white glare crosses it. Drawn only: it
/// reads nothing and takes nothing. With no card edge the photo simply scales in; with Reduce
/// Motion on, everything fades in at once and nothing moves.
final class CropRevealView: UIView {
    /// How dark the photo around the card gets.
    static let shade: CGFloat = 0.85
    /// A real card's corner: this share of its width.
    static let cornerShare: CGFloat = 0.035
    static let glareSeconds: TimeInterval = 0.35
    static let quickSeconds: TimeInterval = 0.2
    /// The crop is drawn as this many small moves, so each corner travels a straight line.
    static let steps = 18

    private let stillView = UIImageView()
    private let shadeView = UIView()
    private let cardHolder = UIView()
    private let cardView = UIImageView()
    private let glare = CAGradientLayer()

    init(still: CGImage) {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        clipsToBounds = true
        backgroundColor = .clear

        stillView.image = UIImage(cgImage: still)
        // The same fill as the live preview, so the photo sits where the preview was.
        stillView.contentMode = .scaleAspectFill
        stillView.clipsToBounds = true
        addSubview(stillView)

        shadeView.backgroundColor = .black
        shadeView.alpha = 0
        addSubview(shadeView)

        cardHolder.isHidden = true
        cardHolder.layer.shadowColor = UIColor.black.cgColor
        cardHolder.layer.shadowOpacity = 0
        cardHolder.layer.shadowRadius = 18
        cardHolder.layer.shadowOffset = CGSize(width: 0, height: 10)
        addSubview(cardHolder)

        cardView.contentMode = .scaleToFill
        cardView.clipsToBounds = true
        cardHolder.addSubview(cardView)

        // A soft white band, tilted, parked off the card until the card is flat.
        let clear = UIColor.white.withAlphaComponent(0).cgColor
        glare.colors = [clear, UIColor.white.withAlphaComponent(0.55).cgColor, clear]
        glare.startPoint = CGPoint(x: 0, y: 0.35)
        glare.endPoint = CGPoint(x: 1, y: 0.65)
        glare.locations = [-0.5, -0.25, 0.0]
        cardView.layer.addSublayer(glare)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Bounds and center, not frame: the photo may be mid scale-in.
        stillView.bounds = bounds
        stillView.center = CGPoint(x: bounds.midX, y: bounds.midY)
        shadeView.frame = bounds
    }

    /// `size` scaled to cover `box`, centered: where an aspect-fill picture sits.
    static func filling(_ size: CGSize, in box: CGRect) -> CGRect {
        guard size.width > 0, size.height > 0 else { return box }
        let scale = max(box.width / size.width, box.height / size.height)
        let width = size.width * scale, height = size.height * scale
        return CGRect(x: box.midX - width / 2, y: box.midY - height / 2, width: width, height: height)
    }

    /// `size` scaled to sit inside `box`, centered.
    static func fitting(_ size: CGSize, in box: CGRect) -> CGRect {
        guard size.width > 0, size.height > 0 else { return box }
        let scale = min(box.width / size.width, box.height / size.height)
        let width = size.width * scale, height = size.height * scale
        return CGRect(x: box.midX - width / 2, y: box.midY - height / 2, width: width, height: height)
    }

    /// The transform that puts a layer of this size (anchored at its top left corner) onto the
    /// four points: top left, top right, bottom right, bottom left, measured from the layer's own
    /// resting top left corner. The unit square to a quadrilateral, as a projective map.
    static func homography(width: CGFloat, height: CGFloat, onto quad: [CGPoint]) -> CATransform3D {
        guard quad.count == 4, width > 0, height > 0 else { return CATransform3DIdentity }
        let x0 = quad[0].x, y0 = quad[0].y
        let x1 = quad[1].x, y1 = quad[1].y
        let x2 = quad[2].x, y2 = quad[2].y
        let x3 = quad[3].x, y3 = quad[3].y
        let dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
        let dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
        let bottom = dx1 * dy2 - dx2 * dy1
        guard abs(bottom) > 0.000001 else { return CATransform3DIdentity }
        let g = (dx3 * dy2 - dx2 * dy3) / bottom
        let h = (dx1 * dy3 - dx3 * dy1) / bottom
        let a = x1 - x0 + g * x1
        let b = x3 - x0 + h * x3
        let d = y1 - y0 + g * y1
        let e = y3 - y0 + h * y3
        var out = CATransform3DIdentity
        out.m11 = a / width
        out.m12 = d / width
        out.m14 = g / width
        out.m21 = b / height
        out.m22 = e / height
        out.m24 = h / height
        out.m41 = x0
        out.m42 = y0
        return out
    }

    /// Plays once. `corners` are 0...1 of the photo (origin top left) and `flat` is the card
    /// straightened; with either missing the photo only scales in. `cardBox` is where the flat
    /// card lands. `lock` runs when the card is flat (or the photo is in), `done` when it's all over.
    func play(corners: [CGPoint]?, flat: CGImage?, cardBox: CGRect, seconds: TimeInterval, reduceMotion: Bool, lock: @escaping () -> Void, done: @escaping () -> Void) {
        layoutIfNeeded()
        guard let corners, corners.count == 4, let flat, let still = stillView.image else {
            // No card edge: the whole photo comes in, and that's all.
            alpha = 0
            if !reduceMotion { stillView.transform = CGAffineTransform(scaleX: 1.05, y: 1.05) }
            UIView.animate(withDuration: Self.quickSeconds, delay: 0, options: [.curveEaseOut], animations: {
                self.alpha = 1
                self.stillView.transform = .identity
            }, completion: { _ in
                lock()
                done()
            })
            return
        }

        // Where the card sits in the photo on screen, and where it lands.
        let photo = Self.filling(still.size, in: bounds)
        let start = corners.map { CGPoint(x: photo.minX + $0.x * photo.width, y: photo.minY + $0.y * photo.height) }
        let target = Self.fitting(CGSize(width: flat.width, height: flat.height), in: cardBox).integral
        let radius = target.width * Self.cornerShare

        cardView.image = UIImage(cgImage: flat)
        cardHolder.layer.anchorPoint = .zero
        cardHolder.layer.bounds = CGRect(origin: .zero, size: target.size)
        cardHolder.layer.position = target.origin
        cardView.frame = cardHolder.bounds
        glare.frame = cardView.bounds
        cardView.layer.cornerRadius = radius
        cardHolder.layer.shadowPath = UIBezierPath(roundedRect: cardHolder.bounds, cornerRadius: radius).cgPath
        cardHolder.layer.shadowOpacity = 0.45
        cardHolder.isHidden = false

        guard !reduceMotion else {
            // Nothing moves: the photo, the shade and the flat card fade in together.
            alpha = 0
            shadeView.alpha = Self.shade
            UIView.animate(withDuration: Self.quickSeconds, delay: 0, options: [.curveEaseOut], animations: {
                self.alpha = 1
            }, completion: { _ in
                lock()
                done()
            })
            return
        }

        // Each corner eases out along a straight line from the photo to the flat card. No bounce.
        let rest = [CGPoint(x: 0, y: 0), CGPoint(x: target.width, y: 0), CGPoint(x: target.width, y: target.height), CGPoint(x: 0, y: target.height)]
        let from = start.map { CGPoint(x: $0.x - target.minX, y: $0.y - target.minY) }
        var values: [NSValue] = []
        for step in 0...Self.steps {
            let time = CGFloat(step) / CGFloat(Self.steps)
            let eased = 1 - pow(1 - time, 3)
            var quad: [CGPoint] = []
            for index in 0..<4 {
                quad.append(CGPoint(x: from[index].x + (rest[index].x - from[index].x) * eased, y: from[index].y + (rest[index].y - from[index].y) * eased))
            }
            values.append(NSValue(caTransform3D: Self.homography(width: target.width, height: target.height, onto: quad)))
        }

        CATransaction.begin()
        CATransaction.setCompletionBlock { [weak self] in
            lock()
            if let self {
                self.sweep(done: done)
            } else {
                done()
            }
        }
        let morph = CAKeyframeAnimation(keyPath: "transform")
        morph.values = values
        morph.duration = seconds
        morph.calculationMode = .linear
        cardHolder.layer.add(morph, forKey: "crop")

        let rounding = CABasicAnimation(keyPath: "cornerRadius")
        rounding.fromValue = 0
        rounding.toValue = radius
        rounding.duration = seconds
        rounding.timingFunction = CAMediaTimingFunction(name: .easeOut)
        cardView.layer.add(rounding, forKey: "round")

        let lift = CABasicAnimation(keyPath: "shadowOpacity")
        lift.fromValue = 0
        lift.toValue = 0.45
        lift.duration = seconds
        lift.timingFunction = CAMediaTimingFunction(name: .easeOut)
        cardHolder.layer.add(lift, forKey: "lift")
        CATransaction.commit()

        UIView.animate(withDuration: seconds * 0.7, delay: 0, options: [.curveEaseOut]) {
            self.shadeView.alpha = Self.shade
        }
    }

    /// One white glare across the flat card: it reads as taken.
    private func sweep(done: @escaping () -> Void) {
        CATransaction.begin()
        CATransaction.setCompletionBlock(done)
        let pass = CABasicAnimation(keyPath: "locations")
        pass.fromValue = [-0.5, -0.25, 0.0]
        pass.toValue = [1.0, 1.25, 1.5]
        pass.duration = Self.glareSeconds
        pass.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        glare.add(pass, forKey: "glare")
        CATransaction.commit()
    }
}
