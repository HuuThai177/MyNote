import React, { useRef } from 'react';
import { Move, RotateCw, X } from 'lucide-react';

export interface RulerState {
  /** Điểm giữa của CẠNH VẼ, tính theo toạ độ trang */
  x: number;
  y: number;
  /** Góc nghiêng, độ. 0 = nằm ngang */
  angle: number;
  length: number;
}

interface RulerOverlayProps {
  ruler: RulerState;
  onChange: (next: RulerState) => void;
  onClose: () => void;
  /** Quy đổi toạ độ màn hình sang toạ độ trang */
  toCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number };
}

/** Bề dày thân thước; nét vẽ bám vào cạnh trên nên thân nằm hẳn bên dưới */
export const RULER_THICKNESS = 68;
/** Khoảng cách tối đa để nét bút bị hút vào cạnh thước */
export const RULER_SNAP_DISTANCE = 46;
/** Góc bắt nhanh khi xoay gần các mốc quen thuộc */
const SNAP_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
const ANGLE_SNAP_TOLERANCE = 4;

/**
 * Thước kẻ vật lý đặt trên trang giấy.
 *
 * Nét bút bị hút vào CẠNH TRÊN của thước, còn thân thước nằm bên dưới cạnh đó —
 * giống hệt cách dùng thước thật: kẻ dọc mép trên, thân thước che phần giấy
 * phía dưới chứ không che nét vừa kẻ.
 */
export const RulerOverlay: React.FC<RulerOverlayProps> = ({
  ruler,
  onChange,
  onClose,
  toCanvasPoint
}) => {
  const dragRef = useRef<{ mode: 'move' | 'rotate'; offsetX: number; offsetY: number } | null>(null);

  const beginMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const point = toCanvasPoint(e.clientX, e.clientY);
    dragRef.current = { mode: 'move', offsetX: point.x - ruler.x, offsetY: point.y - ruler.y };
  };

  const beginRotate = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { mode: 'rotate', offsetX: 0, offsetY: 0 };
  };

  const handleMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.stopPropagation();

    const point = toCanvasPoint(e.clientX, e.clientY);

    if (drag.mode === 'move') {
      onChange({ ...ruler, x: point.x - drag.offsetX, y: point.y - drag.offsetY });
      return;
    }

    // Xoay quanh tâm thước theo vị trí ngón tay
    const raw = (Math.atan2(point.y - ruler.y, point.x - ruler.x) * 180) / Math.PI;
    const normalized = ((raw % 180) + 180) % 180;

    const snapped = SNAP_ANGLES.find(a => Math.abs(normalized - a) <= ANGLE_SNAP_TOLERANCE);
    onChange({ ...ruler, angle: snapped ?? normalized });
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
  };

  const setAngle = (angle: number) => onChange({ ...ruler, angle });

  // Vạch chia mỗi 10px, vạch dài hơn ở mỗi 50px
  const ticks: React.ReactNode[] = [];
  for (let offset = 0; offset <= ruler.length; offset += 10) {
    const isMajor = offset % 50 === 0;
    ticks.push(
      <div
        key={offset}
        className={isMajor ? 'bg-slate-500' : 'bg-slate-400'}
        style={{
          position: 'absolute',
          left: `${offset}px`,
          top: 0,
          width: isMajor ? '1.5px' : '1px',
          height: isMajor ? '16px' : '9px'
        }}
      />
    );
  }

  return (
    <div
      className="absolute z-[12] select-none"
      style={{
        left: `${ruler.x}px`,
        top: `${ruler.y}px`,
        width: `${ruler.length}px`,
        height: `${RULER_THICKNESS}px`,
        transform: `translate(-50%, 0) rotate(${ruler.angle}deg)`,
        transformOrigin: `50% 0`,
        touchAction: 'none'
      }}
      onPointerMove={handleMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Thân thước — mờ để vẫn thấy nội dung bên dưới */}
      <div
        onPointerDown={beginMove}
        className="absolute inset-0 rounded-r-md cursor-grab active:cursor-grabbing"
        style={{
          background: 'linear-gradient(180deg, rgba(226,232,240,0.94) 0%, rgba(203,213,225,0.86) 100%)',
          borderTop: '2px solid #4f46e5',
          boxShadow: '0 6px 18px rgba(15,23,42,0.22)'
        }}
      >
        <div className="absolute left-0 right-0 top-0 h-4">{ticks}</div>

        <div className="absolute inset-0 flex items-center justify-center gap-2 pointer-events-none">
          <Move className="w-4 h-4 text-slate-500" />
          <span className="text-[11px] font-bold text-slate-600 tabular-nums">
            {Math.round(ruler.angle)}°
          </span>
        </div>
      </div>

      {/* Tay cầm xoay ở đầu phải */}
      <div
        onPointerDown={beginRotate}
        className="absolute -right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-indigo-600 text-white border-2 border-white flex items-center justify-center shadow-lg cursor-alias"
        title="Kéo để xoay thước"
      >
        <RotateCw className="w-4 h-4" />
      </div>

      {/* Bảng góc nhanh & đóng, giữ thẳng đứng bằng cách xoay ngược lại */}
      <div
        className="absolute -top-11 left-0 flex items-center gap-1"
        style={{ transform: `rotate(${-ruler.angle}deg)`, transformOrigin: 'left bottom' }}
      >
        <div className="chrome-bar chrome-bar-float flex items-center gap-0.5 px-1 py-1 rounded-lg border">
          {[0, 45, 90, 135].map(angle => (
            <button
              key={angle}
              onClick={() => setAngle(angle)}
              className={`px-1.5 py-1 rounded text-[11px] font-bold transition ${
                Math.round(ruler.angle) === angle
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title={`Đặt thước ${angle}°`}
            >
              {angle}°
            </button>
          ))}
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
            title="Cất thước"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Chiếu một điểm lên cạnh vẽ của thước.
 * Trả về null khi điểm nằm quá xa — lúc đó nét bút vẽ tự do như bình thường.
 */
export const snapPointToRuler = (
  point: { x: number; y: number },
  ruler: RulerState
): { x: number; y: number } | null => {
  const radians = (ruler.angle * Math.PI) / 180;
  const dirX = Math.cos(radians);
  const dirY = Math.sin(radians);

  // Cạnh vẽ đi qua tâm thước theo hướng `angle`; chiếu vuông góc điểm lên đó
  const relX = point.x - ruler.x;
  const relY = point.y - ruler.y;
  const along = relX * dirX + relY * dirY;

  const projectedX = ruler.x + dirX * along;
  const projectedY = ruler.y + dirY * along;

  const distance = Math.hypot(point.x - projectedX, point.y - projectedY);
  if (distance > RULER_SNAP_DISTANCE) return null;

  return { x: projectedX, y: projectedY };
};
