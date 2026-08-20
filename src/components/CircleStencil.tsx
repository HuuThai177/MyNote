import React, { useRef } from 'react';
import { Move, RotateCw, X, Maximize2 } from 'lucide-react';
import { StencilGeometry } from '../engine/StencilGeometry';

export interface CircleStencilState {
  x: number;
  y: number;
  radius: number;
  /** Góc cạnh đáy, chỉ dùng cho thước đo góc */
  angle: number;
}

interface CircleStencilProps {
  state: CircleStencilState;
  /** 'circle' = khuôn tròn đầy, 'protractor' = thước đo góc nửa vòng */
  variant: 'circle' | 'protractor';
  onChange: (next: CircleStencilState) => void;
  onClose: () => void;
  toCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number };
}

const MIN_RADIUS = 50;
const MAX_RADIUS = 900;

/**
 * Khuôn tròn và thước đo góc.
 *
 * Cả hai dùng chung một hình học (đường tròn tâm + bán kính) nên gộp làm một
 * component; khác nhau ở chỗ thước đo góc chỉ có vành nửa trên và có vạch chia
 * độ để đọc góc.
 */
export const CircleStencil: React.FC<CircleStencilProps> = ({
  state,
  variant,
  onChange,
  onClose,
  toCanvasPoint
}) => {
  const dragRef = useRef<{ mode: 'move' | 'resize' | 'rotate'; dx: number; dy: number } | null>(null);
  const size = state.radius * 2;

  const begin = (mode: 'move' | 'resize' | 'rotate') => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toCanvasPoint(e.clientX, e.clientY);
    dragRef.current = { mode, dx: p.x - state.x, dy: p.y - state.y };
  };

  const handleMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.stopPropagation();

    const p = toCanvasPoint(e.clientX, e.clientY);

    if (drag.mode === 'move') {
      onChange({ ...state, x: p.x - drag.dx, y: p.y - drag.dy });
    } else if (drag.mode === 'resize') {
      const radius = Math.hypot(p.x - state.x, p.y - state.y);
      onChange({ ...state, radius: Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius)) });
    } else {
      const raw = (Math.atan2(p.y - state.y, p.x - state.x) * 180) / Math.PI;
      const normalized = StencilGeometry.normalizeDegrees(raw);
      // Bắt nhanh về các mốc 15°
      const snapped = Math.round(normalized / 15) * 15;
      onChange({ ...state, angle: Math.abs(normalized - snapped) < 4 ? snapped : normalized });
    }
  };

  const end = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
  };

  // Vạch chia độ của thước đo góc: mỗi 10°, dài hơn ở mỗi 30°
  const ticks: React.ReactNode[] = [];
  if (variant === 'protractor') {
    for (let deg = 0; deg <= 180; deg += 10) {
      const isMajor = deg % 30 === 0;
      const rad = ((deg + state.angle) * Math.PI) / 180;
      const inner = state.radius - (isMajor ? 18 : 10);
      ticks.push(
        <line
          key={deg}
          x1={state.radius + Math.cos(rad) * inner}
          y1={state.radius + Math.sin(rad) * inner}
          x2={state.radius + Math.cos(rad) * state.radius}
          y2={state.radius + Math.sin(rad) * state.radius}
          stroke={isMajor ? '#475569' : '#94a3b8'}
          strokeWidth={isMajor ? 1.6 : 1}
        />
      );
      if (isMajor) {
        const labelR = state.radius - 30;
        ticks.push(
          <text
            key={`t${deg}`}
            x={state.radius + Math.cos(rad) * labelR}
            y={state.radius + Math.sin(rad) * labelR}
            fontSize="12"
            fontWeight="700"
            fill="#475569"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {deg}
          </text>
        );
      }
    }
  }

  const baseRad = (state.angle * Math.PI) / 180;

  return (
    <div
      className="absolute z-[12] select-none"
      style={{
        left: `${state.x - state.radius}px`,
        top: `${state.y - state.radius}px`,
        width: `${size}px`,
        height: `${size}px`,
        touchAction: 'none'
      }}
      onPointerMove={handleMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <svg width={size} height={size} className="absolute inset-0 pointer-events-none">
        {variant === 'circle' ? (
          <circle
            cx={state.radius}
            cy={state.radius}
            r={state.radius}
            fill="rgba(226,232,240,0.30)"
            stroke="#4f46e5"
            strokeWidth={2}
          />
        ) : (
          <>
            {/* Nửa vòng có vành, tính từ cạnh đáy */}
            <path
              d={`M ${state.radius + Math.cos(baseRad) * state.radius} ${state.radius + Math.sin(baseRad) * state.radius}
                  A ${state.radius} ${state.radius} 0 0 1
                  ${state.radius - Math.cos(baseRad) * state.radius} ${state.radius - Math.sin(baseRad) * state.radius} Z`}
              fill="rgba(226,232,240,0.55)"
              stroke="#4f46e5"
              strokeWidth={2}
            />
            {ticks}
          </>
        )}
      </svg>

      {/* Tay cầm di chuyển ở tâm */}
      <div
        onPointerDown={begin('move')}
        className="absolute w-10 h-10 rounded-full bg-white/90 border-2 border-indigo-500 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-md"
        style={{ left: `${state.radius - 20}px`, top: `${state.radius - 20}px` }}
        title="Kéo để di chuyển khuôn"
      >
        <Move className="w-4 h-4 text-indigo-600" />
      </div>

      {/* Tay cầm đổi bán kính */}
      <div
        onPointerDown={begin('resize')}
        className="absolute w-8 h-8 rounded-full bg-indigo-600 text-white border-2 border-white flex items-center justify-center cursor-nwse-resize shadow-lg"
        style={{ left: `${size - 16}px`, top: `${state.radius - 16}px` }}
        title="Kéo để đổi bán kính"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </div>

      {/* Xoay cạnh đáy — chỉ thước đo góc mới cần */}
      {variant === 'protractor' && (
        <div
          onPointerDown={begin('rotate')}
          className="absolute w-8 h-8 rounded-full bg-slate-700 text-white border-2 border-white flex items-center justify-center cursor-alias shadow-lg"
          style={{ left: `${state.radius - 16}px`, top: `${size - 16}px` }}
          title="Kéo để xoay cạnh đáy"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Thông số & nút cất */}
      <div className="chrome-bar chrome-bar-float absolute -top-11 left-0 flex items-center gap-1 px-2 py-1.5 rounded-lg border whitespace-nowrap">
        <span className="text-[11px] font-bold text-slate-600 tabular-nums">
          {variant === 'protractor' ? `đáy ${Math.round(state.angle)}° · ` : ''}
          r {Math.round(state.radius)}
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
          title="Cất khuôn"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
