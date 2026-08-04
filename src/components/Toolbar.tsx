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
  ChevronDown
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
  '#000000', // Classic Ink
  '#6366f1', // Royal Indigo
  '#2563eb', // Vivid Blue
  '#059669', // Emerald
  '#e11d48', // Crimson Rose
  '#d97706', // Amber Gold
  '#9333ea', // Violet
  '#ffffff', // White (for Dark Mode)
];

const PEN_SIZES = [2, 4, 8, 14, 24];

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
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass-toolbar px-4 py-2.5 rounded-2xl flex items-center gap-3 z-30 shadow-2xl border border-slate-700/80 max-w-[95vw] overflow-x-auto">
      {/* Tools Group */}
      <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800">
        {/* Fountain Pen */}
        <button
          onClick={() => onSelectTool('pen')}
          className={`tool-btn ${currentTool === 'pen' ? 'active' : ''}`}
          title="Bút mực (Fountain Pen - Cảm ứng lực)"
        >
          <PenTool className="w-5 h-5" />
        </button>

        {/* Highlighter */}
        <button
          onClick={() => onSelectTool('highlighter')}
          className={`tool-btn ${currentTool === 'highlighter' ? 'active' : ''}`}
          title="Bút nhớ dạ quang (Highlighter)"
        >
          <Highlighter className="w-5 h-5" />
        </button>

        {/* Eraser */}
        <button
          onClick={() => onSelectTool('eraser-stroke')}
          className={`tool-btn ${currentTool === 'eraser-stroke' ? 'active' : ''}`}
          title="Cục tẩy nét (Stroke Eraser)"
        >
          <Eraser className="w-5 h-5" />
        </button>

        {/* Lasso Tool */}
        <button
          onClick={() => onSelectTool('lasso')}
          className={`tool-btn ${currentTool === 'lasso' ? 'active' : ''}`}
          title="Lasso Khoanh vùng chữ viết tay"
        >
          <Lasso className="w-5 h-5 text-indigo-400" />
        </button>

        {/* Text Input Tool */}
        <button
          onClick={() => onSelectTool('text')}
          className={`tool-btn ${currentTool === 'text' ? 'active' : ''}`}
          title="Chèn ô Text Font chữ đẹp"
        >
          <Type className="w-5 h-5" />
        </button>
      </div>

      <div className="h-7 w-px bg-slate-700/70" />

      {/* Smart Features Toggle */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleSmartShape}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
            smartShapeEnabled
              ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 shadow-md shadow-purple-500/20'
              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="Tự động nắn thẳng nét vẽ hình học (Giữ nguyên bút 0.5s)"
        >
          <Shapes className={`w-4 h-4 ${smartShapeEnabled ? 'text-purple-400' : ''}`} />
          <span className="hidden md:inline">Auto-Shape</span>
        </button>
      </div>

      <div className="h-7 w-px bg-slate-700/70" />

      {/* Color Palette */}
      <div className="relative">
        <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              onClick={() => onChangeColor(swatch)}
              className={`w-6 h-6 rounded-full border-2 transition transform hover:scale-110 ${
                color === swatch ? 'border-white scale-110 shadow-md shadow-indigo-500/50' : 'border-transparent opacity-80'
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>

      <div className="h-7 w-px bg-slate-700/70" />

      {/* Size Slider / Quick Picker */}
      <div className="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800">
        <Sliders className="w-4 h-4 text-slate-400 ml-1" />
        {PEN_SIZES.map((s) => (
          <button
            key={s}
            onClick={() => onChangeSize(s)}
            className={`w-7 h-7 rounded-lg text-xs font-bold transition flex items-center justify-center ${
              size === s ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="h-7 w-px bg-slate-700/70" />

      {/* Vietnamese Font Selector */}
      <div className="relative">
        <button
          onClick={() => setShowFontPicker(!showFontPicker)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/90 text-slate-200 border border-slate-700 text-xs font-medium hover:bg-slate-700 transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="truncate max-w-[100px] hidden sm:inline">
            {VIETNAMESE_HANDWRITING_FONTS.find(f => f.family === fontFamily)?.name.split(' ')[0] || 'Font'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {showFontPicker && (
          <div className="absolute bottom-14 right-0 w-64 glass-panel rounded-2xl p-2 z-40 border border-slate-700 shadow-2xl animate-pop">
            <div className="text-xs font-semibold text-slate-400 px-3 py-1.5 border-b border-slate-800">
              Font Viết Tay Tiếng Việt AI
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
                    fontFamily === font.family ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span className="text-xs font-semibold">{font.name}</span>
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
