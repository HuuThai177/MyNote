import React from 'react';
import { 
  Sparkles, 
  Trash2, 
  Bot,
  X,
  ZoomIn,
  ZoomOut,
  Move
} from 'lucide-react';

interface LassoContextMenuProps {
  x: number;
  y: number;
  onConvertToText: () => void;
  onAiSummarize: () => void;
  onDeleteStrokes: () => void;
  onScaleSelected: (factor: number) => void;
  onClose: () => void;
}

export const LassoContextMenu: React.FC<LassoContextMenuProps> = ({
  x,
  y,
  onConvertToText,
  onAiSummarize,
  onDeleteStrokes,
  onScaleSelected,
  onClose
}) => {
  return (
    <div
      className="fixed z-40 glass-toolbar px-3 py-2 rounded-2xl flex items-center gap-2 border border-slate-700 shadow-2xl animate-pop select-none"
      style={{
        left: `${Math.min(window.innerWidth - 380, Math.max(20, x))}px`,
        top: `${Math.max(80, y - 60)}px`
      }}
    >
      {/* Move Hint */}
      <div 
        className="flex items-center gap-1 text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1.5 rounded-xl border border-indigo-500/20"
        title="Kéo trực tiếp vào vùng khoanh để di chuyển đối tượng"
      >
        <Move className="w-3.5 h-3.5" />
        <span>Kéo di chuyển</span>
      </div>

      {/* Scale Up (+15%) */}
      <button
        onClick={() => onScaleSelected(1.15)}
        className="p-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition flex items-center gap-1 text-xs font-bold"
        title="Phóng to đối tượng được khoanh chọn (+15%)"
      >
        <ZoomIn className="w-4 h-4 text-indigo-400" />
      </button>

      {/* Scale Down (-15%) */}
      <button
        onClick={() => onScaleSelected(0.85)}
        className="p-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition flex items-center gap-1 text-xs font-bold"
        title="Thu nhỏ đối tượng được khoanh chọn (-15%)"
      >
        <ZoomOut className="w-4 h-4 text-indigo-400" />
      </button>

      <div className="h-4 w-px bg-slate-700 mx-0.5" />

      {/* Convert to Vietnamese Handwriting Text */}
      <button
        onClick={onConvertToText}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-md shadow-indigo-600/30"
        title="Nhận diện chữ viết tay Tiếng Việt & Đổi Font"
      >
        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
        <span>Đổi Font Chữ</span>
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
