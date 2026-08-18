import React from 'react';
import { Sparkles, Trash2, X, ZoomIn, ZoomOut, Move, Loader2 } from 'lucide-react';

interface LassoContextMenuProps {
  x: number;
  y: number;
  onConvertToText: () => void;
  /** Đang gọi dịch vụ nhận diện — đây là một request mạng, không tức thì */
  isRecognizing: boolean;
  /** Chỉ nhận diện được khi vùng khoanh có nét viết tay */
  canRecognize: boolean;
  onDeleteStrokes: () => void;
  onScaleSelected: (factor: number) => void;
  onClose: () => void;
}

export const LassoContextMenu: React.FC<LassoContextMenuProps> = ({
  x,
  y,
  onConvertToText,
  isRecognizing,
  canRecognize,
  onDeleteStrokes,
  onScaleSelected,
  onClose
}) => {
  return (
    <div
      className="chrome-bar chrome-bar-float fixed z-40 px-2 py-1.5 rounded-2xl flex items-center gap-1.5 border animate-pop select-none"
      style={{
        left: `${Math.min(window.innerWidth - 340, Math.max(20, x))}px`,
        top: `${Math.max(80, y - 60)}px`
      }}
    >
      {/* Nhắc thao tác kéo */}
      <div
        className="flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1.5 rounded-lg border border-indigo-100"
        title="Kéo trực tiếp vào vùng khoanh để di chuyển đối tượng"
      >
        <Move className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Kéo để di chuyển</span>
      </div>

      <div className="chrome-group flex items-center p-0.5">
        <button
          onClick={() => onScaleSelected(0.85)}
          className="chrome-btn w-8 h-8"
          title="Thu nhỏ vùng chọn (-15%)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => onScaleSelected(1.15)}
          className="chrome-btn w-8 h-8"
          title="Phóng to vùng chọn (+15%)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={onConvertToText}
        disabled={isRecognizing || !canRecognize}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-sm disabled:opacity-40"
        title={
          canRecognize
            ? 'Nhận diện chữ viết tay Tiếng Việt & đổi thành font chữ'
            : 'Vùng khoanh không có nét viết tay nào để nhận diện'
        }
      >
        {isRecognizing ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Đang nhận diện…</span>
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Nhận diện chữ</span>
          </>
        )}
      </button>

      <button
        onClick={onDeleteStrokes}
        className="chrome-btn w-8 h-8 hover:bg-rose-50 hover:text-rose-600"
        title="Xoá vùng nét vẽ đã khoanh"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <button onClick={onClose} className="chrome-btn w-8 h-8" title="Đóng">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
