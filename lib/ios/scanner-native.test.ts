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
    // No live card detection on the viewfinder at all.
    assert.doesNotMatch(camera, /AVCaptureVideoDataOutput|VNDetectRectanglesRequest|import Vision/);
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
    assert.match(camera, /let read = CardTextReader\.read\(image: image\)/);
    assert.match(plugin, /CardTextReader\.read\(image: image\)\.jsObject/);
  });

  it("says one plain hint at a time, never the word free", () => {
    const hints = [...camera.matchAll(/case \w+ = "([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(hints, [
      "Frame the card, then tap to take it",
      "Reading the card",
      "Flip it over for the card #",
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
    assert.match(reader, /return CardRead\(lines: lines, backLines: nil, image: UIImage\(cgImage: photo\), kind: kind, border: border\)/);
    // Text is still read from the first crop.
    assert.match(reader, /let lines = recognizeText\(in: cropped\)/);
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
