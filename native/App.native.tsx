import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, NativeModules } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';

const { DigitalInkModule } = NativeModules;

export default function PadNoteNativeApp() {
  const [recognizedText, setRecognizedText] = useState<string>('');

  const handleRecognizeHandwriting = async (strokes: any[]) => {
    try {
      if (DigitalInkModule) {
        const text = await DigitalInkModule.recognizeVietnameseHandwriting(strokes);
        setRecognizedText(text);
      } else {
        setRecognizedText('Native Module ML Kit chưa kết nối (Hãy chạy Expo Dev Client).');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PadNote AI - Native Xiaomi Pad Engine</Text>
        {recognizedText ? <Text style={styles.textOutput}>Kết quả: {recognizedText}</Text> : null}
      </View>
      <Canvas style={styles.canvas}>
        {/* GPU Skia Paths Rendered Here */}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 20, paddingTop: 50, backgroundColor: '#1e293b' },
  title: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  textOutput: { color: '#818cf8', fontSize: 16, marginTop: 8 },
  canvas: { flex: 1 }
});
