import React, { useEffect, useRef, useState } from 'react';
import { PenPresets, PenPreset } from '../engine/PenPresets';
import { FloatingPanel } from './FloatingPanel';
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
  Ruler,
  Presentation,
  Moon,
  BarChart3,
  Circle,
  Triangle,
  Grid3x3,
  Ban,
  Network
} from 'lucide-react';
import { ToolType, VIETNAMESE_HANDWRITING_FONTS } from '../types/notebook';
import { StencilTool } from '../engine/StencilGeometry';

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
  /** Khuôn vẽ đang dùng */
  stencilTool: StencilTool;
  onChangeStencil: (tool: StencilTool) => void;
  // Điều khiển khung nhìn (chuyển từ header sang đây cho đúng nhóm chức năng)
  palmRejectionActive: boolean;
  onTogglePalmRejection: () => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  presentMode: boolean;
  onTogglePresentMode: () => void;
  nightMode: boolean;
  onToggleNightMode: () => void;
  onOpenStats: () => void;
  onOpenGraph: () => void;
}

/** Sáu màu hay dùng nhất, luôn hiện sẵn trên thanh công cụ */
const QUICK_COLORS = [
  { name: 'Đen mực', hex: '#1e293b' },
  { name: 'Xanh chàm', hex: '#4f46e5' },
  { name: 'Đỏ', hex: '#e11d48' },
  { name: 'Xanh lá', hex: '#059669' },
  { name: 'Cam', hex: '#d97706' },
  { name: 'Trắng', hex: '#ffffff' }
];

/** Bảng màu đầy đủ trong hộp thoại — 3 hàng 8 màu */
const PALETTE = [
  '#000000', '#1e293b', '#475569', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f8fafc', '#ffffff',
  '#7f1d1d', '#dc2626', '#e11d48', '#db2777', '#a21caf', '#7c3aed', '#4f46e5', '#2563eb',
  '#0891b2', '#0d9488', '#059669', '#16a34a', '#65a30d', '#ca8a04', '#d97706', '#ea580c'
];

const STENCILS: { id: StencilTool; icon: React.ElementType; name: string; hint: string }[] = [
  { id: 'none', icon: Ban, name: 'Không dùng khuôn', hint: 'Vẽ tay tự do' },
  { id: 'ruler', icon: Ruler, name: 'Thước kẻ', hint: 'Kéo và xoay, nét hút vào cạnh thước' },
  { id: 'circle', icon: Circle, name: 'Khuôn tròn', hint: 'Nét hút vào vành, vẽ vòng tròn chuẩn' },
  { id: 'protractor', icon: Triangle, name: 'Thước đo góc', hint: 'Nửa vòng có vạch chia độ' },
  { id: 'isometric', icon: Grid3x3, name: 'Lưới đẳng cự', hint: 'Mọi nét theo 30° / 90° / 150°' }
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
  stencilTool,
  onChangeStencil,
  palmRejectionActive,
  onTogglePalmRejection,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitWidth,
  onFitPage,
  presentMode,
  onTogglePresentMode,
  nightMode,
  onToggleNightMode,
  onOpenStats,
  onOpenGraph
}) => {
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [fontAnchor, setFontAnchor] = useState<HTMLElement | null>(null);
  const [hexDraft, setHexDraft] = useState('');
  const [showStencilMenu, setShowStencilMenu] = useState(false);
  const [stencilAnchor, setStencilAnchor] = useState<HTMLElement | null>(null);
  const [presets, setPresets] = useState<PenPreset[]>(() => PenPresets.load());
  const [recentColors, setRecentColors] = useState<string[]>(() => PenPresets.loadRecentColors());
  /** Ô nhập mã màu chỉ áp dụng khi gõ đủ 6 ký tự hợp lệ */
  const commitHex = (raw: string) => {
    const cleaned = raw.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return;
    applyCustomColor('#' + cleaned.toLowerCase());
  };

  useEffect(() => {
    if (showColorPanel) setHexDraft(color.replace('#', ''));
  }, [showColorPanel, color]);

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
        {/* Màu hiện tại — bấm để mở hộp chọn màu */}
        {showColors && (
          <div className="chrome-group flex items-center gap-1.5 px-2 py-1.5 shrink-0">
            {/* Sáu màu hay dùng, đổi nhanh một chạm */}
            {QUICK_COLORS.map(swatch => (
              <button
                key={swatch.hex}
                onClick={() => onChangeColor(swatch.hex)}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition hover:scale-110 ${
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

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* Nút mở hộp thoại: hiện đúng màu đang dùng kèm mã màu */}
            <button
              ref={setColorAnchor}
              onClick={() => setShowColorPanel(!showColorPanel)}
              className={`flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg border transition ${
                showColorPanel
                  ? 'bg-indigo-50 border-indigo-300'
                  : 'bg-white border-slate-200 hover:border-indigo-300'
              }`}
              title="Mở hộp chọn màu đầy đủ"
            >
              <span
                className="w-6 h-6 rounded-md ring-1 ring-slate-300 shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] font-bold text-slate-500 uppercase tabular-nums hidden xl:inline">
                {color.replace('#', '')}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        )}

        {/* HỘP CHỌN MÀU — render qua portal nên không bị thanh công cụ cắt */}
        <FloatingPanel
          anchor={colorAnchor}
          open={showColorPanel}
          onClose={() => setShowColorPanel(false)}
          width={296}
        >
          <div className="p-4 space-y-4">
            {/* Xem trước màu đang chọn */}
            <div className="flex items-center gap-3">
              <span
                className="w-12 h-12 rounded-xl ring-1 ring-slate-300 shrink-0 shadow-inner"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-slate-500 mb-1">Mã màu</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-400">#</span>
                  <input
                    value={hexDraft}
                    onChange={e => {
                      setHexDraft(e.target.value);
                      commitHex(e.target.value);
                    }}
                    maxLength={6}
                    spellCheck={false}
                    className="w-24 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 uppercase tabular-nums focus:outline-none focus:border-indigo-400"
                    placeholder="4F46E5"
                  />
                </div>
              </div>
            </div>

            {/* Bảng màu đầy đủ */}
            <div>
              <p className="text-[11px] font-bold text-slate-500 mb-2">Bảng màu</p>
              <div className="grid grid-cols-8 gap-2">
                {PALETTE.map(hex => (
                  <button
                    key={hex}
                    onClick={() => applyCustomColor(hex)}
                    className={`w-7 h-7 rounded-lg transition hover:scale-110 ${
                      color.toLowerCase() === hex
                        ? 'ring-2 ring-indigo-600 ring-offset-2 ring-offset-white'
                        : 'ring-1 ring-slate-300'
                    }`}
                    style={{ backgroundColor: hex }}
                    title={hex}
                  />
                ))}
              </div>
            </div>

            {/* Màu vừa dùng */}
            {recentColors.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-slate-500 mb-2">Vừa dùng</p>
                <div className="flex flex-wrap gap-2">
                  {recentColors.map(hex => (
                    <button
                      key={hex}
                      onClick={() => applyCustomColor(hex)}
                      className={`w-7 h-7 rounded-lg transition hover:scale-110 ${
                        color.toLowerCase() === hex
                          ? 'ring-2 ring-indigo-600 ring-offset-2 ring-offset-white'
                          : 'ring-1 ring-slate-300'
                      }`}
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Bộ chọn màu của hệ thống */}
            <div>
              <p className="text-[11px] font-bold text-slate-500 mb-2">Chọn màu bất kỳ</p>
              <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:border-indigo-300 transition cursor-pointer">
                <Pipette className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-700 flex-1">Mở bảng màu hệ thống</span>
                <input
                  type="color"
                  value={color}
                  onChange={e => applyCustomColor(e.target.value)}
                  className="w-9 h-7 rounded cursor-pointer border border-slate-200 bg-white"
                />
              </label>
            </div>
          </div>
        </FloatingPanel>

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
          <>
            <button
              ref={setStencilAnchor}
              onClick={() => setShowStencilMenu(!showStencilMenu)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition shrink-0 ${
                stencilTool !== 'none'
                  ? 'bg-sky-50 text-sky-700 border-sky-300'
                  : 'bg-white text-slate-500 border-slate-200 hover:text-slate-800'
              }`}
              title="Bộ khuôn vẽ: thước kẻ, khuôn tròn, thước đo góc, lưới đẳng cự"
            >
              {(() => {
                const active = STENCILS.find(st => st.id === stencilTool) ?? STENCILS[0];
                const Icon = active.icon;
                return <Icon className={`w-4 h-4 ${stencilTool !== 'none' ? 'text-sky-600' : 'text-slate-400'}`} />;
              })()}
              <span className="hidden lg:inline">
                {STENCILS.find(st => st.id === stencilTool)?.name.replace('Không dùng khuôn', 'Khuôn vẽ')}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            <FloatingPanel
              anchor={stencilAnchor}
              open={showStencilMenu}
              onClose={() => setShowStencilMenu(false)}
              width={272}
            >
              <div className="p-1.5">
                {STENCILS.map(({ id, icon: Icon, name, hint }) => (
                  <button
                    key={id}
                    onClick={() => {
                      onChangeStencil(id);
                      setShowStencilMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition text-left ${
                      stencilTool === id ? 'bg-sky-50 ring-1 ring-sky-200' : 'hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${stencilTool === id ? 'text-sky-600' : 'text-slate-400'}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800">{name}</p>
                      <p className="text-[11px] text-slate-500 leading-snug">{hint}</p>
                    </div>
                  </button>
                ))}
              </div>
            </FloatingPanel>
          </>
        )}

        {showFonts && (
          <button
            ref={setFontAnchor}
            onClick={() => setShowFontPicker(!showFontPicker)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition shrink-0 ${
              showFontPicker
                ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
            }`}
            title="Đổi font cho khung chữ mới"
          >
            <span className="truncate max-w-[120px]" style={{ fontFamily }}>
              {VIETNAMESE_HANDWRITING_FONTS.find(f => f.family === fontFamily)?.name.split(' (')[0] || 'Font'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}

        {/* DANH SÁCH FONT — cũng phải dùng portal vì dính đúng lỗi cắt như hộp màu */}
        <FloatingPanel
          anchor={fontAnchor}
          open={showFontPicker}
          onClose={() => setShowFontPicker(false)}
          width={288}
        >
          <div className="p-1.5">
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
        </FloatingPanel>

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

        {/* Đảo màu ban đêm */}
        <button
          onClick={onToggleNightMode}
          className={`chrome-btn w-9 h-9 border ${
            nightMode ? 'bg-slate-900 text-amber-300 border-slate-900' : 'border-slate-200'
          }`}
          title="Đảo màu trang để đọc và viết ban đêm — chỉ đổi cách hiển thị, không đụng vào dữ liệu"
        >
          <Moon className="w-4 h-4" />
        </button>

        {/* Trình chiếu */}
        <button
          onClick={onTogglePresentMode}
          className="chrome-btn w-9 h-9 border border-slate-200"
          title="Trình chiếu: ẩn hết thanh công cụ, bút thành con trỏ laser (Esc để thoát)"
        >
          <Presentation className="w-4 h-4" />
        </button>

        {/* Bản đồ liên kết */}
        <button
          onClick={onOpenGraph}
          className="chrome-btn w-9 h-9 border border-slate-200"
          title="Bản đồ ghi chú: các trang nối với nhau qua liên kết [[...]]"
        >
          <Network className="w-4 h-4" />
        </button>

        {/* Thống kê thói quen */}
        <button
          onClick={onOpenStats}
          className="chrome-btn w-9 h-9 border border-slate-200"
          title="Thói quen ghi chép: chuỗi ngày viết, lịch nhiệt, tổng nét"
        >
          <BarChart3 className="w-4 h-4" />
        </button>

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
