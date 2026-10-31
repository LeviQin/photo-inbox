package expo.modules.photoocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.ExifInterface
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.FileInputStream
import java.io.InputStream
import kotlin.math.max

class ExpoPhotoOcrModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ExpoPhotoOcr")

    AsyncFunction("recognizeTextAsync") { _: String, uriString: String ->
      recognize(uriString)
    }
  }

  private fun openStream(uri: Uri): InputStream? = when (uri.scheme) {
    "content", "android.resource" -> context.contentResolver.openInputStream(uri)
    "file" -> uri.path?.let(::FileInputStream)
    else -> null
  }

  private fun sampledBitmap(uri: Uri): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    var sampleSize = 1
    while (max(bounds.outWidth, bounds.outHeight) / sampleSize > 2048) sampleSize *= 2
    val options = BitmapFactory.Options().apply {
      inSampleSize = sampleSize
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    return openStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
  }

  private fun rotation(uri: Uri): Int = runCatching {
    openStream(uri)?.use { stream ->
      when (ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90
        ExifInterface.ORIENTATION_ROTATE_180 -> 180
        ExifInterface.ORIENTATION_ROTATE_270 -> 270
        else -> 0
      }
    } ?: 0
  }.getOrDefault(0)

  private fun recognize(uriString: String): String {
    val uri = Uri.parse(uriString)
    val bitmap = sampledBitmap(uri) ?: throw IllegalStateException("photo_unavailable")
    val chinese = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
    val latin = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try {
      val image = InputImage.fromBitmap(bitmap, rotation(uri))
      val chineseLines = Tasks.await(chinese.process(image)).textBlocks.flatMap { block ->
        block.lines.map { it.text.trim() }
      }.filter { it.isNotEmpty() }
      val latinLines = Tasks.await(latin.process(image)).textBlocks.flatMap { block ->
        block.lines.map { it.text.trim() }
      }.filter { it.isNotEmpty() }
      val result = LinkedHashSet(chineseLines)
      for (line in latinLines) {
        if (chineseLines.none { it.contains(line, ignoreCase = true) }) result.add(line)
      }
      return result.joinToString("\n")
    } finally {
      chinese.close()
      latin.close()
      bitmap.recycle()
    }
  }
}
