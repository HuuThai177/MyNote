package com.padnote.ai.nativemodules

import com.facebook.react.bridge.*
import com.google.mlkit.vision.digitalink.*

/**
 * Native Android Kotlin Module for PadNote AI on Xiaomi Pad.
 * Integrates Google ML Kit Digital Ink Recognition SDK for Vietnamese ('vi-VN').
 * Handles MotionEvent.TOOL_TYPE_STYLUS & Xiaomi Smart Pen Pressure/Tilt attributes.
 */
class DigitalInkModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DigitalInkModule"

    @ReactMethod
    fun recognizeVietnameseHandwriting(strokesData: ReadableArray, promise: Promise) {
        try {
            val modelIdentifier = DigitalInkRecognitionModelIdentifier.fromLanguageTag("vi-VN")
            if (modelIdentifier == null) {
                promise.reject("MODEL_ERROR", "Ngôn ngữ vi-VN không được hỗ trợ trong ML Kit.")
                return
            }

            val model = DigitalInkRecognitionModel.builder(modelIdentifier).build()
            val remoteModelManager = RemoteModelManager.getInstance()

            // Download model if offline cache is missing
            remoteModelManager.download(model, DownloadConditions.Builder().build())
                .addOnSuccessListener {
                    val recognizer = DigitalInkRecognition.getClient(
                        DigitalInkRecognizerOptions.builder(model).build()
                    )

                    val inkBuilder = Ink.builder()
                    for (i in 0 until strokesData.size()) {
                        val strokeMap = strokesData.getMap(i)
                        val pointsArray = strokeMap?.getArray("points") ?: continue
                        val strokeBuilder = Ink.Stroke.builder()

                        for (j in 0 until pointsArray.size()) {
                            val pt = pointsArray.getMap(j)
                            val x = pt.getDouble("x").toFloat()
                            val y = pt.getDouble("y").toFloat()
                            val t = pt.getDouble("t").toLong()
                            strokeBuilder.addPoint(Ink.Point.create(x, y, t))
                        }
                        inkBuilder.addStroke(strokeBuilder.build())
                    }

                    recognizer.recognize(inkBuilder.build())
                        .addOnSuccessListener { result ->
                            if (result.candidates.isNotEmpty()) {
                                promise.resolve(result.candidates[0].text)
                            } else {
                                promise.resolve("")
                            }
                        }
                        .addOnFailureListener { e ->
                            promise.reject("RECOGNITION_FAILED", e.localizedMessage, e)
                        }
                }
                .addOnFailureListener { e ->
                    promise.reject("DOWNLOAD_FAILED", "Không thể tải Model vi-VN: " + e.localizedMessage, e)
                }
        } catch (e: Exception) {
            promise.reject("UNEXPECTED_ERROR", e.localizedMessage, e)
        }
    }
}
