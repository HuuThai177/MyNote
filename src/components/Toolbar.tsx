import React, { useEffect, useRef, useState } from 'react';
import { PenPresets, PenPreset } from '../engine/PenPresets';
import {
  PenTool,
  Highlighter,
  Eraser,
  Lasso,
  Type,
  Shapes,
  ChevronDown,
  Check,
  PanelTopClose,
  PanelTopOpen,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  StretchHorizontal,
  Scan,
  MousePointer2,
  Pipette,
  Star,
  Plus,
  X,
  Ruler
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
  /** Hiện thước kẻ vật lý trên trang giấy */
  rulerEnabled: boolean;
  onToggleRuler: () => void;
  // Điều khiển khung nhìn (chuyển từ header sang đây cho đúng nhóm chức năng)
  palmRejectionActive: boolean;
  onTogglePalmRejection: () => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
}

const COLOR_SWATCHES = [
  { name: 'Đen Mực', hex: '#1e293b' },
  { name: 'Xanh Indigo', hex: '#4f46e5' },
  { name: 'Xanh Dương', hex: '#2563eb' },
  { name: 'Xanh Lá', hex: '#059669' },
  { name: 'Đỏ Hồng', hex: '#e11d48' },
  { name: 'Cam Amber', hex: '#d97706' },
  { name: 'Tím Violet', hex: '#9333ea' },
  { name: 'Trắng Neon', hex: '#ffffff' }
];

const PEN_SIZES = [
  { label: '0.3', val: 2 },
  { label: '0.5', val: 4 },
  { label: '0.8', val: 8 },
  { label: '1.2', val: 14 },
  { label: '2.0', val: 24 }
];

const ERASER_SIZES = [
  { label: 'Nhỏ', val: 6 },
  { label: 'Vừa', val: 14 },
  { label: 'Lớn', val: 26 }
];

const TOOLS: { id: ToolType; icon: React.ElementType; title: string }[] = [
  { id: 'pen', icon: PenTool, title: 'Bút mực — cảm ứng lực Xiaomi Pen' },
  { id: 'highlighter', icon: Highlighter, title: 'Bút dạ quang tô chữ' },
  { id: 'eraser-stroke', icon: Eraser, title: 'Cục tẩy nét' },
  { id: 'lasso', icon: Lasso, title: 'Khoanh vùng — nhận diện chữ, di chuyển, phóng to' },
  { id: 'text', icon: Type, title: 'Chèn khung chữ' }
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
  onToggleSmartShape,
  rulerEnabled,
  onToggleRuler,
  palmRejectionActive,
  onTogglePalmRejection,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitWidth,
  onFitPage
}) => {
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [presets, setPresets] = useState<PenPreset[]>(() => PenPresets.load());
  const [recentColors, setRecentColors] = useState<string[]>(() => PenPresets.loadRecentColors());
  const colorPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showColorPanel) return;
    const close = (e: MouseEvent) => {
      if (!colorPanelRef.current?.contains(e.target as Node)) setShowColorPanel(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showColorPanel]);

  const applyCustomColor = (hex: string) => {
    onChangeColor(hex);
    setRecentColors(prev => PenPresets.pushRecentColor(prev, hex));
  };

  const applyPreset = (preset: PenPreset) => {
    onSelectTool(preset.tool);
    onChangeColor(preset.color);
    onChangeSize(preset.size);
  };

  const savePreset = () => {
    setPresets(prev => PenPresets.add(prev, { tool: currentTool, color, size }));
  };

  const [isCollapsed, setIsCollapsed] = useState(false);
  const fontPickerRef = useRef<HTMLDivElement | null>(null);

  // Bấm ra ngoài để đóng danh sách font
  useEffect(() => {
    if (!showFontPicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!fontPickerRef.current?.contains(event.target as Node)) setShowFontPicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFontPicker]);

  // Chỉ hiện tuỳ chọn liên quan tới công cụ đang chọn — đây là điểm chính giúp
  // thanh công cụ không còn tràn xuống nhiều dòng như trước.
  const showColors = currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'text';
  const showPenSizes = currentTool === 'pen' || currentTool === 'highlighter';
  const showEraserSizes = currentTool === 'eraser-stroke';
  const showSmartShape = currentTool === 'pen' || currentTool === 'highlighter';
  const showFonts = currentTool === 'text';

  if (isCollapsed) {
    return (
      <div className="absolute top-16 right-4 z-40 animate-pop">
        <button
          onClick={() => setIsCollapsed(false)}
          className="chrome-bar chrome-bar-float flex items-center gap-1.5 px-3 py-2 rounded-xl border text-slate-700 hover:text-indigo-700 font-bold text-xs transition"
          title="Hiện lại thanh công cụ"
        >
          <PanelTopOpen className="w-4 h-4 text-indigo-600" />
          <span>Thanh công cụ</span>
        </button>
      </div>
    );
  }

  return (
    <div className="chrome-bar chrome-bar-top w-full border-b px-3 py-2 flex items-center gap-3 z-30 shrink-0 relative">
      {/* ---------- 1. Công cụ vẽ ---------- */}
      <div className="chrome-group flex items-center gap-0.5 p-1 shrink-0">
        {TOOLS.map(({ id, icon: Icon, title }) => (
          <button
            key={id}
            onClick={() => onSelectTool(id)}
            className={`tool-btn ${currentTool === id ? 'active' : ''}`}
            title={title}
          >
            <Icon className="w-[19px] h-[19px]" />
          </button>
        ))}
      </div>

      {/* ---------- 2. Tuỳ chọn theo công cụ đang chọn ---------- */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5 overflow-x-auto">
        {showColors && (
          <div className="chrome-group flex items-center gap-1 px-2 py-1.5 shrink-0">
            {COLOR_SWATCHES.map(swatch => (
              <button
                key={swatch.hex}
                onClick={() => onChangeColor(swatch.hex)}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition transform hover:scale-110 ${
                  color === swatch.hex
                    ? 'ring-2 ring-indigo-600 ring-offset-2 ring-offset-slate-50 scale-105'
                    : 'ring-1 ring-slate-300'
                }`}
                style={{ backgroundColor: swatch.hex }}
                title={swatch.name}
              >
                {color === swatch.hex && (
                  <Check
                    className={`w-3.5 h-3.5 ${
                      swatch.hex === '#ffffff' ? 'text-slate-900' : 'text-white'
                    }`}
                  />
                )}
              </button>
            ))}

            {/* Màu tuỳ ý */}
            <div className="relative" ref={colorPanelRef}>
              <button
                onClick={() => setShowColorPanel(!showColorPanel)}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition hover:scale-110 ${
                  COLOR_SWATCHES.some(sw => sw.hex === color)
                    ? 'ring-1 ring-slate-300 bg-white'
                    : 'ring-2 ring-indigo-600 ring-offset-2 ring-offset-slate-50'
                }`}
                style={
                  COLOR_SWATCHES.some(sw => sw.hex === color) ? undefined : { backgroundColor: color }
                }
                title="Chọn màu tuỳ ý"
              >
                {COLOR_SWATCHES.some(sw => sw.hex === color) && (
                  <Pipette className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>

              {showColorPanel && (
                <div className="chrome-bar chrome-bar-float absolute top-10 left-0 w-56 rounded-2xl p-3 z-40 border animate-pop space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1.5">
                      Chọn màu bất kỳ
                    </label>
                    <input
                      type="color"
                      value={color}
                      onChange={e => applyCustomColor(e.target.value)}
                      className="w-full h-10 rounded-lg border border-slate-200 cursor-pointer bg-white"
                    />
                  </div>

                  {recentColors.length > 0 && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1.5">
                        Vừa dùng
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {recentColors.map(hex => (
                          <button
                            key={hex}
                            onClick={() => applyCustomColor(hex)}
                            className={`w-6 h-6 rounded-full transition hover:scale-110 ${
                              color.toLowerCase() === hex ? 'ring-2 ring-indigo-600 ring-offset-1' : 'ring-1 ring-slate-300'
                            }`}
                            style={{ backgroundColor: hex }}
                            title={hex}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bút yêu thích */}
        <div className="chrome-group flex items-center gap-1 px-1.5 py-1 shrink-0">
          <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          {presets.map(preset => {
            const isActive =
              preset.tool === currentTool && preset.color === color && preset.size === size;
            return (
              <div key={preset.id} className="relative group">
                <button
                  onClick={() => applyPreset(preset)}
                  className={`w-6 h-6 rounded-md flex items-center justify-center transition hover:scale-110 ${
                    isActive ? 'ring-2 ring-indigo-600 ring-offset-1 ring-offset-slate-50' : 'ring-1 ring-slate-300'
                  }`}
                  style={{ backgroundColor: preset.color }}
                  title={`${preset.tool === 'highlighter' ? 'Dạ quang' : 'Bút'} · ${preset.size}`}
                >
                  <span
                    className="rounded-full bg-white/70"
                    style={{
                      width: `${Math.min(12, Math.max(3, preset.size / 2))}px`,
                      height: `${Math.min(12, Math.max(3, preset.size / 2))}px`
                    }}
                  />
                </button>
                <button
                  onClick={() => setPresets(prev => PenPresets.remove(prev, preset.id))}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-700 text-white items-center justify-center hidden group-hover:flex"
                  title="Bỏ bút này"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
          <button
            onClick={savePreset}
            className="w-6 h-6 rounded-md border border-dashed border-slate-300 text-slate-400 hover:text-indigo-600 hover:border-indigo-400 flex items-center justify-center transition"
            title="Lưu bút hiện tại vào danh sách yêu thích"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {showPenSizes && (
          <div className="chrome-group flex items-center gap-0.5 p-1 shrink-0">
            {PEN_SIZES.map(penSize => (
              <button
                key={penSize.val}
                onClick={() => onChangeSize(penSize.val)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  size === penSize.val
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title={`Nét ${penSize.label}mm`}
              >
                {penSize.label}
              </button>
            ))}
            <span className="text-[10px] font-semibold text-slate-400 pl-1 pr-1.5">mm</span>
          </div>
        )}

        {showEraserSizes && (
          <div className="chrome-group flex items-center gap-0.5 p-1 shrink-0">
            {ERASER_SIZES.map(eraserSize => (
              <button
                key={eraserSize.val}
                onClick={() => onChangeSize(eraserSize.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  size === eraserSize.val
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {eraserSize.label}
              </button>
            ))}
          </div>
        )}

        {showSmartShape && (
          <button
            onClick={onToggleSmartShape}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition shrink-0 ${
              smartShapeEnabled
                ? 'bg-purple-50 text-purple-700 border-purple-300'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-800'
            }`}
            title="Giữ nguyên bút 0.5s để tự nắn thẳng nét hình học"
          >
            <Shapes className={`w-4 h-4 ${smartShapeEnabled ? 'text-purple-600' : 'text-slate-400'}`} />
            <span className="hidden lg:inline">Nắn hình</span>
          </button>
        )}

        {showPenSizes && (
          <button
            onClick={onToggleRuler}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition shrink-0 ${
              rulerEnabled
                ? 'bg-sky-50 text-sky-700 border-sky-300'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-800'
            }`}
            title="Đặt thước lên trang: kéo và xoay được, nét bút tự hút vào cạnh thước"
          >
            <Ruler className={`w-4 h-4 ${rulerEnabled ? 'text-sky-600' : 'text-slate-400'}`} />
            <span className="hidden lg:inline">Thước kẻ</span>
          </button>
        )}

        {showFonts && (
          <div className="relative shrink-0" ref={fontPickerRef}>
            <button
              onClick={() => setShowFontPicker(!showFontPicker)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white text-slate-700 border border-slate-200 text-xs font-bold hover:border-indigo-300 hover:text-indigo-700 transition"
            >
              <span className="truncate max-w-[120px]" style={{ fontFamily }}>
                {VIETNAMESE_HANDWRITING_FONTS.find(f => f.family === fontFamily)?.name.split(' (')[0] || 'Font'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showFontPicker && (
              <div className="chrome-bar chrome-bar-float absolute top-12 left-0 w-72 rounded-2xl p-1.5 z-40 border animate-pop">
                <div className="text-[11px] font-bold text-slate-500 px-2.5 py-1.5">
                  Font chữ viết tay Tiếng Việt
                </div>
                <div className="space-y-0.5">
                  {VIETNAMESE_HANDWRITING_FONTS.map(font => (
                    <button
                      key={font.family}
                      onClick={() => {
                        onChangeFontFamily(font.family);
                        setShowFontPicker(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl transition flex flex-col ${
                        fontFamily === font.family
                          ? 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-slate-500">{font.name.split(' (')[0]}</span>
                      <span className="text-lg truncate leading-tight" style={{ fontFamily: font.family }}>
                        {font.previewText}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {currentTool === 'lasso' && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium shrink-0">
            <MousePointer2 className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Khoanh vùng nét chữ để nhận diện, di chuyển hoặc phóng to</span>
          </div>
        )}
      </div>

      {/* ---------- 3. Khung nhìn ---------- */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Chống tì tay */}
        <button
          onClick={onTogglePalmRejection}
          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold border transition ${
            palmRejectionActive
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
              : 'bg-white text-slate-500 border-slate-200 hover:text-slate-800'
          }`}
          title={
            palmRejectionActive
              ? 'Chỉ bút stylus vẽ được — ngón tay và chuột dùng để kéo cuộn trang'
              : 'Ngón tay và chuột cũng vẽ được'
          }
        >
          <ShieldCheck className={`w-4 h-4 ${palmRejectionActive ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className="hidden xl:inline">{palmRejectionActive ? 'Chỉ bút' : 'Tay + bút'}</span>
        </button>

        {/* Zoom & canh trang */}
        <div className="chrome-group flex items-center p-1">
          <button onClick={onZoomOut} className="chrome-btn w-8 h-8" title="Thu nhỏ">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetZoom}
            className="px-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 tabular-nums transition"
            title="Về tỉ lệ 100%"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button onClick={onZoomIn} className="chrome-btn w-8 h-8" title="Phóng to">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button onClick={onFitWidth} className="chrome-btn w-8 h-8" title="Vừa chiều ngang trang">
            <StretchHorizontal className="w-3.5 h-3.5" />
          </button>
          <button onClick={onFitPage} className="chrome-btn w-8 h-8" title="Vừa toàn bộ trang">
            <Scan className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Thu gọn thanh công cụ */}
        <button
          onClick={() => setIsCollapsed(true)}
          className="chrome-btn w-9 h-9 border border-slate-200"
          title="Thu gọn thanh công cụ để tăng diện tích ghi chú"
        >
          <PanelTopClose className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
