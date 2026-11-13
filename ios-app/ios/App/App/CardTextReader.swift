import CoreImage
import UIKit
import Vision

/// What one scan read: the text lines (top to bottom), the straightened crop,
/// and whether it looks like a raw card or a graded slab. Everything happens on
/// the phone. Only this goes back to the web page; nothing is sent anywhere else.
/// One line of text as Vision read it: the best string, the next best readings, how sure Vision
/// was, where it sits in the straightened crop, and which pass read it.
struct TextLine {
    var text: String
    /// Other readings of the same line, best first. Never the same as `text`.
    var alternates: [String]
    var confidence: Float
    /// In the straightened crop, 0...1, origin bottom left (Vision's own).
    var box: CGRect
    /// "card" (the whole crop), "label" (the slab label strip, read again larger),
    /// "serial" (a serial's box, read again larger) or "vote" (three frames agreed).
    var source: String
}

struct CardRead {
    var lines: [String]
    var backLines: [String]?
    var image: UIImage?
    /// "card", "slab", or nil when no card edge was found.
    var kind: String?
    /// The outer frame's average color as hue, saturation, brightness (0...1). Raw cards only.
    /// The web names it and uses it only to break a tie between parallels sold titles offer.
    var border: [Double]? = nil
    /// One entry per line in `lines`, same order.
    var details: [TextLine] = []
    /// One entry per line in `backLines`, same order.
    var backDetails: [TextLine]? = nil
    /// A slab's cert number from its barcode. Only ever the cert, never the card number.
    var cert: String? = nil

    /// The shape lib/ios/scanner.ts (scanCaptureFrom) checks. `lines` and `backLines` are the
    /// best strings, as before; everything added sits in new keys, so older web code still works.
    var jsObject: [String: Any] {
        var object: [String: Any] = ["lines": lines]
        if let backLines { object["backLines"] = backLines }
        if let kind { object["kind"] = kind }
        if let border { object["border"] = border }
        if details.count == lines.count, !details.isEmpty {
            object["alternates"] = details.map { $0.alternates }
            object["confidences"] = details.map { Double($0.confidence) }
            object["boxes"] = details.map { [Double($0.box.minX), Double($0.box.minY), Double($0.box.width), Double($0.box.height)] }
            object["sources"] = details.map { $0.source }
        }
        if let backLines, let backDetails, backDetails.count == backLines.count, !backDetails.isEmpty {
            object["backAlternates"] = backDetails.map { $0.alternates }
            object["backConfidences"] = backDetails.map { Double($0.confidence) }
        }
        if let cert { object["cert"] = cert }
        if let image, let dataUrl = CardTextReader.jpegDataUrl(image) { object["image"] = dataUrl }
        return object
    }
}

/// Apple Vision on the phone: find the card's edges, straighten it, read the text.
enum CardTextReader {
    /// A raw card is 2.5 x 3.5 in (0.71). A slab is about 3.1 x 5.3 in (0.58).
    static let slabAspectBelow: Float = 0.65
    /// Most lines and characters a read returns. lib/ios/scanner.ts caps the same.
    static let maxLines = 80
    static let maxLineLength = 200
    /// The crop's long side. Enough for the card photo, small enough to hand over quickly.
    static let maxImageSide: CGFloat = 1280
    /// A card inside a toploader or sleeve covers about this share of the first crop.
    static let innerCardMinArea: CGFloat = 0.55
    static let innerCardMaxArea: CGFloat = 0.97
    /// Each side of the kept photo loses this share, so no table or plastic edge shows.
    static let edgeTrim: CGFloat = 0.012
    private static let context = CIContext()

    /// The smallest text Vision reads, as a share of the image height. Vision's default is 1/32,
    /// which drops a slab label's small print, a stamped serial and a back's card number.
    static let minimumTextHeight: Float = 0.008
    /// The top share of the crop where a slab's label sits.
    static let labelStrip: CGFloat = 0.22
    /// The label strip and a serial's box are enlarged this much before they are read again.
    static let labelScale: CGFloat = 2
    static let serialScale: CGFloat = 3
    /// Most serial boxes read again per scan.
    static let maxSerialRereads = 4
    /// Two boxes are the same line when this share of the smaller one overlaps.
    static let sameLineOverlap: CGFloat = 0.5
    /// The second and third frames get this long to finish, so a scan stays quick.
    static let voteWaitSeconds: TimeInterval = 0.5
    /// Past this, the extra reads are skipped: the whole scan stays well under 1.5 s.
    static let rereadBudgetSeconds: CFAbsoluteTime = 1.0

    /// Reads a photo: the library pick, or the frame the live camera captured. `frames` are
    /// the sharpest recent camera frames (none for a library pick); their text votes line by line.
    static func read(image: UIImage, frames: [CGImage] = []) -> CardRead {
        guard let upright = normalized(image), let cgImage = upright.cgImage else {
            return CardRead(lines: [], backLines: nil, image: nil, kind: nil)
        }
        let started = CFAbsoluteTimeGetCurrent()
        // The other frames are read at the same time as the photo.
        let others = FrameReads()
        let group = DispatchGroup()
        for frame in frames.prefix(2) {
            group.enter()
            DispatchQueue.global(qos: .userInitiated).async {
                others.add(CardTextReader.linesOfFrame(frame))
                group.leave()
            }
        }
        let edge = detectCard(in: cgImage)
        let cropped = edge.flatMap { straighten(cgImage, to: $0) } ?? cgImage
        var details = recognizeText(in: cropped)
        let kind = edge.map { aspect(of: $0, width: cgImage.width, height: cgImage.height) < slabAspectBelow ? "slab" : "card" }
        if !frames.isEmpty {
            _ = group.wait(timeout: .now() + voteWaitSeconds)
            details = voted(details, with: others.all())
        }
        // A slab's label is small print: read the strip again, larger.
        let label = kind == "slab" || looksLikeLabel(details)
        if label, CFAbsoluteTimeGetCurrent() - started < rereadBudgetSeconds {
            details = merged(details, with: labelLines(in: cropped))
        }
        details = withSerialRereads(details, in: cropped, started: started)
        // The barcode is read only on a slab, and only for its cert number.
        let cert = label ? certBarcode(in: cropped) : nil
        details = Array(ordered(details).prefix(maxLines))
        let lines = details.map { $0.text }
        // Text is read from the first crop; the photo we keep is tight on the card.
        let photo = edge == nil ? cropped : tighten(cropped, slab: kind == "slab")
        // The border color is read from the kept photo, on the phone. Only for a card we found the edges of.
        let border = kind == "card" ? borderColor(of: photo) : nil
        return CardRead(lines: lines, backLines: nil, image: UIImage(cgImage: photo), kind: kind, border: border, details: details, backDetails: nil, cert: cert)
    }

    /// Lines read from the other frames, gathered from other threads.
    private final class FrameReads {
        private var reads: [[TextLine]] = []
        private let lock = NSLock()
        func add(_ lines: [TextLine]) {
            lock.lock()
            reads.append(lines)
            lock.unlock()
        }
        func all() -> [[TextLine]] {
            lock.lock()
            defer { lock.unlock() }
            return reads
        }
    }

    /// One camera frame, straightened the same way as the photo, as text lines. A frame with
    /// no card edge has no vote: its boxes wouldn't line up with the photo's.
    static func linesOfFrame(_ frame: CGImage) -> [TextLine] {
        guard let edge = detectCard(in: frame), let cropped = straighten(frame, to: edge) else { return [] }
        return recognizeText(in: cropped)
    }

    // MARK: Voting, label and serial re-reads

    private static func key(_ text: String) -> String {
        text.uppercased().split(separator: " ").joined(separator: " ")
    }

    /// The share of the smaller box that the two boxes share.
    static func overlap(_ a: CGRect, _ b: CGRect) -> CGFloat {
        let shared = a.intersection(b)
        if shared.isNull || shared.isEmpty { return 0 }
        let smaller = min(a.width * a.height, b.width * b.height)
        return smaller > 0 ? (shared.width * shared.height) / smaller : 0
    }

    /// `line` with `text` as its best reading; what it said before becomes an alternate.
    private static func replacing(_ line: TextLine, text: String, confidence: Float, source: String, extra: [String] = []) -> TextLine {
        var out = line
        var alternates: [String] = []
        for candidate in [line.text] + line.alternates + extra where key(candidate) != key(text) {
            if !alternates.contains(where: { key($0) == key(candidate) }) { alternates.append(candidate) }
        }
        out.text = text
        out.confidence = confidence
        out.source = source
        out.alternates = Array(alternates.prefix(3))
        return out
    }

    /// `line` with more alternates, never repeating its own text.
    private static func adding(_ line: TextLine, alternates extra: [String]) -> TextLine {
        replacing(line, text: line.text, confidence: line.confidence, source: line.source, extra: extra)
    }

    /// The frames may change a photo line only when Vision was under this sure of it.
    static let voteBelowConfidence: Float = 0.5

    /// Three frames vote line by line. The other two frames replace a photo line only when
    /// Vision was unsure of the photo's reading and both of them read the same thing. Every
    /// other frame reading is kept as an alternate, never as the line.
    static func voted(_ lines: [TextLine], with others: [[TextLine]]) -> [TextLine] {
        guard !others.isEmpty else { return lines }
        var out: [TextLine] = []
        for line in lines {
            let matches = others.compactMap { frame in
                frame.max { overlap($0.box, line.box) < overlap($1.box, line.box) }
            }.filter { overlap($0.box, line.box) >= sameLineOverlap }
            let differing = matches.filter { key($0.text) != key(line.text) }
            guard !differing.isEmpty else {
                out.append(line)
                continue
            }
            let extra = differing.map { $0.text }
            let bothAgree = differing.count >= 2 && key(differing[0].text) == key(differing[1].text)
            if line.confidence < voteBelowConfidence, bothAgree {
                let confidence = max(differing[0].confidence, differing[1].confidence)
                out.append(replacing(line, text: differing[0].text, confidence: confidence, source: "vote", extra: extra))
            } else {
                out.append(adding(line, alternates: extra))
            }
        }
        // A line the photo missed counts only when both other frames read it the same.
        if others.count >= 2 {
            for candidate in others[0] where !out.contains(where: { overlap($0.box, candidate.box) >= sameLineOverlap }) {
                let twin = others[1].first { overlap($0.box, candidate.box) >= sameLineOverlap && key($0.text) == key(candidate.text) }
                if twin != nil {
                    var line = candidate
                    line.source = "vote"
                    out.append(line)
                }
            }
        }
        return out
    }

    /// A grader's name or a cert-length number in the top strip: a slab label.
    static func looksLikeLabel(_ lines: [TextLine]) -> Bool {
        lines.contains { line in
            guard line.box.midY >= 1 - labelStrip else { return false }
            return line.text.range(of: #"\b(PSA|BGS|SGC|CGC|BECKETT)\b|\b\d{7,12}\b"#, options: [.regularExpression, .caseInsensitive]) != nil
        }
    }

    /// The label strip (the top of the crop), enlarged and read again, in the crop's own coordinates.
    static func labelLines(in image: CGImage) -> [TextLine] {
        let height = (CGFloat(image.height) * labelStrip).rounded()
        guard height >= 8, let strip = image.cropping(to: CGRect(x: 0, y: 0, width: CGFloat(image.width), height: height)) else { return [] }
        let larger = upscaled(strip, by: labelScale) ?? strip
        return recognizeText(in: larger).map { line in
            var out = line
            // The strip is the top share of the crop; Vision's y runs up from the bottom.
            out.box = CGRect(x: line.box.minX, y: (1 - labelStrip) + line.box.minY * labelStrip, width: line.box.width, height: line.box.height * labelStrip)
            out.source = "label"
            return out
        }
    }

    /// A second pass merged into the first: where both read the same spot, the surer text
    /// wins and the other becomes an alternate; a line only the second pass found is added.
    static func merged(_ lines: [TextLine], with extra: [TextLine]) -> [TextLine] {
        var out = lines
        for candidate in extra {
            if let index = out.firstIndex(where: { overlap($0.box, candidate.box) >= sameLineOverlap }) {
                let current = out[index]
                if key(current.text) == key(candidate.text) { continue }
                if candidate.confidence > current.confidence {
                    out[index] = replacing(current, text: candidate.text, confidence: candidate.confidence, source: candidate.source, extra: candidate.alternates)
                } else {
                    out[index] = adding(current, alternates: [candidate.text])
                }
            } else {
                out.append(candidate)
            }
        }
        return out
    }

    /// A serial ("23/99") or digits Vision wasn't sure of: that box is cropped with some
    /// room around it, enlarged and read again. The new reading replaces the line only when it
    /// sits on the same spot, keeps the slash if there was one, and Vision is surer of it.
    /// Anything else is kept as an alternate. The time budget is checked before every re-read.
    static func withSerialRereads(_ lines: [TextLine], in image: CGImage, started: CFAbsoluteTime) -> [TextLine] {
        var out = lines
        var done = 0
        let slashPattern = #"\d\s*/\s*\d"#
        for index in out.indices where done < maxSerialRereads {
            let line = out[index]
            let slash = line.text.range(of: slashPattern, options: .regularExpression) != nil
            let unsureDigits = line.confidence < 0.5 && line.text.rangeOfCharacter(from: .decimalDigits) != nil
            guard slash || unsureDigits else { continue }
            guard CFAbsoluteTimeGetCurrent() - started < rereadBudgetSeconds else { break }
            done += 1
            let rect = pixelRect(for: line.box, in: image, padding: 0.4)
            guard let crop = image.cropping(to: rect) else { continue }
            let larger = upscaled(crop, by: serialScale) ?? crop
            let again = recognizeText(in: larger).filter { $0.text.rangeOfCharacter(from: .decimalDigits) != nil && key($0.text) != key(line.text) }
            guard let best = again.max(by: { $0.confidence < $1.confidence }) else { continue }
            // The re-read's box, back in the whole crop: its center must sit inside the line it replaces.
            let place = cropBox(best.box, from: rect, in: image)
            let sameSpot = line.box.contains(CGPoint(x: place.midX, y: place.midY))
            let keepsSlash = !slash || best.text.range(of: slashPattern, options: .regularExpression) != nil
            if sameSpot, keepsSlash, best.confidence > line.confidence {
                out[index] = replacing(line, text: best.text, confidence: best.confidence, source: "serial", extra: best.alternates)
            } else {
                out[index] = adding(line, alternates: again.map { $0.text })
            }
        }
        return out
    }

    /// A box read inside a cropped piece (0...1 of the piece, origin bottom left) as a box in
    /// the whole image (0...1, origin bottom left). `rect` is the piece in pixels, origin top left.
    static func cropBox(_ box: CGRect, from rect: CGRect, in image: CGImage) -> CGRect {
        let width = CGFloat(image.width), height = CGFloat(image.height)
        guard width > 0, height > 0 else { return .zero }
        let left = rect.minX + box.minX * rect.width
        let bottom = rect.minY + (1 - box.minY) * rect.height
        return CGRect(x: left / width, y: 1 - bottom / height, width: box.width * rect.width / width, height: box.height * rect.height / height)
    }

    /// A Vision box (0...1, origin bottom left) as pixels (origin top left), grown by a share of its height.
    static func pixelRect(for box: CGRect, in image: CGImage, padding: CGFloat) -> CGRect {
        let width = CGFloat(image.width), height = CGFloat(image.height)
        let rect = CGRect(x: box.minX * width, y: (1 - box.maxY) * height, width: box.width * width, height: box.height * height)
        let pad = max(4, rect.height * padding)
        return rect.insetBy(dx: -pad, dy: -pad).intersection(CGRect(x: 0, y: 0, width: width, height: height)).integral
    }

    /// The image enlarged with Lanczos resampling, or nil when it can't be.
    static func upscaled(_ image: CGImage, by scale: CGFloat) -> CGImage? {
        // Past this size the enlargement costs more time than it earns.
        guard CGFloat(max(image.width, image.height)) * scale <= 4096, let filter = CIFilter(name: "CILanczosScaleTransform") else { return nil }
        filter.setValue(CIImage(cgImage: image), forKey: kCIInputImageKey)
        filter.setValue(scale, forKey: kCIInputScaleKey)
        filter.setValue(1.0, forKey: kCIInputAspectRatioKey)
        guard let output = filter.outputImage else { return nil }
        return context.createCGImage(output, from: output.extent)
    }

    /// A slab's cert number from its barcode: 7 to 12 digits and nothing else. Used only as
    /// the cert; the web never reads it as a card number.
    static func certBarcode(in image: CGImage) -> String? {
        let request = VNDetectBarcodesRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return nil
        }
        for observation in request.results ?? [] {
            guard let payload = observation.payloadStringValue?.trimmingCharacters(in: .whitespacesAndNewlines) else { continue }
            if payload.count >= 7, payload.count <= 12, payload.allSatisfy({ $0.isASCII && $0.isNumber }) { return payload }
        }
        return nil
    }

    /// Top to bottom, then left to right.
    static func ordered(_ lines: [TextLine]) -> [TextLine] {
        lines.sorted { a, b in
            let rowGap = a.box.midY - b.box.midY
            if abs(rowGap) > 0.02 { return rowGap > 0 }
            return a.box.minX < b.box.minX
        }
    }

    /// The share of each side, inside the edge, that counts as the frame.
    static let borderBand: CGFloat = 0.08

    /// The average color of the card's outer frame as [hue, saturation, brightness], each 0...1.
    /// Drawn small (40 x 56) so it's quick; nil when it can't tell.
    static func borderColor(of image: CGImage) -> [Double]? {
        let width = 40, height = 56
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.interpolationQuality = .medium
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let data = context.data else { return nil }
        let pixels = data.bindMemory(to: UInt8.self, capacity: width * height * 4)
        let bandX = max(1, Int(CGFloat(width) * borderBand))
        let bandY = max(1, Int(CGFloat(height) * borderBand))
        var red = 0.0, green = 0.0, blue = 0.0, count = 0.0
        for y in 0..<height {
            for x in 0..<width where x < bandX || y < bandY || x >= width - bandX || y >= height - bandY {
                let index = (y * width + x) * 4
                red += Double(pixels[index])
                green += Double(pixels[index + 1])
                blue += Double(pixels[index + 2])
                count += 1
            }
        }
        guard count > 0 else { return nil }
        let color = UIColor(red: red / count / 255, green: green / count / 255, blue: blue / count / 255, alpha: 1)
        var hue: CGFloat = 0, saturation: CGFloat = 0, brightness: CGFloat = 0, alpha: CGFloat = 0
        guard color.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha) else { return nil }
        return [Double(hue), Double(saturation), Double(brightness)]
    }

    /// The kept photo, tight and close on the card, for the sheet and the timeline.
    /// A raw card in a toploader or sleeve: the card's own edge inside the first
    /// crop is found and straightened, cutting the plastic away. A slab keeps its
    /// label. Then a thin sliver comes off each side.
    static func tighten(_ image: CGImage, slab: Bool) -> CGImage {
        var out = image
        if !slab, let inner = detectInnerCard(in: image), let straight = straighten(image, to: inner) {
            out = straight
        }
        return trimmed(out, by: edgeTrim)
    }

    /// A card-shaped edge filling most, but not all, of the crop: the card inside its holder.
    static func detectInnerCard(in image: CGImage) -> VNRectangleObservation? {
        let request = VNDetectRectanglesRequest()
        request.minimumAspectRatio = 0.6
        request.maximumAspectRatio = 0.85
        request.minimumSize = 0.6
        request.minimumConfidence = 0.7
        request.maximumObservations = 1
        request.quadratureTolerance = 15
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return nil
        }
        guard let edge = request.results?.first else { return nil }
        let area = edge.boundingBox.width * edge.boundingBox.height
        return area >= innerCardMinArea && area <= innerCardMaxArea ? edge : nil
    }

    /// The same image with a share of each side cut off.
    static func trimmed(_ image: CGImage, by share: CGFloat) -> CGImage {
        let dx = (CGFloat(image.width) * share).rounded()
        let dy = (CGFloat(image.height) * share).rounded()
        let rect = CGRect(x: dx, y: dy, width: CGFloat(image.width) - 2 * dx, height: CGFloat(image.height) - 2 * dy)
        guard rect.width > 0, rect.height > 0 else { return image }
        return image.cropping(to: rect) ?? image
    }

    /// The largest card-shaped rectangle in the image, or nil.
    static func detectCard(in image: CGImage) -> VNRectangleObservation? {
        let request = VNDetectRectanglesRequest()
        request.minimumAspectRatio = 0.45
        request.maximumAspectRatio = 0.9
        request.minimumSize = 0.25
        request.minimumConfidence = 0.6
        request.maximumObservations = 1
        request.quadratureTolerance = 20
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return nil
        }
        return request.results?.first
    }

    /// Short side over long side, in pixels, so a tilted card still reads right.
    static func aspect(of edge: VNRectangleObservation, width: Int, height: Int) -> Float {
        func point(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x * CGFloat(width), y: p.y * CGFloat(height)) }
        func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat { hypot(a.x - b.x, a.y - b.y) }
        let top = distance(point(edge.topLeft), point(edge.topRight))
        let side = distance(point(edge.topLeft), point(edge.bottomLeft))
        let long = max(top, side)
        guard long > 0 else { return 1 }
        return Float(min(top, side) / long)
    }

    /// Flattens the card to a straight-on rectangle with Core Image.
    static func straighten(_ image: CGImage, to edge: VNRectangleObservation) -> CGImage? {
        let input = CIImage(cgImage: image)
        let size = input.extent.size
        func scaled(_ p: CGPoint) -> CIVector { CIVector(x: p.x * size.width, y: p.y * size.height) }
        guard let filter = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
        filter.setValue(input, forKey: kCIInputImageKey)
        filter.setValue(scaled(edge.topLeft), forKey: "inputTopLeft")
        filter.setValue(scaled(edge.topRight), forKey: "inputTopRight")
        filter.setValue(scaled(edge.bottomLeft), forKey: "inputBottomLeft")
        filter.setValue(scaled(edge.bottomRight), forKey: "inputBottomRight")
        guard let output = filter.outputImage else { return nil }
        return context.createCGImage(output, from: output.extent)
    }

    /// Text lines, top to bottom then left to right, each with its next best readings.
    /// Accurate mode, no language correction: player names, set words, card codes and
    /// serials are not dictionary words. Small print counts (minimumTextHeight).
    static func recognizeText(in image: CGImage) -> [TextLine] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["en-US"]
        request.minimumTextHeight = minimumTextHeight
        if #available(iOS 16.0, *) {
            request.revision = VNRecognizeTextRequestRevision3
        }
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return []
        }
        func clean(_ text: String) -> String {
            String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxLineLength))
        }
        var lines: [TextLine] = []
        for observation in request.results ?? [] {
            let candidates = observation.topCandidates(3)
            guard let best = candidates.first else { continue }
            let text = clean(best.string)
            if text.isEmpty { continue }
            var alternates: [String] = []
            for candidate in candidates.dropFirst() {
                let other = clean(candidate.string)
                if !other.isEmpty, other != text, !alternates.contains(other) { alternates.append(other) }
            }
            lines.append(TextLine(text: text, alternates: alternates, confidence: best.confidence, box: observation.boundingBox, source: "card"))
        }
        return Array(ordered(lines).prefix(maxLines))
    }

    /// The photo the right way up, so Vision and the crop agree on corners.
    static func normalized(_ image: UIImage) -> UIImage? {
        if image.imageOrientation == .up { return image }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        return UIGraphicsImageRenderer(size: image.size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }

    /// A JPEG data URL with the long side at most maxImageSide.
    static func jpegDataUrl(_ image: UIImage) -> String? {
        let long = max(image.size.width, image.size.height)
        var output = image
        if long > maxImageSide {
            let scale = maxImageSide / long
            let size = CGSize(width: floor(image.size.width * scale), height: floor(image.size.height * scale))
            let format = UIGraphicsImageRendererFormat.default()
            format.scale = 1
            output = UIGraphicsImageRenderer(size: size, format: format).image { _ in
                image.draw(in: CGRect(origin: .zero, size: size))
            }
        }
        guard let data = output.jpegData(compressionQuality: 0.8) else { return nil }
        return "data:image/jpeg;base64,\(data.base64EncodedString())"
    }

    /// A data URL or plain base64 from the web side.
    static func decode(_ input: String) -> UIImage? {
        let base64 = input.range(of: "base64,").map { String(input[$0.upperBound...]) } ?? input
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)
    }
}

/// How sharp and how washed out one camera frame is, from its brightness plane. Used for the
/// camera's hint and to pick the frames whose text votes. Nothing is drawn and nothing leaves the phone.
enum FrameQuality {
    /// Under this Laplacian variance the frame is too soft to read small print.
    static let sharpEnough: Double = 60
    /// This share of blown-out pixels reads as glare.
    static let glareShare: Double = 0.06

    /// The Laplacian variance (higher is sharper) and the share of blown-out pixels, sampled
    /// on a coarse grid so it costs well under a millisecond. Nil when the frame has no brightness plane.
    static func score(_ buffer: CVPixelBuffer) -> (sharpness: Double, glare: Double)? {
        guard CVPixelBufferIsPlanar(buffer) else { return nil }
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(buffer, 0) else { return nil }
        let width = CVPixelBufferGetWidthOfPlane(buffer, 0)
        let height = CVPixelBufferGetHeightOfPlane(buffer, 0)
        let rowBytes = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
        let step = max(2, min(width, height) / 160)
        guard width > step * 4, height > step * 4 else { return nil }
        let pixels = base.assumingMemoryBound(to: UInt8.self)
        var sum = 0.0, squares = 0.0, count = 0.0, bright = 0.0
        var y = step
        while y < height - step {
            var x = step
            while x < width - step {
                let center = Double(pixels[y * rowBytes + x])
                let around = Double(pixels[y * rowBytes + x - step]) + Double(pixels[y * rowBytes + x + step])
                    + Double(pixels[(y - step) * rowBytes + x]) + Double(pixels[(y + step) * rowBytes + x])
                let edge = 4 * center - around
                sum += edge
                squares += edge * edge
                count += 1
                if center >= 250 { bright += 1 }
                x += step
            }
            y += step
        }
        guard count > 0 else { return nil }
        let mean = sum / count
        return (squares / count - mean * mean, bright / count)
    }
}
