import React from 'react';
import { X, Code2, Smartphone, Cpu, Layers, CheckCircle2, Copy } from 'lucide-react';

interface NativeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NativeGuideModal: React.FC<NativeGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const kotlinCode = `package com.padnote.ai.nativemodules

import com.facebook.react.bridge.*
import com.google.mlkit.vision.digitalink.*

class DigitalInkModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "DigitalInkModule"

    @ReactMethod
    onClickRecognizeVietnamese(strokesData: ReadableArray, promise: Promise) {
        val modelIdentifier = DigitalInkRecognitionModelIdentifier.fromLanguageTag("vi-VN") ?: return
        val model = DigitalInkRecognitionModel.builder(modelIdentifier).build()
        val recognizer = DigitalInkRecognition.getClient(
            DigitalInkRecognizerOptions.builder(model).build()
        )

        val inkBuilder = Ink.builder()
        for (i in 0 until strokesData.size()) {
            val strokeMap = strokesData.getMap(i)
            val pointsArray = strokeMap.getArray("points")
            val strokeBuilder = Ink.Stroke.builder()
            
            for (j in 0 until pointsArray.size()) {
                val pt = pointsArray.getMap(j)
                strokeBuilder.addPoint(
                    Ink.Point.create(pt.getDouble("x").toFloat(), pt.getDouble("y").toFloat(), pt.getDouble("t").toLong())
                )
            }
            inkBuilder.addStroke(strokeBuilder.build())
        }

        recognizer.recognize(inkBuilder.build())
            .addOnSuccessListener { result -> promise.resolve(result.candidates[0].text) }
            .addOnFailureListener { e -> promise.reject("RECOGNITION_ERROR", e.message) }
    }
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="glass-panel w-full max-w-3xl rounded-2xl p-6 border border-slate-700 shadow-2xl animate-pop space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-6 h-6 text-indigo-400" />
            <h3 className="text-lg font-bold text-white">Kiến Trúc Native Module Kotlin (Xiaomi Pad & ML Kit)</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
            <Smartphone className="w-5 h-5 text-indigo-400 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-white">1. Stylus Pointer API</h4>
              <p className="text-xs text-slate-400 mt-0.5">MotionEvent.TOOL_TYPE_STYLUS phân tách ngón tay & lòng bàn tay.</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
            <Cpu className="w-5 h-5 text-emerald-400 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-white">2. Skia GPU Engine</h4>
              <p className="text-xs text-slate-400 mt-0.5">Render 120Hz mượt mà qua @shopify/react-native-skia Canvas.</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
            <Layers className="w-5 h-5 text-amber-400 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-white">3. Offline ML Kit</h4>
              <p className="text-xs text-slate-400 mt-0.5">Model vi-VN nhận diện chữ Việt Nam không cần kết nối Internet.</p>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-300">File: android/app/src/main/java/com/padnote/ai/DigitalInkModule.kt</span>
            <button
              onClick={() => navigator.clipboard.writeText(kotlinCode)}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Code</span>
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-indigo-200 overflow-x-auto leading-relaxed max-h-64">
            <code>{kotlinCode}</code>
          </pre>
        </div>

        <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-indigo-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Hướng dẫn Build bản Native Android trên Xiaomi Pad:</span>
          </div>
          <p>1. Cài đặt Expo Dev Client: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-white">npx expo install expo-dev-client</code></p>
          <p>2. Build bản APK Android Studio: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-white">npx expo run:android</code></p>
        </div>
      </div>
    </div>
  );
};
