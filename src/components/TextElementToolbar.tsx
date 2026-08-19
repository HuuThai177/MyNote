import React, { useEffect, useRef, useState } from 'react';
import {
  Grip,
  Minus,
  Plus,
  Trash2,
  PenLine,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
  Check,
  ListChecks
} from 'lucide-react';
import { TextElement, TextAlign, VIETNAMESE_HANDWRITING_FONTS } from '../types/notebook';

interface TextElementToolbarProps {
  element: TextElement;
  isInkTarget: boolean;
  onPatch: (patch: Partial<TextElement>, coalesceKey?: string) => void;
  onStartDrag: (e: React.PointerEvent) => void;
  onRequestInkInput: () => void;
  /** Bật/tắt ô chọn ở dòng đang đặt con trỏ */
  onToggleCheckbox: () => void;
  onDelete: () => void;
}

const TEXT_COLORS = [
  '#1e293b', '#4f46e5', '#2563eb', '#059669',
  '#e11d48', '#d97706', '#9333ea', '#ffffff'
];

const ALIGNMENTS: { value: TextAlign; icon: React.ElementType; label: string }[] = [
  { value: 'left', icon: AlignLeft, label: 'Canh trái' },
  { value: 'center', icon: AlignCenter, label: 'Canh giữa' },
  { value: 'right', icon: AlignRight, label: 'Canh phải' }
];

/**
 * Thanh công cụ nổi của khung chữ đang chọn.
 *
 * Trước đây font, cỡ chữ và màu chỉ được gán MỘT LẦN lúc tạo khung; bộ chọn
 * font trên thanh công cụ chính chỉ đổi mặc định cho khung mới nên không có
 * cách nào sửa khung đã có. Mọi điều khiển ở đây tác động thẳng vào phần tử.
 */
export const TextElementToolbar: React.FC<TextElementToolbarProps> = ({
  element,
  isInkTarget,
  onPatch,
  onStartDrag,
  onRequestInkInput,
  onToggleCheckbox,
  onDelete
}) => {
  const [openPanel, setOpenPanel] = useState<'font' | 'color' | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openPanel) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenPanel(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openPanel]);

  const currentAlign: TextAlign = element.textAlign ?? 'left';
  const fontLabel =
    VIETNAMESE_HANDWRITING_FONTS.find(f => f.family === element.fontFamily)?.name.split(' (')[0] ?? 'Font';

  return (
    <div
      ref={rootRef}
      className="chrome-bar chrome-bar-float absolute -top-12 left-0 px-1.5 py-1 rounded-xl flex items-center gap-1 z-30 border animate-pop whitespace-nowrap"
    >
      {/* Kéo di chuyển */}
      <div
        onPointerDown={onStartDrag}
        className="flex items-center px-1.5 cursor-grab active:cursor-grabbing text-indigo-600 hover:text-indigo-800"
        title="Giữ và kéo để di chuyển khung chữ"
      >
        <Grip className="w-4 h-4" />
      </div>

      <div className="h-4 w-px bg-slate-200" />

      {/* Chọn font */}
      <div className="relative">
        <button
          onClick={() => setOpenPanel(openPanel === 'font' ? null : 'font')}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-slate-100 text-[11px] font-bold text-slate-700 transition"
          title="Đổi font chữ của khung này"
        >
          <span className="max-w-[70px] truncate" style={{ fontFamily: element.fontFamily }}>
            {fontLabel}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {openPanel === 'font' && (
          <div className="chrome-bar chrome-bar-float absolute top-9 left-0 w-64 rounded-xl p-1.5 border z-40 animate-pop">
            {VIETNAMESE_HANDWRITING_FONTS.map(font => (
              <button
                key={font.family}
                onClick={() => {
                  onPatch({ fontFamily: font.family });
                  setOpenPanel(null);
                }}
                className={`w-full text-left px-2.5 py-2 rounded-lg transition flex items-center justify-between gap-2 ${
                  element.fontFamily === font.family
                    ? 'bg-indigo-50 ring-1 ring-indigo-200'
                    : 'hover:bg-slate-50'
                }`}
              >
                <span className="text-base truncate" style={{ fontFamily: font.family }}>
                  {font.name.split(' (')[0]}
                </span>
                {element.fontFamily === font.family && (
                  <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-slate-200" />

      {/* Cỡ chữ */}
      <button
        onClick={() => onPatch({ fontSize: Math.max(10, element.fontSize - 2) }, `font-${element.id}`)}
        className="chrome-btn w-7 h-7"
        title="Thu nhỏ cỡ chữ"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="text-[11px] font-bold text-slate-600 w-6 text-center tabular-nums">
        {element.fontSize}
      </span>
      <button
        onClick={() => onPatch({ fontSize: Math.min(96, element.fontSize + 2) }, `font-${element.id}`)}
        className="chrome-btn w-7 h-7"
        title="Phóng to cỡ chữ"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      <div className="h-4 w-px bg-slate-200" />

      {/* Canh lề */}
      <div className="flex items-center gap-0.5">
        {ALIGNMENTS.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            onClick={() => onPatch({ textAlign: value })}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
              currentAlign === value
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title={label}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-slate-200" />

      {/* Màu chữ */}
      <div className="relative">
        <button
          onClick={() => setOpenPanel(openPanel === 'color' ? null : 'color')}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition"
          title="Đổi màu chữ"
        >
          <span
            className="w-4 h-4 rounded-full ring-1 ring-slate-300"
            style={{ backgroundColor: element.color }}
          />
        </button>

        {openPanel === 'color' && (
          <div className="chrome-bar chrome-bar-float absolute top-9 right-0 rounded-xl p-2 border z-40 animate-pop grid grid-cols-4 gap-1.5">
            {TEXT_COLORS.map(hex => (
              <button
                key={hex}
                onClick={() => {
                  onPatch({ color: hex });
                  setOpenPanel(null);
                }}
                className={`w-6 h-6 rounded-full transition hover:scale-110 ${
                  element.color === hex ? 'ring-2 ring-indigo-600 ring-offset-1' : 'ring-1 ring-slate-300'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-slate-200" />

      {/* Ô chọn việc cần làm */}
      <button
        onClick={onToggleCheckbox}
        className="chrome-btn w-7 h-7"
        title="Thêm / tick ô chọn ở dòng đang đặt con trỏ"
      >
        <ListChecks className="w-3.5 h-3.5" />
      </button>

      <div className="h-4 w-px bg-slate-200" />

      {/* Viết tay điền chữ */}
      <button
        onClick={onRequestInkInput}
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold border transition ${
          isInkTarget
            ? 'bg-amber-500 text-white border-amber-400'
            : 'bg-white text-indigo-700 border-slate-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600'
        }`}
        title="Viết tay bên ngoài để tự động điền chữ Tiếng Việt vào khung này"
      >
        <PenLine className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={onDelete}
        className="chrome-btn w-7 h-7 hover:bg-rose-50 hover:text-rose-600"
        title="Xoá khung chữ này"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
