import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
  Move,
  Loader2,
  Copy,
  CopyPlus,
  GraduationCap
} from 'lucide-react';

interface LassoContextMenuProps {
  /** Tâm ngang của vùng khoanh, toạ độ màn hình */
  x: number;
  /** Mép trên và mép dưới của vùng khoanh, để menu biết nên đặt trên hay dưới */
  top: number;
  bottom: number;
  onConvertToText: () => void;
  /** Đang gọi dịch vụ nhận diện — đây là một request mạng, không tức thì */
  isRecognizing: boolean;
  /** Chỉ nhận diện được khi vùng khoanh có nét viết tay */
  canRecognize: boolean;
  onCreateFlashcard: () => void;
  isCreatingFlashcard: boolean;
  onCopy: () => void;
  onDuplicate: () => void;
  onDeleteStrokes: () => void;
  onScaleSelected: (factor: number) => void;
  onClose: () => void;
}

const MARGIN = 12;
const GAP = 10;

export const LassoContextMenu: React.FC<LassoContextMenuProps> = ({
  x,
  top,
  bottom,
  onConvertToText,
  isRecognizing,
  canRecognize,
  onCreateFlashcard,
  isCreatingFlashcard,
  onCopy,
  onDuplicate,
  onDeleteStrokes,
  onScaleSelected,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);

  /**
   * Đo kích thước THẬT của menu rồi mới đặt vị trí.
   *
   * Bản trước kẹp theo một bề rộng đoán cứng 340px, trong khi menu đã phình lên
   * gần gấp đôi vì thêm nút "Tạo thẻ" và cụm sao chép — nên khoanh vùng sát mép
   * phải là menu tràn ra ngoài màn hình, mất luôn nút Xoá và Đóng. Thêm nữa,
   * `left` nhận thẳng TÂM vùng khoanh làm mép trái nên menu luôn lệch hẳn sang
   * phải thay vì nằm giữa vùng chọn.
   */
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) return;

    const place = () => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;

      // Canh giữa theo vùng khoanh rồi kẹp vào trong màn hình
      const left = Math.max(
        MARGIN,
        Math.min(x - width / 2, window.innerWidth - width - MARGIN)
      );

      // Ưu tiên đặt phía trên vùng khoanh; không đủ chỗ thì lật xuống dưới
      const above = top - GAP - height;
      const below = bottom + GAP;
      const nextTop =
        above >= MARGIN
          ? above
          : below + height <= window.innerHeight - MARGIN
            ? below
            : Math.max(MARGIN, window.innerHeight - height - MARGIN);

      setPlacement({ left, top: nextTop });
    };

    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [x, top, bottom]);

  return (
    <div
      ref={menuRef}
      className="chrome-bar chrome-bar-float fixed z-40 px-2 py-1.5 rounded-2xl flex flex-wrap items-center justify-center gap-1.5 border animate-pop select-none"
      style={{
        // Màn hình hẹp thì menu tự xuống dòng thay vì bị cắt mất nút
        maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
        left: placement ? `${placement.left}px` : '-9999px',
        top: placement ? `${placement.top}px` : '-9999px'
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
        onClick={onCreateFlashcard}
        disabled={isCreatingFlashcard}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-emerald-700 border border-slate-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 font-bold text-xs transition disabled:opacity-60"
        title="Tạo thẻ ôn tập: mặt trước là chính nét chữ này"
      >
        {isCreatingFlashcard ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <GraduationCap className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">Tạo thẻ</span>
      </button>

      <div className="chrome-group flex items-center p-0.5">
        <button
          onClick={onCopy}
          className="chrome-btn w-8 h-8"
          title="Sao chép vùng chọn (Ctrl + C) — dán được sang trang khác, sổ tay khác"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          onClick={onDuplicate}
          className="chrome-btn w-8 h-8"
          title="Nhân bản tại chỗ (Ctrl + D)"
        >
          <CopyPlus className="w-4 h-4" />
        </button>
      </div>

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
