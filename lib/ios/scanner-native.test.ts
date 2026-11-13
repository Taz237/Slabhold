import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SCANNER_PLUGIN, scanCaptureFrom } from "./scanner";

/**
 * There is no Swift toolchain in CI, so these read the Swift source and keep
 * it in step with the web side (lib/ios/scanner.ts, lib/ios/native.ts).
 * Xcode builds it; this keeps the contract honest between builds.
 */

const root = process.cwd();
const APP = "ios-app/ios/App/App";
const SWIFT = ["SlabholdScannerPlugin.swift", "CardScannerViewController.swift", "CardTextReader.swift"];

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const plugin = read(`${APP}/SlabholdScannerPlugin.swift`);
const camera = read(`${APP}/CardScannerViewController.swift`);
const reader = read(`${APP}/CardTextReader.swift`);

describe("native scanner: project", () => {
  const pbx = read("ios-app/ios/App/App.xcodeproj/project.pbxproj");

  for (const file of SWIFT) {
    it(`builds ${file} in the App target`, () => {
      assert.ok(existsSync(join(root, APP, file)));
      const escaped = file.replace(".", "\\.");
      const ref = pbx.match(new RegExp(`(\\w+) /\\* ${escaped} \\*/ = \\{isa = PBXFileReference; lastKnownFileType = sourcecode\\.swift; path = ${escaped}; sourceTree = "<group>"; \\};`));
      assert.ok(ref, "file reference");
      assert.match(pbx, new RegExp(`/\\* ${escaped} in Sources \\*/ = \\{isa = PBXBuildFile; fileRef = ${ref[1]} `));
      const phase = pbx.slice(pbx.indexOf("/* Begin PBXSourcesBuildPhase section */"), pbx.indexOf("/* End PBXSourcesBuildPhase section */"));
      assert.match(phase, new RegExp(`${escaped} in Sources`));
      const group = pbx.slice(pbx.indexOf("504EC3061FED79650016851F /* App */ = {"));
      assert.match(group.slice(0, group.indexOf("};")), new RegExp(`${ref[1]} /\\* ${escaped} \\*/`));
    });
  }

  it("registers the scanner next to our other plugin", () => {
    const bridge = read(`${APP}/SlabholdBridgeViewController.swift`);
    assert.match(bridge, /bridge\?\.registerPluginInstance\(SlabholdNativePlugin\(\)\)\s*bridge\?\.registerPluginInstance\(SlabholdScannerPlugin\(\)\)/);
  });

  it("explains the camera in plain words, and that cards are read on the phone", () => {
    const plist = read(`${APP}/Info.plist`);
    assert.match(plist, /<key>NSCameraUsageDescription<\/key>\s*<string>[^<]*identify[^<]*read on your phone\.<\/string>/);
  });
});

describe("native scanner: the contract with the web side", () => {
  it("answers to the name the web asks for, with the methods it calls", () => {
    assert.match(plugin, new RegExp(`jsName = "${SCANNER_PLUGIN}"`));
    assert.match(plugin, /class SlabholdScannerPlugin: CAPPlugin, CAPBridgedPlugin/);
    const native = read("lib/ios/native.ts");
    for (const method of ["scanCard", "recognize"]) {
      assert.match(plugin, new RegExp(`CAPPluginMethod\\(name: "${method}", returnType: CAPPluginReturnPromise\\)`));
      assert.match(plugin, new RegExp(`@objc func ${method}\\(_ call: CAPPluginCall\\)`));
      assert.match(native, new RegExp(`SlabholdScanner\\.${method}\\(`));
    }
  });

  it("returns the keys lib/ios/scanner.ts reads, and a JPEG data URL it accepts", () => {
    for (const key of ["lines", "backLines", "kind", "image"]) assert.match(reader, new RegExp(`"${key}"`));
    assert.match(plugin, /call\.resolve\(\["cancelled": true\]\)/);
    assert.match(plugin, /call\.resolve\(\["cancelled": true, "denied": true\]\)/);
    assert.match(reader, /"data:image\/jpeg;base64,\\\(data\.base64EncodedString\(\)\)"/);
    const sample = scanCaptureFrom({ lines: ["LUKA DONCIC"], image: "data:image/jpeg;base64,QUJD", kind: "card" });
    assert.equal(sample?.image, "data:image/jpeg;base64,QUJD");
    assert.equal(scanCaptureFrom({ cancelled: true, denied: true }), null);
  });

  it("caps lines the same as the web side", () => {
    const web = read("lib/ios/scanner.ts");
    assert.equal(reader.match(/static let maxLines = (\d+)/)?.[1], web.match(/const MAX_LINES = (\d+)/)?.[1]);
    assert.equal(reader.match(/static let maxLineLength = (\d+)/)?.[1], web.match(/const MAX_LINE_LENGTH = (\d+)/)?.[1]);
  });

  it("calls slab vs card from the shape the slab label reader expects", () => {
    assert.match(reader, /static let slabAspectBelow: Float = 0\.65/);
    assert.match(reader, /\? "slab" : "card"/);
  });
});

describe("native scanner: on the phone, private", () => {
  it("reads with Apple Vision and makes no network calls", () => {
    for (const source of [plugin, camera, reader]) {
      assert.doesNotMatch(source, /URLSession|URLRequest|https?:\/\//);
    }
    assert.match(reader, /VNRecognizeTextRequest/);
    assert.match(reader, /recognitionLevel = \.accurate/);
    assert.match(reader, /usesLanguageCorrection = false/);
    assert.match(reader, /CIPerspectiveCorrection/);
  });
});

describe("native scanner: the camera screen", () => {
  it("uses the brand background, never teal", () => {
    assert.match(camera, /background = UIColor\(red: 9 \/ 255, green: 9 \/ 255, blue: 11 \/ 255, alpha: 1\)/);
    assert.doesNotMatch(camera, /teal|systemTeal/i);
  });

  it("fills the screen with the live camera, with nothing drawn over it: no outline, no guide box", () => {
    assert.match(camera, /previewLayer\.videoGravity = \.resizeAspectFill/);
    assert.match(camera, /previewLayer\.frame = view\.bounds/);
    assert.doesNotMatch(camera, /dimLayer|guideRect|guideLayer/);
    // The purple card-finder outline is gone, and nothing replaces it.
    assert.doesNotMatch(camera, /edgeLayer|drawEdge|edgeLineWidth|layerPointConverted|CAShapeLayer|strokeColor|brandPurple/);
    // No live card detection on the viewfinder at all. Live frames are only scored for sharpness
    // and glare (FrameQuality, in the reader file): no Vision in the camera, and nothing drawn.
    assert.doesNotMatch(camera, /VNDetectRectanglesRequest|import Vision|VNRecognizeTextRequest|VNImageRequestHandler/);
    assert.match(camera, /FrameQuality\.score\(buffer\)/);
  });

  it("drops the Card or Slab switch: the reader tells a slab from a card by its shape", () => {
    assert.doesNotMatch(camera, /UISegmentedControl|modeControl|"Card or slab"/);
    assert.match(reader, /\? "slab" : "card"/);
  });

  it("keeps every control at 44pt or more, with accessible names", () => {
    assert.match(camera, /static let minTapTarget: CGFloat = 44/);
    assert.match(camera, /static let shutterSize: CGFloat = 76/);
    assert.match(camera, /static let sideButtonSize: CGFloat = 52/);
    assert.match(camera, /styleRound\(closeButton, symbol: "xmark", size: Self\.minTapTarget\)/);
    assert.match(camera, /styleRound\(torchButton, symbol: "bolt\.slash\.fill", size: Self\.minTapTarget\)/);
    assert.match(camera, /styleRound\(libraryButton, symbol: "photo\.on\.rectangle", size: Self\.sideButtonSize\)/);
    assert.match(camera, /button\.widthAnchor\.constraint\(equalToConstant: size\)/);
    assert.match(camera, /shutterButton\.widthAnchor\.constraint\(equalToConstant: Self\.shutterSize\)/);
    for (const label of ["Close", "Flashlight", "Take photo", "Choose a photo", "Skip the back"]) {
      assert.match(camera, new RegExp(`accessibilityLabel = "${label}"`));
    }
  });

  it("respects Reduce Motion for the flash, the picker and the dismiss", () => {
    assert.ok((camera.match(/UIAccessibility\.isReduceMotionEnabled/g) ?? []).length >= 4);
    assert.match(camera, /guard !UIAccessibility\.isReduceMotionEnabled else \{ return \}/);
  });

  it("waits for the collector to tap: no auto-capture, and a haptic on the tap", () => {
    assert.doesNotMatch(camera, /steadyFrames|maxCornerDrift|needsClearFrame|flipClearSeconds|Hold still|Got it/);
    // capture() is called from the shutter and nowhere else.
    assert.equal([...camera.matchAll(/(?<!func )\bcapture\(\)/g)].length, 1);
    assert.match(camera, /@objc private func shutterTapped\(\) \{\s*capture\(\)/);
    assert.match(camera, /captureHaptic\.impactOccurred\(\)/);
  });

  it("reads a library photo from the camera screen with the same reader as a snap", () => {
    assert.match(camera, /import PhotosUI/);
    assert.match(camera, /libraryButton\.trailingAnchor\.constraint\(equalTo: shutterButton\.leadingAnchor/);
    assert.match(camera, /PHPickerViewController\(configuration: config\)/);
    assert.match(camera, /config\.filter = \.images/);
    assert.match(camera, /extension CardScannerViewController: PHPickerViewControllerDelegate/);
    // Snap and photo both go through handle(): CardTextReader.read, the reader `recognize` uses.
    assert.equal([...camera.matchAll(/self\.handle\(image\)/g)].length, 2);
    // A snap also hands over the sharpest recent frames; a library photo hands over none.
    assert.match(camera, /let read = CardTextReader\.read\(image: image, frames: frames\)/);
    assert.match(reader, /static func read\(image: UIImage, frames: \[CGImage\] = \[\]\) -> CardRead/);
    assert.match(plugin, /CardTextReader\.read\(image: image\)\.jsObject/);
  });

  it("says one plain hint at a time, never the word free", () => {
    const hints = [...camera.matchAll(/case \w+ = "([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(hints, [
      "Frame the card, then tap to take it",
      "Reading the card",
      "Flip it over for the card #",
      "Hold steady",
      "Tilt to cut glare",
      "We couldn't read that one. Try again with the card flat and in good light.",
    ]);
    for (const source of [plugin, camera, reader]) assert.doesNotMatch(source, /\bfree\b/i);
  });
});

describe("native scanner: flip for the card #", () => {
  it("asks for the back only on a raw card whose front shows no card number", () => {
    assert.match(camera, /static func needsBack\(_ read: CardRead\) -> Bool \{\s*if read\.kind == "slab" \{ return false \}/);
    const pattern = camera.match(/line\.range\(of: #"(.+?)"#/)?.[1];
    assert.ok(pattern, "the card number pattern");
    const number = new RegExp(pattern, "i");
    assert.equal(number.test("#136"), true);
    assert.equal(number.test("NO. 280"), true);
    assert.equal(number.test("VICTOR WEMBANYAMA"), false);
    assert.equal(number.test("PRIZM"), false);
  });

  it("puts the back's lines with the front, and Skip sends the front alone", () => {
    assert.match(camera, /if var front = self\.front \{\s*front\.backLines = read\.lines/);
    assert.match(camera, /@objc private func skipTapped\(\) \{\s*guard let front, !capturing else \{ return \}\s*end\(\.captured\(front\)\)/);
    assert.match(camera, /skipButton\.heightAnchor\.constraint\(equalToConstant: Self\.minTapTarget\)/);
  });

  it("waits for a second tap for the back, never taking it on its own", () => {
    const askForBack = camera.slice(camera.indexOf("private func askForBack"), camera.indexOf("private func capture()"));
    assert.match(askForBack, /show\(\.flip\)/);
    assert.doesNotMatch(askForBack, /capture\(|capturePhoto/);
  });

  it("reads the back through the same matcher on the web side", async () => {
    const { INDEXED_DIRECTORY } = await import("@/lib/players/directory");
    const { scanReadFrom } = await import("@/lib/scan/session");
    const read = scanReadFrom(
      { lines: ["VICTOR WEMBANYAMA", "PRIZM"], backLines: ["#136", "2023-24 PANINI PRIZM"], image: null, kind: "card" },
      INDEXED_DIRECTORY,
    );
    assert.ok(read.kind === "raw" && read.back?.cardNumber === "136" && read.back.yearLabel === "2023-24");
  });
});

describe("native scanner: the photo we keep", () => {
  it("is tight on the card: the card inside a toploader, a thin trim, a slab keeps its label", () => {
    assert.match(reader, /let photo = edge == nil \? cropped : tighten\(cropped, slab: kind == "slab"\)/);
    assert.match(reader, /return CardRead\(lines: lines, backLines: nil, image: UIImage\(cgImage: photo\), kind: kind, border: border, details: details, backDetails: nil, cert: cert\)/);
    // Text is still read from the first crop, and `lines` is the best string of each line.
    assert.match(reader, /var details = recognizeText\(in: cropped\)/);
    assert.match(reader, /let lines = details\.map \{ \$0\.text \}/);
    assert.match(reader, /if !slab, let inner = detectInnerCard\(in: image\)/);
    assert.match(reader, /static let innerCardMinArea: CGFloat = 0\.55/);
    assert.match(reader, /static let edgeTrim: CGFloat = 0\.012/);
  });

  it("keeps the tight crop after capture, and draws no lines on the kept photo", () => {
    assert.match(reader, /static func detectInnerCard\(in image: CGImage\) -> VNRectangleObservation\?/);
    assert.doesNotMatch(reader, /stroke|UIBezierPath|CAShapeLayer|addLine/);
  });

  it("leaves the camera screen as it is", () => {
    assert.doesNotMatch(camera, /tighten|detectInnerCard|edgeTrim/);
  });
});

describe("native scanner: the border color, for ties only", () => {
  it("averages the kept photo's outer band on the phone and sends hue, saturation, brightness", () => {
    assert.match(reader, /var border: \[Double\]\? = nil/);
    assert.match(reader, /if let border \{ object\["border"\] = border \}/);
    assert.match(reader, /let border = kind == "card" \? borderColor\(of: photo\) : nil/);
    assert.match(reader, /static func borderColor\(of image: CGImage\) -> \[Double\]\?/);
    assert.match(reader, /static let borderBand: CGFloat = 0\.08/);
    // Read on the phone: nothing is uploaded for it.
    assert.doesNotMatch(reader, /URLSession|https?:\/\//);
  });

  it("isn't on the camera screen", () => {
    assert.doesNotMatch(camera, /borderColor\(of|borderBand/);
  });
});

describe("native scanner: small print (OCR settings, alternates, re-reads)", () => {
  it("reads small text: accurate, no language correction, a low minimum text height, revision 3 when there is one", () => {
    assert.match(reader, /static let minimumTextHeight: Float = 0\.008/);
    assert.match(reader, /request\.minimumTextHeight = minimumTextHeight/);
    assert.match(reader, /if #available\(iOS 16\.0, \*\) \{\s*request\.revision = VNRecognizeTextRequestRevision3/);
    assert.match(reader, /request\.recognitionLevel = \.accurate/);
    assert.match(reader, /request\.usesLanguageCorrection = false/);
  });

  it("keeps the top 3 readings of each line, with its box and how sure Vision was", () => {
    assert.match(reader, /observation\.topCandidates\(3\)/);
    assert.match(reader, /TextLine\(text: text, alternates: alternates, confidence: best\.confidence, box: observation\.boundingBox, source: "card"\)/);
  });

  it("sends the new keys beside the old ones, so an older web build still works", () => {
    // `lines` and `backLines` stay plain strings, exactly as before.
    assert.match(reader, /var object: \[String: Any\] = \["lines": lines\]/);
    assert.match(reader, /if let backLines \{ object\["backLines"\] = backLines \}/);
    for (const key of ["alternates", "confidences", "boxes", "sources", "backAlternates", "backConfidences", "cert"]) {
      assert.match(reader, new RegExp(`object\\["${key}"\\] = `), key);
    }
    // The web reads the ones it uses, and ignores a result without them.
    const web = read("lib/ios/scanner.ts");
    for (const key of ["alternates", "backAlternates", "cert"]) assert.match(web, new RegExp(`scan\\.${key}`), key);
    assert.deepEqual(scanCaptureFrom({ lines: ["A"], kind: "card" })?.lines, ["A"]);
    const sample = scanCaptureFrom({ lines: ["O45/l49"], alternates: [["045/149"]], confidences: [0.3], boxes: [[0, 0, 1, 1]], sources: ["serial"], cert: "45678912" });
    assert.deepEqual(sample?.alternates, [["045/149"]]);
    assert.equal(sample?.cert, "45678912");
  });

  it("reads a slab's label strip again, larger, and tags it", () => {
    assert.match(reader, /static let labelStrip: CGFloat = 0\.22/);
    assert.match(reader, /static let labelScale: CGFloat = 2/);
    assert.match(reader, /let label = kind == "slab" \|\| looksLikeLabel\(details\)/);
    assert.match(reader, /details = merged\(details, with: labelLines\(in: cropped\)\)/);
    assert.match(reader, /out\.source = "label"/);
    // A grader's name or a cert-length number in the top strip.
    const pattern = reader.match(/line\.text\.range\(of: #"(.+?)"#, options: \[\.regularExpression, \.caseInsensitive\]\)/)?.[1];
    assert.ok(pattern);
    const label = new RegExp(pattern, "i");
    for (const text of ["PSA", "BGS 9.5", "SGC", "CGC CARDS", "45678912"]) assert.equal(label.test(text), true, text);
    for (const text of ["LUKA DONCIC", "PRIZM", "137/299", "2018"]) assert.equal(label.test(text), false, text);
  });

  it("reads a serial's box again, larger, and keeps it only when Vision is surer", () => {
    assert.match(reader, /static let serialScale: CGFloat = 3/);
    assert.match(reader, /static let maxSerialRereads = 4/);
    const pattern = reader.match(/let slash = line\.text\.range\(of: #"(.+?)"#/)?.[1];
    assert.ok(pattern);
    const slash = new RegExp(pattern);
    assert.equal(slash.test("23/99"), true);
    assert.equal(slash.test("045 / 149"), true);
    assert.equal(slash.test("LUKA DONCIC"), false);
    const reread = reader.slice(reader.indexOf("static func withSerialRereads"), reader.indexOf("static func pixelRect"));
    assert.match(reread, /if best\.confidence > line\.confidence \{\s*out\[index\] = replacing\(line, text: best\.text, confidence: best\.confidence, source: "serial"/);
    // A less sure re-read is kept only as an alternate.
    assert.match(reread, /\} else \{\s*out\[index\] = adding\(line, alternates: \[best\.text\]\)/);
  });

  it("reads a barcode only on a slab, only as the cert, and the web never makes it the card #", () => {
    assert.equal([...reader.matchAll(/VNDetectBarcodesRequest\(\)/g)].length, 1);
    assert.match(reader, /let cert = label \? certBarcode\(in: cropped\) : nil/);
    assert.match(reader, /if payload\.count >= 7, payload\.count <= 12, payload\.allSatisfy\(\{ \$0\.isASCII && \$0\.isNumber \}\) \{ return payload \}/);
    assert.match(reader, /if let cert \{ object\["cert"\] = cert \}/);
    const session = read("lib/scan/session.ts");
    assert.match(session, /if \(!label\.certNumber && capture\.cert\) label\.certNumber = capture\.cert;/);
    // Nothing else on the web reads the barcode's cert.
    for (const file of ["lib/scan/match.ts", "lib/scan/raw-text.ts", "lib/scan/slab-label.ts", "lib/scan/alternates.ts"]) {
      assert.doesNotMatch(read(file), /capture\.cert|scan\.cert/, file);
    }
  });

  it("stays quick: the extra reads share the time, and are skipped past a budget", () => {
    assert.match(reader, /static let rereadBudgetSeconds: CFAbsoluteTime = 1\.0/);
    assert.match(reader, /static let voteWaitSeconds: TimeInterval = 0\.5/);
    assert.match(reader, /for frame in frames\.prefix\(2\)/);
    assert.match(reader, /_ = group\.wait\(timeout: \.now\(\) \+ voteWaitSeconds\)/);
    assert.equal([...reader.matchAll(/CFAbsoluteTimeGetCurrent\(\) - started < rereadBudgetSeconds/g)].length, 2);
  });
});

describe("native scanner: capture quality, still tap-to-take", () => {
  it("keeps the lens focused near", () => {
    assert.match(camera, /if device\.isAutoFocusRangeRestrictionSupported \{ device\.autoFocusRangeRestriction = \.near \}/);
  });

  it("scores live frames for sharpness and glare, on the phone, drawing nothing", () => {
    assert.match(reader, /enum FrameQuality/);
    assert.match(reader, /static let sharpEnough: Double = 60/);
    assert.match(reader, /static let glareShare: Double = 0\.06/);
    assert.match(camera, /frameOutput\.alwaysDiscardsLateVideoFrames = true/);
    assert.match(camera, /extension CardScannerViewController: AVCaptureVideoDataOutputSampleBufferDelegate/);
    // The hint needs a run of soft or glaring frames, so it doesn't flicker.
    assert.match(camera, /static let hintRun = 3/);
  });

  it("never takes the picture from a live frame: the shutter is still the only way", () => {
    const delegate = camera.slice(camera.indexOf("extension CardScannerViewController: AVCaptureVideoDataOutputSampleBufferDelegate"));
    assert.doesNotMatch(delegate, /capture\(\)|capturePhoto|shutterTapped|handle\(/);
    const quality = camera.slice(camera.indexOf("private func showQuality"), camera.indexOf("private func capture()"));
    assert.doesNotMatch(quality, /capture\(|capturePhoto|handle\(/);
    assert.equal([...camera.matchAll(/photoOutput\.capturePhoto\(/g)].length, 1);
    assert.equal([...camera.matchAll(/(?<!func )\bcapture\(\)/g)].length, 1);
  });

  it("votes with the sharpest recent frames on a snap, and with none on a library photo", () => {
    assert.match(camera, /static let steadyWindow: CFAbsoluteTime = 0\.6/);
    assert.match(camera, /voteFrames = sharpestFrames\(\)/);
    assert.match(camera, /\/\/ A library photo has no live frames to vote with\.\s*voteFrames = \[\]/);
    assert.match(reader, /details = voted\(details, with: others\.all\(\)\)/);
    // Two frames that agree beat the photo; otherwise the surest reading wins; the rest stay as alternates.
    assert.match(reader, /if differing\.count >= 2, key\(differing\[0\]\.text\) == key\(differing\[1\]\.text\)/);
    assert.match(reader, /surest\.confidence > line\.confidence/);
  });

  it("leaves the camera permission text as it was", () => {
    const plist = read(`${APP}/Info.plist`);
    assert.match(plist, /<key>NSCameraUsageDescription<\/key>\s*<string>Slabhold uses the camera to photograph and identify the cards you scan\. Cards are read on your phone\.<\/string>/);
    // Live frames carry no sound: no microphone permission is asked for.
    assert.doesNotMatch(plist, /NSMicrophoneUsageDescription/);
  });
});
