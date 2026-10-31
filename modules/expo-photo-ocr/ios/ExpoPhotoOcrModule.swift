import ExpoModulesCore
import Photos
import Vision
import ImageIO
import UIKit

public class ExpoPhotoOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoPhotoOcr")

    AsyncFunction("recognizeTextAsync") { (assetId: String, uri: String, promise: Promise) in
      let assets = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
      if let asset = assets.firstObject {
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = false
        PHImageManager.default().requestImage(
          for: asset,
          targetSize: CGSize(width: 2048, height: 2048),
          contentMode: .aspectFit,
          options: options
        ) { image, info in
          if info?[PHImageResultIsDegradedKey] as? Bool == true { return }
          guard let image else {
            promise.reject("OCR_UNAVAILABLE", "photo_unavailable")
            return
          }
          DispatchQueue.global(qos: .utility).async {
            self.recognize(image, promise: promise)
          }
        }
        return
      }

      guard let url = URL(string: uri), url.isFileURL,
            let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceThumbnailMaxPixelSize: 2048,
              kCGImageSourceCreateThumbnailWithTransform: true
            ] as CFDictionary) else {
        promise.reject("OCR_UNAVAILABLE", "photo_unavailable")
        return
      }
      self.recognize(UIImage(cgImage: thumbnail), promise: promise)
    }
  }

  private func recognize(_ image: UIImage, promise: Promise) {
    guard let cgImage = image.cgImage else {
      promise.reject("OCR_UNAVAILABLE", "photo_unavailable")
      return
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    do {
      let handler = VNImageRequestHandler(
        cgImage: cgImage,
        orientation: imageOrientation(image.imageOrientation),
        options: [:]
      )
      try handler.perform([request])
      let text = (request.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
      promise.resolve(text)
    } catch {
      promise.reject("OCR_FAILED", "text_recognition_failed")
    }
  }

  private func imageOrientation(_ orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch orientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
