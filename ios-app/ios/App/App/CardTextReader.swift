import CoreImage
import UIKit
import Vision

/// What one scan read: the text lines (top to bottom), the straightened crop,
/// and whether it looks like a raw card or a graded slab. Everything happens on
/// the phone. Only this goes back to the web page; nothing is sent anywhere else.
struct CardRead {
    var lines: [String]
    var backLines: [String]?
    var image: UIImage?
    /// "card", "slab", or nil when no card edge was found.
    var kind: String?
    /// The outer frame's average color as hue, saturation, brightness (0...1). Raw cards only.
    /// The web names it and uses it only to break a tie between parallels sold titles offer.
    var border: [Double]? = nil

    /// The shape lib/ios/scanner.ts (scanCaptureFrom) checks.
    var jsObject: [String: Any] {
        var object: [String: Any] = ["lines": lines]
        if let backLines { object["backLines"] = backLines }
        if let kind { object["kind"] = kind }
        if let border { object["border"] = border }
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

    /// Reads a photo: the library pick, or the frame the live camera captured.
    static func read(image: UIImage) -> CardRead {
        guard let upright = normalized(image), let cgImage = upright.cgImage else {
            return CardRead(lines: [], backLines: nil, image: nil, kind: nil)
        }
        let edge = detectCard(in: cgImage)
        let cropped = edge.flatMap { straighten(cgImage, to: $0) } ?? cgImage
        let lines = recognizeText(in: cropped)
        let kind = edge.map { aspect(of: $0, width: cgImage.width, height: cgImage.height) < slabAspectBelow ? "slab" : "card" }
        // Text is read from the first crop; the photo we keep is tight on the card.
        let photo = edge == nil ? cropped : tighten(cropped, slab: kind == "slab")
        // The border color is read from the kept photo, on the phone. Only for a card we found the edges of.
        let border = kind == "card" ? borderColor(of: photo) : nil
        return CardRead(lines: lines, backLines: nil, image: UIImage(cgImage: photo), kind: kind, border: border)
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

    /// Text lines, top to bottom then left to right. Accurate mode, no language
    /// correction: player names and set words are not dictionary words.
    static func recognizeText(in image: CGImage) -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["en-US"]
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return []
        }
        let observations = (request.results ?? []).sorted { a, b in
            let rowGap = a.boundingBox.midY - b.boundingBox.midY
            if abs(rowGap) > 0.02 { return rowGap > 0 }
            return a.boundingBox.minX < b.boundingBox.minX
        }
        var lines: [String] = []
        for observation in observations {
            guard let text = observation.topCandidates(1).first?.string else { continue }
            let line = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty { continue }
            lines.append(String(line.prefix(maxLineLength)))
            if lines.count >= maxLines { break }
        }
        return lines
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
