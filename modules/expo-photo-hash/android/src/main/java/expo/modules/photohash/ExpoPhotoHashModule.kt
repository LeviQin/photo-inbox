package expo.modules.photohash

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.provider.OpenableColumns
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.security.MessageDigest
import kotlin.math.max

class ExpoPhotoHashModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ExpoPhotoHash")

    AsyncFunction("computeDHashAsync") { _: String, uriString: String ->
      runCatching { computeDHash(uriString) }.getOrNull()
    }

    AsyncFunction("analyzePhotoAsync") { _: String, uriString: String, includeVisual: Boolean ->
      runCatching { analyzePhoto(uriString, includeVisual) }.getOrNull()
    }

    AsyncFunction("computeExactHashAsync") { _: String, uriString: String ->
      runCatching { computeExactHash(uriString) }.getOrNull()
    }
  }

  private fun openImageStream(uri: Uri): InputStream? {
    return when (uri.scheme) {
      "file" -> uri.path?.let(::FileInputStream)
      "content", "android.resource" -> context.contentResolver.openInputStream(uri)
      else -> null
    }
  }

  private fun decodeThumbnail(uriString: String): Bitmap? {
    val uri = Uri.parse(uriString)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openImageStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    var sampleSize = 1
    while (max(bounds.outWidth, bounds.outHeight) / sampleSize > 128) sampleSize *= 2
    val options = BitmapFactory.Options().apply {
      inSampleSize = sampleSize
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    return openImageStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
  }

  private fun computeDHash(uriString: String): String? {
    val source = decodeThumbnail(uriString) ?: return null
    val hash = differenceHash(source)
    source.recycle()
    return hash
  }

  private fun analyzePhoto(uriString: String, includeVisual: Boolean): Map<String, Any?> {
    val source = if (includeVisual) decodeThumbnail(uriString) else null
    val result = mapOf(
      "visualHash" to source?.let(::differenceHash),
      "averageColor" to source?.let(::averageColor),
      "actualBytes" to resolveSize(Uri.parse(uriString))
    )
    source?.recycle()
    return result
  }

  private fun differenceHash(source: Bitmap): String {
    val scaled = Bitmap.createScaledBitmap(source, 9, 8, true)
    var hash = 0L
    var bit = 63

    for (y in 0 until 8) {
      for (x in 0 until 8) {
        val left = luminance(scaled.getPixel(x, y))
        val right = luminance(scaled.getPixel(x + 1, y))
        if (left > right) hash = hash or (1L shl bit)
        bit -= 1
      }
    }

    if (scaled !== source) scaled.recycle()
    return java.lang.Long.toUnsignedString(hash, 16).padStart(16, '0')
  }

  private fun averageColor(source: Bitmap): String {
    val scaled = Bitmap.createScaledBitmap(source, 8, 8, true)
    var red = 0L
    var green = 0L
    var blue = 0L
    for (y in 0 until 8) {
      for (x in 0 until 8) {
        val pixel = scaled.getPixel(x, y)
        red += Color.red(pixel)
        green += Color.green(pixel)
        blue += Color.blue(pixel)
      }
    }
    if (scaled !== source) scaled.recycle()
    return String.format("#%02x%02x%02x", red / 64, green / 64, blue / 64)
  }

  private fun resolveSize(uri: Uri): Long? {
    if (uri.scheme == "file") return uri.path?.let(::File)?.takeIf { it.exists() }?.length()
    if (uri.scheme != "content" && uri.scheme != "android.resource") return null
    context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
      val index = cursor.getColumnIndex(OpenableColumns.SIZE)
      if (index >= 0 && cursor.moveToFirst() && !cursor.isNull(index)) return cursor.getLong(index)
    }
    return context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
      descriptor.length.takeIf { it >= 0 }
    }
  }

  private fun computeExactHash(uriString: String): Map<String, Any?>? {
    val uri = Uri.parse(uriString)
    val digest = MessageDigest.getInstance("SHA-256")
    var bytes = 0L
    openImageStream(uri)?.use { stream ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val read = stream.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
        bytes += read
      }
    } ?: return null
    return mapOf(
      "exactHash" to digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) },
      "actualBytes" to bytes
    )
  }

  private fun luminance(pixel: Int): Int {
    return (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) / 1000
  }
}
