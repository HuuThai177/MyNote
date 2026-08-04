import React, { useState } from 'react';
import { 
  PenTool, 
  Highlighter, 
  Eraser, 
  Lasso, 
  Sparkles, 
  Type, 
  Shapes,
  Palette,
  Sliders,
  ChevronDown,
  Check
} from 'lucide-react';
import { ToolType, VIETNAMESE_HANDWRITING_FONTS } from '../types/notebook';

interface ToolbarProps {
  currentTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  color: string;
  onChangeColor: (color: string) => void;
  size: number;
  onChangeSize: (size: number) => void;
  fontFamily: string;
  onChangeFontFamily: (font: string) => void;
  smartShapeEnabled: boolean;
  onToggleSmartShape: () => void;
}

const COLOR_SWATCHES = [
  { name: 'Đen Mực', hex: '#000000' },
  { name: 'Xanh Indigo', hex: '#6366f1' },
  { name: 'Xanh Dương', hex: '#2563eb' },
  { name: 'Xanh Lá Emerald', hex: '#059669' },
  { name: 'Đỏ Hồng Crimson', hex: '#e11d48' },
  { name: 'Cam Amber', hex: '#d97706' },
  { name: 'Tím Violet', hex: '#9333ea' },
  { name: 'Trắng Neon', hex: '#ffffff' }
];

const PEN_SIZES = [
  { label: '0.3mm', val: 2 },
  { label: '0.5mm', val: 4 },
  { label: '0.8mm', val: 8 },
  { label: '1.2mm', val: 14 },
  { label: '2.0mm', val: 24 }
];

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  onSelectTool,
  color,
  onChangeColor,
  size,
  onChangeSize,
  fontFamily,
  onChangeFontFamily,
  smartShapeEnabled,
  onToggleSmartShape
}) => {
  const [showFontPicker, setShowFontPicker] = useState(false);

  return (
    <div className="w-full glass-toolbar px-4 py-2 flex flex-wrap items-center justify-between gap-3 z-30 border-b border-slate-700/60 shadow-lg">
      {/* 1. GoodNotes Main Tool Selector */}
      <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-2xl border border-slate-800 shadow-inner">
        {/* Fountain Pen */}
        <button
          onClick={() => onSelectTool('pen')}
          className={`tool-btn ${currentTool === 'pen' ? 'active' : ''}`}
          title="Bút Mực (Fountain Pen - Cảm ứng lực Xiaomi Pen)"
        >
          <PenTool className="w-5 h-5" />
        </button>

        {/* Highlighter */}
        <button
          onClick={() => onSelectTool('highlighter')}
          className={`tool-btn ${currentTool === 'highlighter' ? 'active' : ''}`}
          title="Bút Dạ Quang Tô Chữ (Highlighter)"
        >
          <Highlighter className="w-5 h-5" />
        </button>

        {/* Eraser */}
        <button
          onClick={() => onSelectTool('eraser-stroke')}
          className={`tool-btn ${currentTool === 'eraser-stroke' ? 'active' : ''}`}
          title="Cục Tẩy Nét (Stroke Eraser)"
        >
          <Eraser className="w-5 h-5" />
        </button>

        {/* Lasso Tool */}
        <button
          onClick={() => onSelectTool('lasso')}
          className={`tool-btn ${currentTool === 'lasso' ? 'active' : ''}`}
          title="Lasso Khoanh Vùng AI Nhận Diện Chữ Viết Tay"
        >
          <Lasso className="w-5 h-5 text-indigo-400" />
        </button>

        {/* Text Input */}
        <button
          onClick={() => onSelectTool('text')}
          className={`tool-btn ${currentTool === 'text' ? 'active' : ''}`}
          title="Chèn Khung Text Font Chữ Đẹp"
        >
          <Type className="w-5 h-5" />
        </button>
      </div>

      {/* 2. Smart Features (Auto-Shape & AI Ink-to-Text) */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSmartShape}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition border ${
            smartShapeEnabled
              ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 shadow-md shadow-purple-500/20'
              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="Tự động nắn thẳng nét vẽ hình học khi giữ nguyên bút 0.5s"
        >
          <Shapes className={`w-4 h-4 ${smartShapeEnabled ? 'text-purple-400 animate-pulse' : ''}`} />
          <span className="hidden sm:inline">Smart Auto-Shape</span>
        </button>
      </div>

      {/* 3. Preset Color Palette Swatches */}
      <div className="flex items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800">
        <Palette className="w-4 h-4 text-slate-400 ml-1 hidden lg:block" />
        {COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch.hex}
            onClick={() => onChangeColor(swatch.hex)}
            className={`w-6 h-6 rounded-full border-2 transition transform hover:scale-110 flex items-center justify-center ${
              color === swatch.hex ? 'border-white scale-110 shadow-md shadow-indigo-500/60 ring-2 ring-indigo-500/40' : 'border-transparent opacity-85'
            }`}
            style={{ backgroundColor: swatch.hex }}
            title={swatch.name}
          >
            {color === swatch.hex && <Check className={`w-3.5 h-3.5 ${swatch.hex === '#ffffff' ? 'text-slate-900' : 'text-white'}`} />}
          </button>
        ))}
      </div>

      {/* 4. GoodNotes Pen Thickness Selector */}
      <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-2xl border border-slate-800">
        <Sliders className="w-4 h-4 text-slate-400 ml-1.5 hidden md:block" />
        {PEN_SIZES.map((s) => (
          <button
            key={s.val}
            onClick={() => onChangeSize(s.val)}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition ${
              size === s.val
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 5. Vietnamese Font Family Selector */}
      <div className="relative">
        <button
          onClick={() => setShowFontPicker(!showFontPicker)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/90 text-slate-200 border border-slate-700 text-xs font-semibold hover:bg-slate-700 transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="truncate max-w-[110px]">
            {VIETNAMESE_HANDWRITING_FONTS.find(f => f.family === fontFamily)?.name.split(' ')[0] || 'Font'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {showFontPicker && (
          <div className="absolute top-12 right-0 w-72 glass-panel rounded-2xl p-2 z-40 border border-slate-700 shadow-2xl animate-pop">
            <div className="text-xs font-bold text-slate-400 px-3 py-1.5 border-b border-slate-800">
              Font Viết Tay Tiếng Việt AI (GoodNotes Style)
            </div>
            <div className="mt-1 space-y-1">
              {VIETNAMESE_HANDWRITING_FONTS.map((font) => (
                <button
                  key={font.family}
                  onClick={() => {
                    onChangeFontFamily(font.family);
                    setShowFontPicker(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl transition flex flex-col ${
                    fontFamily === font.family ? 'bg-indigo-600/40 text-indigo-200 border border-indigo-500/50' : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span className="text-xs font-bold">{font.name}</span>
                  <span className="text-base truncate opacity-90 mt-0.5" style={{ fontFamily: font.family }}>
                    {font.previewText}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
