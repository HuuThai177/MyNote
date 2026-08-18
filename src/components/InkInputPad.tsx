import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  PenLine,
  Check,
  CornerDownLeft,
  Undo2,
  Trash2,
  X,
  Loader2,
  WifiOff,
  ChevronUp,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import {
  VietnameseInkRecognizer,
  InkRecognitionError,
  RawInkStroke
} from '../engine/VietnameseInkRecognizer';

interface PadPoint {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

interface PadStroke {
  id: string;
  points: PadPoint[];
}

interface InkInputPadProps {
  /** Nội dung hiện tại của khung chữ đích, chỉ để hiển thị nhắc */
  targetPreview: string;
  palmRejectionActive: boolean;
  /** Kết quả nhận diện dòng đang viết — ghi đè phần chữ "sống" trong khung */
  onLiveTextChange: (recognizedLine: string) => void;
  /** Chốt dòng hiện tại; `lineBreak` = true khi người dùng bấm Xuống dòng */
  onCommitLine: (lineBreak: boolean) => void;
  /** Mất mạng / dịch vụ lỗi: App tắt chế độ và thông báo */
  onRecognitionUnavailable: (reason: string) => void;
  onClose: () => void;
}

/** Thời gian ngừng bút trước khi gửi nhận diện (ms) */
const IDLE_BEFORE_RECOGNIZE = 550;
/** Chiều rộng chừa thêm bên phải để bảng luôn có chỗ viết tiếp */
const TRAILING_SPACE = 320;
const HEIGHT_COMPACT = 150;
const HEIGHT_TALL = 240;
/** Quá dài thì nhắc người dùng chốt dòng — dòng càng dài nhận diện càng kém */
const LINE_TOO_LONG = 3200;

export const InkInputPad: React.FC<InkInputPadProps> = ({
  targetPreview,
  palmRejectionActive,
  onLiveTextChange,
  onCommitLine,
  onRecognitionUnavailable,
  onClose
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [strokes, setStrokes] = useState<PadStroke[]>([]);
  const [activePoints, setActivePoints] = useState<PadPoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [padHeight, setPadHeight] = useState(HEIGHT_COMPACT);
  const [status, setStatus] = useState<'idle' | 'writing' | 'recognizing'>('idle');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [recognizedLine, setRecognizedLine] = useState('');
  const [visibleWidth, setVisibleWidth] = useState(0);

  // Chiều rộng vùng nhìn phải đo bằng ResizeObserver: nếu lấy mặc định cứng thì
  // canvas sẽ hẹp hơn dải bảng và phần bên phải không viết được.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    setVisibleWidth(scroller.clientWidth);
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setVisibleWidth(width);
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  /** Bảng dài ra theo nét viết để không bao giờ hết chỗ; vùng nhìn cuộn ngang */
  const measureContentWidth = useCallback(
    (padStrokes: PadStroke[], pending: PadPoint[] = []) => {
      let maxX = 0;
      padStrokes.forEach(s => s.points.forEach(p => { if (p.x > maxX) maxX = p.x; }));
      pending.forEach(p => { if (p.x > maxX) maxX = p.x; });
      return Math.max(visibleWidth || 800, maxX + TRAILING_SPACE);
    },
    [visibleWidth]
  );

  const contentWidth = measureContentWidth(strokes, activePoints);

  // ---------------------------------------------------------------------------
  // Vẽ
  // ---------------------------------------------------------------------------
  const renderPad = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, contentWidth, padHeight);

    // Đường kẻ hướng dẫn: viết đúng giữa hai vạch giúp nhận diện chính xác hơn
    const topGuide = padHeight * 0.28;
    const baseline = padHeight * 0.74;

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([7, 7]);
    [topGuide, baseline].forEach(y => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(contentWidth, y);
      ctx.stroke();
    });
    ctx.restore();

    const drawStroke = (points: PadPoint[]) => {
      if (points.length === 0) return;
      ctx.save();
      ctx.strokeStyle = '#1e293b';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (points.length === 1) {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        for (let i = 1; i < points.length; i++) {
          const previous = points[i - 1];
          const current = points[i];
          const pressure = ((previous.pressure || 0.5) + (current.pressure || 0.5)) / 2;
          ctx.lineWidth = Math.max(1.4, 3.4 * pressure);
          ctx.beginPath();
          ctx.moveTo(previous.x, previous.y);
          ctx.lineTo(current.x, current.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    strokes.forEach(s => drawStroke(s.points));
    drawStroke(activePoints);
  }, [strokes, activePoints, contentWidth, padHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(contentWidth * dpr);
    canvas.height = Math.round(padHeight * dpr);
    renderPad();
  }, [contentWidth, padHeight, renderPad]);

  useEffect(() => {
    renderPad();
  }, [renderPad]);

  // ---------------------------------------------------------------------------
  // Nhận diện thời gian thực
  // ---------------------------------------------------------------------------
  const runRecognition = useCallback(async (padStrokes: PadStroke[]) => {
    abortRef.current?.abort();

    if (padStrokes.length === 0) {
      setCandidates([]);
      setRecognizedLine('');
      onLiveTextChange('');
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('recognizing');

    const payload: RawInkStroke[] = padStrokes.map(s => ({
      points: s.points.map(p => ({ x: p.x, y: p.y, time: p.time }))
    }));

    try {
      const result = await VietnameseInkRecognizer.recognizeLine(
        payload,
        // Đo lại từ chính tập nét được gửi: closure có thể giữ contentWidth của
        // lần render trước, chưa tính nét vừa viết xong.
        measureContentWidth(padStrokes),
        padHeight,
        controller.signal
      );

      if (controller.signal.aborted) return;
      setRecognizedLine(result.text);
      setCandidates(result.candidates);
      onLiveTextChange(result.text);
      setStatus('idle');
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // Có nét mới, request này bị bỏ

      setStatus('idle');
      if (e instanceof InkRecognitionError && e.kind === 'empty') {
        setCandidates([]);
        return; // Chưa ra chữ thì giữ nguyên, không báo lỗi ồn ào
      }
      onRecognitionUnavailable(
        e instanceof InkRecognitionError && e.kind === 'offline'
          ? 'Chế độ viết tay cần kết nối mạng. Đã tắt bảng viết để không điền chữ đoán sai vào ghi chú.'
          : 'Dịch vụ nhận diện chữ không phản hồi. Đã tắt bảng viết.'
      );
    }
  }, [measureContentWidth, padHeight, onLiveTextChange, onRecognitionUnavailable]);

  /** Hẹn nhận diện sau khi ngừng bút */
  const scheduleRecognition = (padStrokes: PadStroke[]) => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => runRecognition(padStrokes), IDLE_BEFORE_RECOGNIZE);
  };

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Nhập bút
  // ---------------------------------------------------------------------------
  const toPadPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  /**
   * Chuột luôn được phép để dùng được trên desktop; ngón tay chỉ khi đã tắt
   * Palm Rejection, vì viết bằng ngón trên bảng hẹp rất khó nhận diện đúng.
   */
  const acceptsPointer = (pointerType: string) => {
    if (pointerType === 'pen' || pointerType === 'mouse') return true;
    return !palmRejectionActive;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!acceptsPointer(e.pointerType)) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    const { x, y } = toPadPoint(e.clientX, e.clientY);

    setIsDrawing(true);
    setStatus('writing');
    setActivePoints([{ x, y, pressure: e.pressure > 0 ? e.pressure : 0.6, time: Date.now() }]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = toPadPoint(e.clientX, e.clientY);
    setActivePoints(prev => [
      ...prev,
      { x, y, pressure: e.pressure > 0 ? e.pressure : 0.6, time: Date.now() }
    ]);
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (activePoints.length === 0) return;

    const newStroke: PadStroke = {
      id: `pad-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      points: activePoints
    };
    const nextStrokes = [...strokes, newStroke];

    setStrokes(nextStrokes);
    setActivePoints([]);
    scheduleRecognition(nextStrokes);

    // Cuộn theo ngòi bút để luôn thấy chỗ đang viết
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const maxX = Math.max(...activePoints.map(p => p.x));
      if (maxX > scroller.scrollLeft + scroller.clientWidth - 120) {
        scroller.scrollLeft = maxX - scroller.clientWidth + 220;
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Hành động
  // ---------------------------------------------------------------------------
  const clearPad = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    abortRef.current?.abort();
    setStrokes([]);
    setActivePoints([]);
    setCandidates([]);
    setRecognizedLine('');
    setStatus('idle');
    onLiveTextChange(''); // Hoàn nguyên phần chữ sống trong khung
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
  };

  const undoLastStroke = () => {
    if (strokes.length === 0) return;
    const nextStrokes = strokes.slice(0, -1);
    setStrokes(nextStrokes);
    scheduleRecognition(nextStrokes);
  };

  const commitLine = (lineBreak: boolean) => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    abortRef.current?.abort();
    onCommitLine(lineBreak);
    setStrokes([]);
    setActivePoints([]);
    setCandidates([]);
    setRecognizedLine('');
    setStatus('idle');
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
  };

  const pickCandidate = (candidate: string) => {
    setRecognizedLine(candidate);
    onLiveTextChange(candidate);
  };

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  return (
    <div className="chrome-bar absolute bottom-0 left-0 right-0 z-40 border-t shadow-[0_-8px_28px_rgba(15,23,42,0.14)] animate-pop">
      {/* Hàng đầu: trạng thái + chip gợi ý */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-200">
        <div className="flex items-center gap-2 shrink-0">
          <PenLine className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-bold text-slate-800 hidden sm:inline">Viết tay Tiếng Việt</span>
        </div>

        {/* Trạng thái */}
        <div className="shrink-0">
          {isOffline ? (
            <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600">
              <WifiOff className="w-3.5 h-3.5" /> Mất mạng
            </span>
          ) : status === 'recognizing' ? (
            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang nhận diện…
            </span>
          ) : status === 'writing' ? (
            <span className="text-[11px] font-bold text-slate-400">Đang viết…</span>
          ) : recognizedLine ? (
            <span className="text-[11px] font-bold text-emerald-700 truncate max-w-[220px]">
              “{recognizedLine}”
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">Viết vào vùng bên dưới</span>
          )}
        </div>

        {/* Chip phương án khác */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto">
          {candidates.length > 1 && <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
          {candidates.slice(0, 6).map(candidate => (
            <button
              key={candidate}
              onClick={() => pickCandidate(candidate)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap border transition ${
                candidate === recognizedLine
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Chạm để dùng phương án này"
            >
              {candidate}
            </button>
          ))}
        </div>

        <button
          onClick={() => setPadHeight(prev => (prev === HEIGHT_COMPACT ? HEIGHT_TALL : HEIGHT_COMPACT))}
          className="chrome-btn w-8 h-8 shrink-0"
          title={padHeight === HEIGHT_COMPACT ? 'Mở rộng bảng viết' : 'Thu gọn bảng viết'}
        >
          {padHeight === HEIGHT_COMPACT ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <button
          onClick={onClose}
          className="chrome-btn w-8 h-8 shrink-0"
          title="Đóng bảng viết tay"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Vùng viết — cuộn ngang khi dòng dài hơn màn hình */}
      <div
        ref={scrollerRef}
        className="overflow-x-auto overflow-y-hidden bg-[#fbfbfd]"
        style={{ height: `${padHeight}px`, touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="block cursor-crosshair touch-none"
          style={{ width: `${contentWidth}px`, height: `${padHeight}px` }}
        />
      </div>

      {/* Hàng nút */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-200">
        <div className="flex items-center gap-1.5">
          <button
            onClick={undoLastStroke}
            disabled={strokes.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-slate-600 border border-slate-200 text-xs font-bold hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 transition"
            title="Xoá nét vừa viết"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Xoá nét</span>
          </button>
          <button
            onClick={clearPad}
            disabled={strokes.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-slate-600 border border-slate-200 text-xs font-bold hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 transition"
            title="Xoá toàn bộ bảng và hoàn nguyên phần chữ đang nhận"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Xoá bảng</span>
          </button>
        </div>

        {/* Nhắc khung chữ đích */}
        <div className="flex-1 min-w-0 text-center">
          <span className="text-[11px] text-slate-400 truncate block">
            {contentWidth > LINE_TOO_LONG
              ? '⚠ Dòng đang rất dài — bấm "Xong dòng" để nhận diện chính xác hơn'
              : `Điền vào: “${targetPreview.slice(0, 40) || 'khung chữ trống'}”`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => commitLine(true)}
            disabled={!recognizedLine}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-slate-600 border border-slate-200 text-xs font-bold hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 transition"
            title="Chốt dòng này rồi xuống dòng mới"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Xuống dòng</span>
          </button>
          <button
            onClick={() => commitLine(false)}
            disabled={!recognizedLine}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 disabled:opacity-40 transition"
            title="Chốt dòng: chữ trở thành text thường, sửa tay được"
          >
            <Check className="w-4 h-4" />
            <span>Xong dòng</span>
          </button>
        </div>
      </div>
    </div>
  );
};
