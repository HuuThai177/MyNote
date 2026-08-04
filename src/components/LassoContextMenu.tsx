import React from 'react';
import { 
  Sparkles, 
  Trash2, 
  Copy, 
  Type, 
  Bot,
  X
} from 'lucide-react';

interface LassoContextMenuProps {
  x: number;
  y: number;
  onConvertToText: () => void;
  onAiSummarize: () => void;
  onDeleteStrokes: () => void;
  onClose: () => void;
}

export const LassoContextMenu: React.FC<LassoContextMenuProps> = ({
  x,
  y,
  onConvertToText,
  onAiSummarize,
  onDeleteStrokes,
  onClose
}) => {
  return (
    <div
      className="fixed z-40 glass-toolbar px-3 py-2 rounded-2xl flex items-center gap-2 border border-slate-700 shadow-2xl animate-pop"
      style={{
        left: `${Math.min(window.innerWidth - 300, Math.max(20, x))}px`,
        top: `${Math.max(80, y - 60)}px`
      }}
    >
      {/* Convert to Vietnamese Handwriting Text */}
      <button
        onClick={onConvertToText}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-md shadow-indigo-600/30"
        title="Nhận diện chữ viết tay Tiếng Việt & Đổi Font"
      >
        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
        <span>Chuyển Thành Font Chữ</span>
      </button>

      {/* AI Summarize */}
      <button
        onClick={onAiSummarize}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600/40 hover:bg-purple-600/60 text-purple-200 border border-purple-500/40 text-xs font-semibold transition"
        title="AI Tóm tắt & Sửa lỗi chính tả nét chữ"
      >
        <Bot className="w-3.5 h-3.5 text-purple-300" />
        <span>AI Fix</span>
      </button>

      {/* Delete Selection */}
      <button
        onClick={onDeleteStrokes}
        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600/80 text-slate-300 hover:text-white transition"
        title="Xóa vùng nét vẽ khoanh chọn"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Close Menu */}
      <button
        onClick={onClose}
        className="p-2 rounded-xl text-slate-400 hover:text-white transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
