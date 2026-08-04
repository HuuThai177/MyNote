import React, { useState, useEffect } from 'react';
import { Sparkles, Check, X, Type, Edit3, Mic, Plus, CheckCircle2, BookMarked } from 'lucide-react';
import { VIETNAMESE_HANDWRITING_FONTS } from '../types/notebook';
import { VietnameseInkRecognizer } from '../engine/VietnameseInkRecognizer';

interface InkToTextModalProps {
  isOpen: boolean;
  initialText: string;
  suggestions?: string[];
  fontFamily: string;
  onConfirm: (finalText: string, selectedFont: string) => void;
  onClose: () => void;
}

export const InkToTextModal: React.FC<InkToTextModalProps> = ({
  isOpen,
  initialText,
  suggestions = [],
  fontFamily: initialFont,
  onConfirm,
  onClose
}) => {
  const [text, setText] = useState(initialText);
  const [selectedFont, setSelectedFont] = useState(initialFont);
  const [isListening, setIsListening] = useState(false);
  const [customWordInput, setCustomWordInput] = useState('');
  const [showAddWord, setShowAddWord] = useState(false);
  const [dictionaryList, setDictionaryList] = useState<string[]>([]);

  useEffect(() => {
    setText(initialText);
    setDictionaryList(VietnameseInkRecognizer.getUserDictionary());
  }, [initialText, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onConfirm(text.trim(), selectedFont);
  };

  // Add new custom word to dictionary
  const handleAddCustomWord = () => {
    if (!customWordInput.trim()) return;
    const word = customWordInput.trim();
    VietnameseInkRecognizer.addWordToDictionary(word);
    setDictionaryList(VietnameseInkRecognizer.getUserDictionary());
    setText(word);
    setCustomWordInput('');
    setShowAddWord(false);
  };

  // Voice Assistant (Speech to Text)
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Trình duyệt của bạn không hỗ trợ Speech Recognition. Bạn có thể gõ trực tiếp chữ vào ô bên dưới!');
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
      recognition.interimResults = false;

      setIsListening(true);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setText(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.start();
    } catch (e) {
      setIsListening(false);
      alert('Vui lòng cấp quyền Microphone để sử dụng tính năng Đọc Viết Chữ!');
    }
  };

  const allSuggestions = Array.from(new Set([
    ...dictionaryList,
    ...suggestions,
    'Thái',
    'Ghi chú',
    'Học tập',
    'Công việc',
    'Kế hoạch'
  ]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <form onSubmit={handleSubmit} className="glass-panel w-full max-w-lg rounded-2xl p-6 border border-slate-700 shadow-2xl animate-pop space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-base">
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
            <span>Nhận Diện & Chuyển Đổi Chữ Viết Tay AI</span>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Text Input & Voice Input Button */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Nhập / Sửa chữ Tiếng Việt chính xác 100%:
            </label>
            <button
              type="button"
              onClick={handleVoiceInput}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                isListening
                  ? 'bg-rose-600 text-white border-rose-400 animate-pulse shadow-md shadow-rose-600/40'
                  : 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/50'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{isListening ? 'Đang lắng nghe...' : '🎤 Giọng Nói ➔ Chữ'}</span>
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nhập chính xác chữ bạn viết..."
              autoFocus
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border-2 border-indigo-500 text-white font-bold text-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/30 shadow-inner"
            />
            {text && (
              <button
                type="button"
                onClick={() => setText('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Live Font Preview Box */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-400">Xem trước nét chữ viết tay Tiếng Việt:</span>
            <span className="text-[11px] text-indigo-400 font-medium">{selectedFont.split(',')[0]}</span>
          </div>
          <div
            className="text-3xl text-indigo-300 truncate py-1 font-normal"
            style={{ fontFamily: selectedFont }}
          >
            {text || 'Nét chữ mẫu'}
          </div>
        </div>

        {/* Custom Candidate Chips & Add Word Trigger */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-300">Bảng gợi ý từ vựng 1-chạm:</span>
            <button
              type="button"
              onClick={() => setShowAddWord(!showAddWord)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm từ mới</span>
            </button>
          </div>

          {showAddWord && (
            <div className="flex items-center gap-2 mb-2 bg-slate-900 p-2 rounded-xl border border-indigo-500/40">
              <input
                type="text"
                value={customWordInput}
                onChange={(e) => setCustomWordInput(e.target.value)}
                placeholder="Nhập tên riêng/từ mới..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustomWord}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs"
              >
                Thêm
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {allSuggestions.map(sugg => (
              <button
                key={sugg}
                type="button"
                onClick={() => setText(sugg)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1 ${
                  text === sugg
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {text === sugg && <Check className="w-3.5 h-3.5 text-amber-300" />}
                <span>{sugg}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Font Family Selector */}
        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1.5">Kiểu Font chữ nghệ thuật Tiếng Việt:</label>
          <select
            value={selectedFont}
            onChange={(e) => setSelectedFont(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm font-semibold focus:outline-none focus:border-indigo-500"
          >
            {VIETNAMESE_HANDWRITING_FONTS.map(f => (
              <option key={f.family} value={f.family}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
          >
            Hủy
          </button>

          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Chấp Nhận & Đổi Font</span>
          </button>
        </div>
      </form>
    </div>
  );
};
