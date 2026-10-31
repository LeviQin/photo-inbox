import ExpoModulesCore
import Photos
import UIKit
import CryptoKit

public class ExpoPhotoHashModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoPhotoHash")

    AsyncFunction("computeDHashAsync") { (assetId: String, uri: String, promise: Promise) in
      let assets = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
      if let asset = assets.firstObject {
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = false

        PHImageManager.default().requestImage(
          for: asset,
          targetSize: CGSize(width: 64, height: 64),
          contentMode: .aspectFit,
          options: options
        ) { image, info in
          if (info?[PHImageResultIsDegradedKey] as? Bool) == true { return }
          promise.resolve(image.flatMap(self.differenceHash))
        }
        return
      }

      guard let url = URL(string: uri), url.isFileURL else {
        promise.resolve(nil)
        return
      }
      promise.resolve(UIImage(contentsOfFile: url.path).flatMap(differenceHash))
    }

    AsyncFunction("analyzePhotoAsync") { (assetId: String, uri: String, includeVisual: Bool, promise: Promise) in
      let fallbackSize = self.fileSize(uri)
      guard includeVisual else {
        promise.resolve(["visualHash": nil, "averageColor": nil, "actualBytes": fallbackSize])
        return
      }
      let assets = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
      if let asset = assets.firstObject {
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = false
        PHImageManager.default().requestImage(
          for: asset,
          targetSize: CGSize(width: 64, height: 64),
          contentMode: .aspectFit,
          options: options
        ) { image, info in
          if info?[PHImageResultIsDegradedKey] as? Bool == true { return }
          promise.resolve([
            "visualHash": image.flatMap(self.differenceHash),
            "averageColor": image.flatMap(self.averageColor),
            "actualBytes": fallbackSize
          ])
        }
        return
      }
      guard let url = URL(string: uri), url.isFileURL, let image = UIImage(contentsOfFile: url.path) else {
        promise.resolve(["visualHash": nil, "averageColor": nil, "actualBytes": fallbackSize])
        return
      }
      promise.resolve([
        "visualHash": differenceHash(image),
        "averageColor": averageColor(image),
        "actualBytes": fallbackSize
      ])
    }

    AsyncFunction("computeExactHashAsync") { (assetId: String, uri: String, promise: Promise) in
      let assets = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
      if let asset = assets.firstObject, let resource = PHAssetResource.assetResources(for: asset).first {
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = false
        var hasher = SHA256()
        var byteCount: Int64 = 0
        PHAssetResourceManager.default().requestData(
          for: resource,
          options: options,
          dataReceivedHandler: { data in
            hasher.update(data: data)
            byteCount += Int64(data.count)
          },
          completionHandler: { error in
            guard error == nil else {
              promise.resolve(nil)
              return
            }
            let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
            promise.resolve(["exactHash": digest, "actualBytes": byteCount])
          }
        )
        return
      }
      guard let result = self.exactHashForFile(uri) else {
        promise.resolve(nil)
        return
      }
      promise.resolve(result)
    }
  }

  private func differenceHash(_ image: UIImage) -> String? {
    guard let cgImage = image.cgImage else { return nil }
    var pixels = [UInt8](repeating: 0, count: 9 * 8)
    let rendered = pixels.withUnsafeMutableBytes { buffer -> Bool in
      guard let context = CGContext(
        data: buffer.baseAddress,
        width: 9,
        height: 8,
        bitsPerComponent: 8,
        bytesPerRow: 9,
        space: CGColorSpaceCreateDeviceGray(),
        bitmapInfo: CGImageAlphaInfo.none.rawValue
      ) else { return false }
      context.interpolationQuality = .low
      context.draw(cgImage, in: CGRect(x: 0, y: 0, width: 9, height: 8))
      return true
    }
    guard rendered else { return nil }

    var hash: UInt64 = 0
    var bit = 63
    for y in 0..<8 {
      for x in 0..<8 {
        if pixels[y * 9 + x] > pixels[y * 9 + x + 1] {
          hash |= UInt64(1) << UInt64(bit)
        }
        bit -= 1
      }
    }
    return String(format: "%016llx", hash)
  }

  private func averageColor(_ image: UIImage) -> String? {
    guard let cgImage = image.cgImage else { return nil }
    var pixels = [UInt8](repeating: 0, count: 8 * 8 * 4)
    let rendered = pixels.withUnsafeMutableBytes { buffer -> Bool in
      guard let context = CGContext(
        data: buffer.baseAddress,
        width: 8,
        height: 8,
        bitsPerComponent: 8,
        bytesPerRow: 8 * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ) else { return false }
      context.interpolationQuality = .low
      context.draw(cgImage, in: CGRect(x: 0, y: 0, width: 8, height: 8))
      return true
    }
    guard rendered else { return nil }
    var red = 0
    var green = 0
    var blue = 0
    for index in 0..<(8 * 8) {
      red += Int(pixels[index * 4])
      green += Int(pixels[index * 4 + 1])
      blue += Int(pixels[index * 4 + 2])
    }
    return String(format: "#%02x%02x%02x", red / 64, green / 64, blue / 64)
  }

  private func fileSize(_ uri: String) -> Int64? {
    guard let url = URL(string: uri), url.isFileURL,
          let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
          let size = attributes[.size] as? NSNumber else { return nil }
    return size.int64Value
  }

  private func exactHashForFile(_ uri: String) -> [String: Any]? {
    guard let url = URL(string: uri), url.isFileURL,
          let handle = try? FileHandle(forReadingFrom: url) else { return nil }
    defer { try? handle.close() }
    var hasher = SHA256()
    var byteCount: Int64 = 0
      do {
        while true {
          guard let data = try handle.read(upToCount: 64 * 1024), !data.isEmpty else { break }
          hasher.update(data: data)
          byteCount += Int64(data.count)
        }
      } catch {
        return nil
      }
    let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
    return ["exactHash": digest, "actualBytes": byteCount]
  }
}
