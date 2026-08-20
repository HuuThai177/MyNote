import React, { useRef, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Stroke,
  Point,
  ToolType,
  NotebookPage,
  TextElement,
  ImageElement,
  VIETNAMESE_HANDWRITING_FONTS,
  MIN_ZOOM,
  MAX_ZOOM
} from '../types/notebook';
import { getPageDimensions, clampZoom } from '../engine/PageGeometry';
import { PageOps, ClipboardPayload } from '../engine/PageOps';
import { ShapeSmoother } from '../engine/ShapeSmoother';
import { VietnameseInkRecognizer, InkRecognitionError } from '../engine/VietnameseInkRecognizer';
import { LassoContextMenu } from './LassoContextMenu';
import { InkToTextModal } from './InkToTextModal';
import { TextElementToolbar } from './TextElementToolbar';
import { RulerOverlay, RulerState, snapPointToRuler } from './RulerOverlay';
import {
  Grip,
  Trash2,
  Sparkles,
  Type,
  Plus,
  Minus,
  Maximize2,
  Check,
  MousePointerClick,
  AudioLines,
  PenLine,
  Shapes,
  ScanText,
  Loader2
} from 'lucide-react';

interface CanvasAreaProps {
  page: NotebookPage;
  currentTool: ToolType;
  color: string;
  size: number;
  fontFamily: string;
  smartShapeEnabled: boolean;
  /** Hiện thước kẻ trên trang; nét bút hút vào cạnh thước */
  rulerEnabled: boolean;
  onDisableRuler: () => void;
  palmRejectionActive: boolean;
  zoomLevel: number;
  /** `coalesceKey` gộp một chuỗi thao tác liên tục thành 1 bước hoàn tác */
  onPageUpdate: (updatedPage: NotebookPage, coalesceKey?: string) => void;
  audioRecordingTime: number;
  isRecordingAudio: boolean;
  /** Chạm vào nét vẽ để nghe lại đúng đoạn ghi âm */
  audioSeekMode: boolean;
  onSeekAudioFromStroke: (timeInSeconds: number) => void;
  /** Mốc thời gian đang phát, dùng để làm sáng nét vẽ tương ứng */
  playbackTime: number | null;
  /** Bật bảng viết tay để điền chữ vào khung chữ này */
  onRequestInkInput: (textElementId: string) => void;
  /** Khung chữ đang nhận chữ từ bảng viết tay */
  inkInputTargetId: string | null;
  /** Pinch / Ctrl+lăn chuột / nút "vừa khung" đều đổi zoom qua đây */
  onZoomChange: (zoom: number) => void;
  /** Yêu cầu canh trang vừa khung nhìn; token tăng mỗi lần bấm nút */
  fitRequest: { mode: 'width' | 'page'; token: number } | null;
  /** Khay nhớ tạm nằm ở App để dán được sang trang khác, sổ tay khác */
  onCopySelection: (payload: ClipboardPayload) => void;
  readClipboard: () => ClipboardPayload | null;
  hasClipboard: boolean;
  /** Đọc chữ trong ảnh đã chèn */
  onOcrImage: (imageId: string) => void;
  ocrBusyImageId: string | null;
  /** Tạo thẻ ôn tập từ vùng đang khoanh */
  onCreateFlashcard: (region: { x: number; y: number; width: number; height: number }, suggestedBack: string) => void;
  isCreatingFlashcard: boolean;
  /** Trình chiếu: nét bút thành con trỏ laser, không lưu lại */
  laserMode: boolean;
  /** Đảo màu trang để đọc ban đêm */
  nightMode: boolean;
}

/** Cửa sổ thời gian (giây) quanh mốc đang phát để làm sáng nét vẽ */
const PLAYBACK_HIGHLIGHT_WINDOW = 1.2;
/** Lề quanh trang giấy trong vùng cuộn (px màn hình) */
const SHEET_MARGIN = 28;
/** Vệt laser tan sau bao lâu (ms) */
const LASER_LIFETIME = 1500;
/** Trần độ phân giải canvas để tablet không cạn RAM khi zoom sâu */
const MAX_RENDER_SCALE = 2.5;

export const CanvasArea: React.FC<CanvasAreaProps> = ({
  page,
  currentTool,
  color,
  size,
  fontFamily,
  smartShapeEnabled,
  rulerEnabled,
  onDisableRuler,
  palmRejectionActive,
  zoomLevel,
  onPageUpdate,
  audioRecordingTime,
  isRecordingAudio,
  audioSeekMode,
  onSeekAudioFromStroke,
  playbackTime,
  onRequestInkInput,
  inkInputTargetId,
  onZoomChange,
  fitRequest,
  onCopySelection,
  readClipboard,
  hasClipboard,
  onOcrImage,
  ocrBusyImageId,
  onCreateFlashcard,
  isCreatingFlashcard,
  laserMode,
  nightMode
}) => {
  /** Lớp tĩnh: nét đã lưu — chỉ vẽ lại khi tập nét thay đổi */
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Lớp động: nét đang vẽ dở & khung lasso — vẽ lại theo từng điểm bút */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Kích thước LOGIC của trang giấy — không phụ thuộc zoom hay cửa sổ.
  // Toàn bộ toạ độ nét vẽ, khung chữ, ảnh đều nằm trong hệ toạ độ này.
  const pageDimensions = useMemo(() => getPageDimensions(page), [page]);
  const { width: pageWidth, height: pageHeight } = pageDimensions;

  // Độ phân giải thực của canvas: zoom càng sâu càng cần nhiều pixel để nét
  // mực không bị rỗ, nhưng phải có trần để không cạn RAM.
  const renderScale = useMemo(() => {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.min(MAX_RENDER_SCALE, Math.max(1, zoomLevel * dpr));
  }, [zoomLevel]);

  // Mỗi cử chỉ (kéo, resize) sinh một key riêng để History gộp thành 1 bước undo
  const gestureKeyRef = useRef<string>('');
  const beginGesture = (prefix: string) => {
    gestureKeyRef.current = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return gestureKeyRef.current;
  };

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  /**
   * Bản sao luôn mới nhất của nét đang vẽ.
   * Bộ đếm giờ nắn hình chạy trong setTimeout nên nó chỉ nhìn thấy giá trị
   * `currentStroke` của lần render lúc hẹn giờ — thiếu mất những điểm vừa vẽ.
   * Ref này cho nó dữ liệu đúng tại thời điểm bắn.
   */
  const currentStrokeRef = useRef<Point[]>([]);
  useEffect(() => {
    currentStrokeRef.current = currentStroke;
  }, [currentStroke]);

  /** Tên hình vừa được nắn, hiện thoáng qua để người dùng biết nó đã hoạt động */
  const [shapeHint, setShapeHint] = useState<string | null>(null);
  const [lassoPolygon, setLassoPolygon] = useState<{ x: number; y: number }[]>([]);
  const [selectedStrokes, setSelectedStrokes] = useState<Stroke[]>([]);
  // Lasso chọn được cả khung chữ và ảnh, không chỉ nét vẽ
  const [selectedTextIds, setSelectedTextIds] = useState<string[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [lassoMenuPos, setLassoMenuPos] = useState<{ x: number; y: number } | null>(null);

  const selectionCount = selectedStrokes.length + selectedTextIds.length + selectedImageIds.length;

  const clearSelection = () => {
    setLassoPolygon([]);
    setSelectedStrokes([]);
    setSelectedTextIds([]);
    setSelectedImageIds([]);
    setLassoMenuPos(null);
  };

  // Lasso Selection Dragging & Scale State
  const [isDraggingLasso, setIsDraggingLasso] = useState(false);
  const [lassoDragLastPos, setLassoDragLastPos] = useState<{ x: number; y: number } | null>(null);

  // Active Selected Text Element State
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [isResizingText, setIsResizingText] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; w: number; h: number; font: number }>({ x: 0, y: 0, w: 0, h: 0, font: 0 });

  // Active Selected Image Element State
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isResizingImage, setIsResizingImage] = useState(false);
  const [imageDragOffset, setImageDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imageResizeStart, setImageResizeStart] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });

  // Interactive InkToText Edit Modal State
  const [inkModalOpen, setInkModalOpen] = useState(false);
  const [pendingRecognizedText, setPendingRecognizedText] = useState('');
  const [pendingSuggestions, setPendingSuggestions] = useState<string[]>([]);
  const [pendingStrokesToReplace, setPendingStrokesToReplace] = useState<string[]>([]);
  const [pendingBbox, setPendingBbox] = useState<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 300, height: 80 });
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [isRecognizingSelection, setIsRecognizingSelection] = useState(false);

  /** Tham chiếu tới từng textarea, cần để biết con trỏ đang đặt ở dòng nào */
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  const shapeHoldTimer = useRef<NodeJS.Timeout | null>(null);
  const shapeHintTimer = useRef<NodeJS.Timeout | null>(null);
  /** Vệt laser đang tan dần; không bao giờ được lưu vào trang */
  const [laserTrails, setLaserTrails] = useState<{ id: string; points: Point[]; bornAt: number }[]>([]);

  // Dọn vệt laser đã hết hạn
  useEffect(() => {
    if (laserTrails.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setLaserTrails(prev => prev.filter(t => now - t.bornAt < LASER_LIFETIME));
    }, 100);
    return () => clearInterval(timer);
  }, [laserTrails.length]);

  /** Vị trí thước kẻ trên trang; null khi chưa bật */
  const [ruler, setRuler] = useState<RulerState | null>(null);

  // Bật thước thì đặt sẵn ở giữa trang, tắt thì cất đi
  useEffect(() => {
    if (rulerEnabled) {
      setRuler(prev =>
        prev ?? {
          x: pageWidth / 2,
          y: pageHeight * 0.4,
          angle: 0,
          length: Math.min(720, Math.max(280, pageWidth * 0.7))
        }
      );
    } else {
      setRuler(null);
    }
  }, [rulerEnabled, pageWidth, pageHeight]);

  /** Nét hiện tại đã được nắn thành hình chuẩn, không nhận thêm điểm nữa */
  const shapeSnappedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (shapeHoldTimer.current) clearTimeout(shapeHoldTimer.current);
      if (shapeHintTimer.current) clearTimeout(shapeHintTimer.current);
    };
  }, []);

  // Deselect text box when tool changes to pen/highlighter/eraser/lasso
  useEffect(() => {
    if (currentTool !== 'text') {
      setSelectedTextId(null);
    }
  }, [currentTool]);

  // Backing store của cả hai lớp gắn với KHỔ GIẤY, không gắn với cửa sổ.
  // Zoom chỉ làm tăng độ phân giải, không thay đổi hệ toạ độ trang.
  useEffect(() => {
    const backingWidth = Math.round(pageWidth * renderScale);
    const backingHeight = Math.round(pageHeight * renderScale);

    [staticCanvasRef.current, canvasRef.current].forEach(canvas => {
      if (!canvas) return;
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    });

    renderStaticLayer();
    renderDynamicLayer();
  }, [pageWidth, pageHeight, renderScale]);

  // ---------------------------------------------------------------------------
  // Khung nhìn: cuộn trang, neo điểm zoom, pinch, Ctrl + lăn chuột
  // ---------------------------------------------------------------------------
  const previousZoomRef = useRef(zoomLevel);
  /** Điểm (toạ độ màn hình) cần giữ cố định khi zoom; null = giữa khung nhìn */
  const zoomAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);
  const lastPinchMidpointRef = useRef<{ x: number; y: number } | null>(null);
  /** Trạng thái kéo trang bằng 1 ngón / chuột (khi Palm Rejection đang bật) */
  const panRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  /**
   * Vị trí cuộn được ghi lại qua sự kiện scroll.
   * Cần thiết vì khi zoom nhỏ lại, lớp đệm co lại và trình duyệt tự kẹp
   * scrollLeft/scrollTop trước khi useLayoutEffect chạy — đọc trực tiếp từ DOM
   * lúc đó sẽ ra giá trị đã bị kẹp, làm điểm neo zoom bị lệch.
   */
  const scrollPositionRef = useRef({ left: 0, top: 0 });

  /**
   * Sau khi zoom đổi, dịch vùng cuộn sao cho điểm neo nằm nguyên vị trí cũ
   * trên màn hình — nếu không, trang sẽ "nhảy" về góc trên-trái mỗi lần zoom.
   */
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const previousZoom = previousZoomRef.current;
    previousZoomRef.current = zoomLevel;

    if (!scroller || previousZoom === zoomLevel || previousZoom <= 0) return;

    const ratio = zoomLevel / previousZoom;
    const rect = scroller.getBoundingClientRect();
    const anchor = zoomAnchorRef.current;
    const anchorX = anchor ? anchor.x - rect.left : scroller.clientWidth / 2;
    const anchorY = anchor ? anchor.y - rect.top : scroller.clientHeight / 2;

    const before = scrollPositionRef.current;
    const nextLeft = (before.left + anchorX) * ratio - anchorX;
    const nextTop = (before.top + anchorY) * ratio - anchorY;

    scroller.scrollLeft = Math.max(0, nextLeft);
    scroller.scrollTop = Math.max(0, nextTop);
    scrollPositionRef.current = { left: scroller.scrollLeft, top: scroller.scrollTop };
    zoomAnchorRef.current = null;
  }, [zoomLevel]);

  // Pinch 2 ngón để zoom + Ctrl/⌘ & lăn chuột.
  // Phải dùng listener native với passive:false vì React gắn touchmove/wheel ở
  // chế độ passive nên preventDefault() trong onTouchMove sẽ không có tác dụng.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const distanceBetween = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );

    const midpointOf = (touches: TouchList) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    });

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pinchRef.current = {
          startDistance: distanceBetween(event.touches),
          startZoom: zoomLevel
        };
        lastPinchMidpointRef.current = midpointOf(event.touches);
      }
    };

    // Hai ngón làm cả hai việc cùng lúc: khoảng cách -> zoom, trung điểm -> pan
    const handleTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (event.touches.length !== 2 || !pinch || pinch.startDistance <= 0) return;

      event.preventDefault();
      const midpoint = midpointOf(event.touches);

      const previousMidpoint = lastPinchMidpointRef.current;
      if (previousMidpoint) {
        scroller.scrollLeft -= midpoint.x - previousMidpoint.x;
        scroller.scrollTop -= midpoint.y - previousMidpoint.y;
      }
      lastPinchMidpointRef.current = midpoint;

      const scale = distanceBetween(event.touches) / pinch.startDistance;
      zoomAnchorRef.current = midpoint;
      onZoomChange(clampZoom(pinch.startZoom * scale, MIN_ZOOM, MAX_ZOOM));
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        pinchRef.current = null;
        lastPinchMidpointRef.current = null;
      }
    };

    const handleWheel = (event: WheelEvent) => {
      // Trackpad pinch trên desktop cũng phát wheel kèm ctrlKey
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomAnchorRef.current = { x: event.clientX, y: event.clientY };
      onZoomChange(clampZoom(zoomLevel * (event.deltaY < 0 ? 1.12 : 1 / 1.12), MIN_ZOOM, MAX_ZOOM));
    };

    scroller.addEventListener('touchstart', handleTouchStart, { passive: true });
    scroller.addEventListener('touchmove', handleTouchMove, { passive: false });
    scroller.addEventListener('touchend', handleTouchEnd, { passive: true });
    scroller.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    scroller.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      scroller.removeEventListener('touchstart', handleTouchStart);
      scroller.removeEventListener('touchmove', handleTouchMove);
      scroller.removeEventListener('touchend', handleTouchEnd);
      scroller.removeEventListener('touchcancel', handleTouchEnd);
      scroller.removeEventListener('wheel', handleWheel);
    };
  }, [zoomLevel, onZoomChange]);

  // Canh trang vừa chiều ngang / vừa toàn trang
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!fitRequest || !scroller) return;

    const availableWidth = scroller.clientWidth - SHEET_MARGIN * 2;
    const availableHeight = scroller.clientHeight - SHEET_MARGIN * 2;
    if (availableWidth <= 0 || availableHeight <= 0) return;

    const target =
      fitRequest.mode === 'width'
        ? availableWidth / pageWidth
        : Math.min(availableWidth / pageWidth, availableHeight / pageHeight);

    zoomAnchorRef.current = null;
    onZoomChange(clampZoom(target, MIN_ZOOM, MAX_ZOOM));

    // Về đầu trang để thấy ngay phần trên cùng
    requestAnimationFrame(() => {
      scroller.scrollTop = 0;
    });
  }, [fitRequest?.token]);

  /** LỚP TĨNH — nét đã lưu và vệt sáng đồng bộ âm thanh */
  const renderStaticLayer = () => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mọi lệnh vẽ bên dưới dùng đơn vị toạ độ TRANG; renderScale chỉ là độ nét.
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.clearRect(0, 0, pageWidth, pageHeight);

    // 0. Audio Sync Halo: làm sáng những nét được viết đúng thời điểm đang phát
    if (playbackTime !== null) {
      page.strokes.forEach(stroke => {
        if (stroke.audioTimestamp === undefined) return;
        if (Math.abs(stroke.audioTimestamp - playbackTime) > PLAYBACK_HIGHLIGHT_WINDOW) return;

        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = stroke.size * 3 + 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.restore();
      });
    }

    // 1. Nét đã lưu
    page.strokes.forEach(stroke => {
      drawSingleStroke(ctx, stroke.points, stroke.color, stroke.size, stroke.tool);
    });
  };

  /**
   * LỚP ĐỘNG — chỉ nét đang vẽ dở và khung lasso.
   *
   * Đây là lớp duy nhất được vẽ lại theo từng điểm bút. Trước khi tách, mỗi
   * điểm bút vẽ lại toàn bộ nét đã có của cả trang; trên khổ A4 ở độ phân giải
   * ~1985×2807 thì vài trăm nét là bắt đầu giật.
   */
  const renderDynamicLayer = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.clearRect(0, 0, pageWidth, pageHeight);

    if (currentStroke.length > 0) {
      // Nét đang vẽ ở chế độ laser hiện màu đỏ ngay từ đầu
      drawSingleStroke(
        ctx,
        currentStroke,
        laserMode ? '#ef4444' : color,
        laserMode ? 6 : size,
        laserMode ? 'pen' : currentTool
      );
    }

    // Vệt laser đang tan dần
    if (laserTrails.length > 0) {
      const now = Date.now();
      laserTrails.forEach(trail => {
        const age = (now - trail.bornAt) / LASER_LIFETIME;
        if (age >= 1) return;

        ctx.save();
        ctx.globalAlpha = 1 - age;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        trail.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.restore();
      });
    }

    if (lassoPolygon.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lassoPolygon[0].x, lassoPolygon[0].y);
      for (let i = 1; i < lassoPolygon.length; i++) {
        ctx.lineTo(lassoPolygon[i].x, lassoPolygon[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.fillStyle = 'rgba(79, 70, 229, 0.14)';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };

  // Lớp tĩnh chỉ vẽ lại khi tập nét thay đổi (nhấc bút, xoá, hoàn tác)
  useEffect(() => {
    renderStaticLayer();
  }, [page.strokes, playbackTime, renderScale, pageWidth, pageHeight]);

  // Lớp động vẽ lại theo từng điểm bút — nhưng chỉ có đúng một nét trên đó
  useEffect(() => {
    renderDynamicLayer();
  }, [currentStroke, lassoPolygon, renderScale, pageWidth, pageHeight, color, size, currentTool, laserMode, laserTrails]);

  // Smooth Bezier Drawing
  const drawSingleStroke = (
    ctx: CanvasRenderingContext2D, 
    pts: Point[], 
    strokeColor: string, 
    strokeSize: number, 
    tool: ToolType
  ) => {
    if (pts.length < 1) return;

    ctx.save();

    if (tool === 'highlighter') {
      ctx.globalAlpha = 0.4;
      ctx.globalCompositeOperation = 'multiply';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeSize * 2.5;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    } else {
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = strokeColor;

      if (pts.length === 1) {
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, (pts[0].pressure || 0.5) * strokeSize, 0, Math.PI * 2);
        ctx.fill();
      } else {
        for (let i = 1; i < pts.length; i++) {
          ctx.beginPath();
          const p1 = pts[i - 1];
          const p2 = pts[i];
          const avgPressure = ((p1.pressure || 0.5) + (p2.pressure || 0.5)) / 2;
          ctx.lineWidth = Math.max(1, strokeSize * avgPressure * 1.5);
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  };

  // Pointer Down on Canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Deselect text / image box when drawing on canvas
    if (selectedTextId) setSelectedTextId(null);
    if (selectedImageId) setSelectedImageId(null);

    if (!canvasRef.current) return;
    const { x, y } = toCanvasPoint(e.clientX, e.clientY);

    // AUDIO SYNC: chạm vào nét vẽ để nhảy tới đoạn ghi âm lúc viết nét đó.
    // Kiểm tra trước Palm Rejection để chạm bằng ngón tay vẫn hoạt động.
    if (audioSeekMode) {
      const hit = findNearestStrokeWithAudio(x, y);
      if (hit?.audioTimestamp !== undefined) {
        onSeekAudioFromStroke(hit.audioTimestamp);
      }
      return;
    }

    // STRICT PALM REJECTION: When ON, strictly allow ONLY Stylus / Pen pointers (e.pointerType === 'pen')
    // Ngón tay & chuột không vẽ nữa mà dùng để KÉO CUỘN trang giấy.
    if (palmRejectionActive && e.pointerType !== 'pen') {
      const scroller = scrollerRef.current;
      if (scroller && !pinchRef.current) {
        panRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          scrollLeft: scroller.scrollLeft,
          scrollTop: scroller.scrollTop
        };
      }
      return;
    }

    const pressure = e.pressure > 0 ? e.pressure : 0.6;
    const pt: Point = { x, y, pressure, time: Date.now() };

    // Check if clicking inside active Lasso Selection area to DRAG MOVE objects
    if (selectionCount > 0 && lassoPolygon.length > 2) {
      if (isPointInPolygon({ x, y }, lassoPolygon)) {
        beginGesture('lasso-move');
        setIsDraggingLasso(true);
        setLassoDragLastPos({ x, y });
        return;
      }
    }

    setIsDrawing(true);

    if (currentTool === 'lasso') {
      clearSelection();
      setLassoPolygon([{ x, y }]);
    } else if (currentTool.startsWith('eraser')) {
      beginGesture('erase');
      eraseAtPoint(x, y);
    } else if (currentTool === 'text') {
      addTextElementAt(x, y);
    } else {
      shapeSnappedRef.current = false;
      const startPoint = ruler ? (snapPointToRuler(pt, ruler) ?? pt) : pt;
      const first = { ...pt, x: startPoint.x, y: startPoint.y };
      setCurrentStroke([first]);
      currentStrokeRef.current = [first];

      if (smartShapeEnabled && !ruler) {
        if (shapeHoldTimer.current) clearTimeout(shapeHoldTimer.current);
        shapeHoldTimer.current = setTimeout(triggerShapeSmooth, 500);
      }
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLElement> | any) => {
    // Kéo cuộn trang bằng ngón tay / chuột — pinch 2 ngón được ưu tiên hơn
    const pan = panRef.current;
    if (pan) {
      const scroller = scrollerRef.current;
      if (scroller && !pinchRef.current) {
        scroller.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
        scroller.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
      }
      return;
    }

    if (!canvasRef.current) return;
    const { x, y } = toCanvasPoint(e.clientX, e.clientY);

    // Handle Dragging / Moving Lasso Selected Objects
    if (isDraggingLasso && lassoDragLastPos && selectionCount > 0) {
      const dx = x - lassoDragLastPos.x;
      const dy = y - lassoDragLastPos.y;
      setLassoDragLastPos({ x, y });

      const strokeIds = selectedStrokes.map(s => s.id);

      const updatedStrokes = page.strokes.map(stroke =>
        strokeIds.includes(stroke.id)
          ? { ...stroke, points: stroke.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) }
          : stroke
      );

      const updatedTexts = page.textElements.map(t =>
        selectedTextIds.includes(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t
      );

      const updatedImages = page.imageElements.map(i =>
        selectedImageIds.includes(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i
      );

      setLassoPolygon(lassoPolygon.map(p => ({ x: p.x + dx, y: p.y + dy })));
      setSelectedStrokes(updatedStrokes.filter(s => strokeIds.includes(s.id)));

      onPageUpdate(
        { ...page, strokes: updatedStrokes, textElements: updatedTexts, imageElements: updatedImages },
        gestureKeyRef.current
      );

      if (lassoMenuPos) {
        setLassoMenuPos({ x: lassoMenuPos.x + dx * zoomLevel, y: lassoMenuPos.y + dy * zoomLevel });
      }
      return;
    }

    // Dragging Text Box
    if (isDraggingText && selectedTextId) {
      const updated = page.textElements.map(t => {
        if (t.id === selectedTextId) {
          return {
            ...t,
            x: Math.max(0, x - dragOffset.x),
            y: Math.max(0, y - dragOffset.y)
          };
        }
        return t;
      });
      onPageUpdate({ ...page, textElements: updated }, gestureKeyRef.current);
      return;
    }

    // Dragging Image Element
    if (isDraggingImage && selectedImageId) {
      const updated = page.imageElements.map(img =>
        img.id === selectedImageId
          ? { ...img, x: Math.max(0, x - imageDragOffset.x), y: Math.max(0, y - imageDragOffset.y) }
          : img
      );
      onPageUpdate({ ...page, imageElements: updated }, gestureKeyRef.current);
      return;
    }

    // Resizing Image Element (giữ nguyên tỉ lệ khung hình gốc)
    if (isResizingImage && selectedImageId) {
      const ratio = imageResizeStart.h / Math.max(1, imageResizeStart.w);
      const newWidth = Math.max(60, imageResizeStart.w + (x - imageResizeStart.x));

      const updated = page.imageElements.map(img =>
        img.id === selectedImageId
          ? { ...img, width: Math.round(newWidth), height: Math.round(newWidth * ratio) }
          : img
      );
      onPageUpdate({ ...page, imageElements: updated }, gestureKeyRef.current);
      return;
    }

    // Resizing Text Box
    if (isResizingText && selectedTextId) {
      const deltaX = x - resizeStart.x;
      const deltaY = y - resizeStart.y;
      const newWidth = Math.max(140, resizeStart.w + deltaX);
      const newHeight = Math.max(50, resizeStart.h + deltaY);
      const scale = newWidth / Math.max(1, resizeStart.w);
      const newFontSize = Math.min(72, Math.max(16, Math.round(resizeStart.font * scale)));

      const updated = page.textElements.map(t => {
        if (t.id === selectedTextId) {
          return {
            ...t,
            width: newWidth,
            height: newHeight,
            fontSize: newFontSize
          };
        }
        return t;
      });
      onPageUpdate({ ...page, textElements: updated }, gestureKeyRef.current);
      return;
    }

    if (!isDrawing) return;

    const pressure = (e as any).pressure > 0 ? (e as any).pressure : 0.6;
    const pt: Point = { x, y, pressure, time: Date.now() };

    if (currentTool === 'lasso') {
      setLassoPolygon(prev => [...prev, { x, y }]);
    } else if (currentTool.startsWith('eraser')) {
      eraseAtPoint(x, y);
    } else if (currentTool === 'pen' || currentTool === 'highlighter') {
      // Nét đã được nắn thành hình chuẩn thì giữ nguyên cho tới khi nhấc bút
      if (shapeSnappedRef.current) return;

      // Có thước trên trang: nét bút bị hút vào cạnh thước khi vẽ đủ gần,
      // ra ngoài tầm hút thì vẫn vẽ tự do như bình thường
      if (ruler) {
        const snapped = snapPointToRuler(pt, ruler);
        if (snapped) {
          setCurrentStroke(prev => [...prev, { ...pt, x: snapped.x, y: snapped.y }]);
          return;
        }
      }

      setCurrentStroke(prev => [...prev, pt]);

      if (smartShapeEnabled && !ruler && shapeHoldTimer.current) {
        clearTimeout(shapeHoldTimer.current);
        // Hẹn lại sau mỗi lần bút dịch chuyển: chỉ khi bút ĐỨNG YÊN đủ lâu thì
        // bộ đếm mới bắn được.
        shapeHoldTimer.current = setTimeout(triggerShapeSmooth, 500);
      }
    }
  };

  // Detect Stylus Gesture: Scratch to Erase (Dense back-and-forth scribble)
  const isScratchGesture = (pts: Point[]): boolean => {
    if (pts.length < 16) return false;

    let dirFlips = 0;
    let totalLen = 0;
    let prevDx = 0;

    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      totalLen += Math.hypot(dx, dy);

      if ((dx > 3 && prevDx < -3) || (dx < -3 && prevDx > 3)) {
        dirFlips++;
      }
      if (Math.abs(dx) > 3) prevDx = dx;
    }

    const scratchBbox = VietnameseInkRecognizer.getBoundingBox([{
      id: 'temp', tool: 'pen', color: '#000', size: 1, opacity: 1, points: pts
    }]);

    const bboxDiag = Math.hypot(scratchBbox.width, scratchBbox.height);
    const densityRatio = totalLen / Math.max(10, bboxDiag);

    return dirFlips >= 8 && densityRatio >= 3.2 && totalLen > 150;
  };

  // Detect Stylus Gesture: Circle to Select (Large intentional enclosed loop)
  const isCircleGesture = (pts: Point[]): boolean => {
    if (pts.length < 16) return false;
    const start = pts[0];
    const end = pts[pts.length - 1];
    const distStartEnd = Math.hypot(end.x - start.x, end.y - start.y);

    let totalLen = 0;
    for (let i = 1; i < pts.length; i++) {
      totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }

    const circleBbox = VietnameseInkRecognizer.getBoundingBox([{
      id: 'temp', tool: 'pen', color: '#000', size: 1, opacity: 1, points: pts
    }]);

    const area = circleBbox.width * circleBbox.height;

    return (
      distStartEnd < 35 && 
      totalLen > 180 && 
      area > 6500 && 
      circleBbox.width > 60 && 
      circleBbox.height > 60
    );
  };

  // Check direct point proximity for Scratch Erase
  const isStrokeIntersectedByScratch = (targetStroke: Stroke, scratchPoints: Point[]): boolean => {
    return targetStroke.points.some(tp =>
      scratchPoints.some(sp => Math.hypot(sp.x - tp.x, sp.y - tp.y) < 20)
    );
  };

  // Pointer Up
  const handlePointerUp = () => {
    if (panRef.current) {
      panRef.current = null;
      return;
    }

    if (isDraggingLasso) {
      setIsDraggingLasso(false);
      setLassoDragLastPos(null);
    }

    if (isDraggingText) setIsDraggingText(false);
    if (isResizingText) setIsResizingText(false);
    if (isDraggingImage) setIsDraggingImage(false);
    if (isResizingImage) setIsResizingImage(false);

    if (!isDrawing) return;
    setIsDrawing(false);

    if (shapeHoldTimer.current) clearTimeout(shapeHoldTimer.current);
    shapeSnappedRef.current = false;

    if (currentTool === 'lasso' && lassoPolygon.length > 2) {
      const { strokes, textIds, imageIds } = collectSelection(lassoPolygon);
      setSelectedStrokes(strokes);
      setSelectedTextIds(textIds);
      setSelectedImageIds(imageIds);

      if (strokes.length + textIds.length + imageIds.length > 0) {
        const bbox = getSelectionBounds(strokes, textIds, imageIds);
        setLassoMenuPos(toClientPoint(bbox.x + bbox.width / 2, bbox.y));
      } else {
        setLassoPolygon([]);
      }
    } else if (currentStroke.length > 0) {
      // 1. Check Stylus Gesture: Scratch to Erase
      if (currentTool === 'pen' && isScratchGesture(currentStroke)) {
        const remainingStrokes = page.strokes.filter(s => !isStrokeIntersectedByScratch(s, currentStroke));

        if (remainingStrokes.length !== page.strokes.length) {
          onPageUpdate({ ...page, strokes: remainingStrokes });
          setCurrentStroke([]);
          return;
        }
      }

      // 2. Check Stylus Gesture: Circle to Select
      if (currentTool === 'pen' && isCircleGesture(currentStroke)) {
        const circlePoly = currentStroke.map(p => ({ x: p.x, y: p.y }));
        const { strokes, textIds, imageIds } = collectSelection(circlePoly);

        if (strokes.length + textIds.length + imageIds.length > 0) {
          setSelectedStrokes(strokes);
          setSelectedTextIds(textIds);
          setSelectedImageIds(imageIds);
          setLassoPolygon(circlePoly);
          const bbox = getSelectionBounds(strokes, textIds, imageIds);
          setLassoMenuPos(toClientPoint(bbox.x + bbox.width / 2, bbox.y));
          setCurrentStroke([]);
          return;
        }
      }

      // Chế độ laser: nét chỉ để chỉ trỏ khi trình chiếu, KHÔNG lưu vào trang
      if (laserMode) {
        setLaserTrails(prev => [
          ...prev,
          { id: `laser-${Date.now()}`, points: currentStroke, bornAt: Date.now() }
        ]);
        setCurrentStroke([]);
        return;
      }

      // Normal Pen Drawing: Save permanent stroke on canvas
      const newStroke: Stroke = {
        id: `s-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tool: currentTool,
        color: color,
        size: size,
        opacity: currentTool === 'highlighter' ? 0.4 : 1,
        points: currentStroke,
        audioTimestamp: isRecordingAudio ? audioRecordingTime : undefined
      };

      onPageUpdate({
        ...page,
        strokes: [...page.strokes, newStroke]
      });
      setCurrentStroke([]);
    }
  };

  // Phóng to / thu nhỏ mọi đối tượng trong vùng khoanh quanh tâm khung bao
  const handleScaleSelectedStrokes = (scaleFactor: number) => {
    if (selectionCount === 0) return;

    const bbox = getSelectionBounds(selectedStrokes, selectedTextIds, selectedImageIds);
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
    const strokeIds = selectedStrokes.map(s => s.id);

    const scaleAround = (value: number, center: number) => center + (value - center) * scaleFactor;

    const updatedStrokes = page.strokes.map(stroke =>
      strokeIds.includes(stroke.id)
        ? {
            ...stroke,
            size: Math.max(1, stroke.size * scaleFactor),
            points: stroke.points.map(p => ({
              ...p,
              x: scaleAround(p.x, centerX),
              y: scaleAround(p.y, centerY)
            }))
          }
        : stroke
    );

    const updatedTexts = page.textElements.map(t =>
      selectedTextIds.includes(t.id)
        ? {
            ...t,
            x: scaleAround(t.x, centerX),
            y: scaleAround(t.y, centerY),
            width: Math.max(60, t.width * scaleFactor),
            height: Math.max(30, t.height * scaleFactor),
            fontSize: Math.min(96, Math.max(10, Math.round(t.fontSize * scaleFactor)))
          }
        : t
    );

    const updatedImages = page.imageElements.map(i =>
      selectedImageIds.includes(i.id)
        ? {
            ...i,
            x: scaleAround(i.x, centerX),
            y: scaleAround(i.y, centerY),
            width: Math.max(20, i.width * scaleFactor),
            height: Math.max(20, i.height * scaleFactor)
          }
        : i
    );

    setLassoPolygon(
      lassoPolygon.map(p => ({ x: scaleAround(p.x, centerX), y: scaleAround(p.y, centerY) }))
    );

    const updatedSelectedStrokes = updatedStrokes.filter(s => strokeIds.includes(s.id));
    setSelectedStrokes(updatedSelectedStrokes);

    onPageUpdate({
      ...page,
      strokes: updatedStrokes,
      textElements: updatedTexts,
      imageElements: updatedImages
    });

    const scaledBbox = {
      x: scaleAround(bbox.x, centerX),
      y: scaleAround(bbox.y, centerY),
      width: bbox.width * scaleFactor
    };
    setLassoMenuPos(toClientPoint(scaledBbox.x + scaledBbox.width / 2, scaledBbox.y));
  };

  // Eraser collision
  const eraseAtPoint = (x: number, y: number) => {
    const eraserRadius = size * 2.5;

    const updatedStrokes = page.strokes.filter(
      stroke => !stroke.points.some(p => Math.hypot(p.x - x, p.y - y) < eraserRadius)
    );

    // Khung chữ và ảnh cũng xoá được, nhưng chỉ khi đầu tẩy nằm HẲN bên trong
    // chúng — dùng mép ngoài sẽ khiến việc tẩy nét vẽ sát cạnh ảnh vô tình
    // xoá mất cả tấm ảnh.
    const insideRect = (r: { x: number; y: number; width: number; height: number }) =>
      x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height;

    const updatedTexts = page.textElements.filter(t => !insideRect(t));
    const updatedImages = page.imageElements.filter(i => !insideRect(i));

    const changed =
      updatedStrokes.length !== page.strokes.length ||
      updatedTexts.length !== page.textElements.length ||
      updatedImages.length !== page.imageElements.length;

    if (changed) {
      // Cùng một lần quét tẩy chỉ tính là MỘT bước hoàn tác
      onPageUpdate(
        { ...page, strokes: updatedStrokes, textElements: updatedTexts, imageElements: updatedImages },
        gestureKeyRef.current
      );
    }
  };

  /**
   * Xoay vòng ô chọn ở dòng đang đặt con trỏ: không có → ☐ → ☑ → không có.
   *
   * Dùng ký tự thay vì một loại phần tử riêng để danh sách việc vẫn là chữ
   * thuần — tìm kiếm, xuất file và sao lưu không cần biết gì thêm.
   */
  const toggleCheckboxOnCaretLine = (element: TextElement) => {
    const textarea = textareaRefs.current.get(element.id);
    const caret = textarea?.selectionStart ?? element.text.length;
    const text = element.text;

    const lineStart = text.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
    const foundEnd = text.indexOf('\n', lineStart);
    const lineEnd = foundEnd < 0 ? text.length : foundEnd;
    const line = text.slice(lineStart, lineEnd);

    let nextLine: string;
    if (line.startsWith('☑ ')) nextLine = line.slice(2);
    else if (line.startsWith('☐ ')) nextLine = '☑ ' + line.slice(2);
    else nextLine = '☐ ' + line;

    const nextText = text.slice(0, lineStart) + nextLine + text.slice(lineEnd);
    const updated = page.textElements.map(t =>
      t.id === element.id ? { ...t, text: nextText } : t
    );
    onPageUpdate({ ...page, textElements: updated });

    // Giữ con trỏ ở đúng dòng vừa sửa
    requestAnimationFrame(() => {
      const shift = nextLine.length - line.length;
      const position = Math.max(lineStart, caret + shift);
      textarea?.focus();
      textarea?.setSelectionRange(position, position);
    });
  };

  /** Tìm nét vẽ gần điểm chạm nhất mà có mốc thời gian ghi âm */
  const findNearestStrokeWithAudio = (x: number, y: number): Stroke | null => {
    const HIT_RADIUS = 28;
    let best: Stroke | null = null;
    let bestDistance = HIT_RADIUS;

    page.strokes.forEach(stroke => {
      if (stroke.audioTimestamp === undefined) return;
      stroke.points.forEach(p => {
        const distance = Math.hypot(p.x - x, p.y - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = stroke;
        }
      });
    });

    return best;
  };

  /**
   * Toạ độ con trỏ trên màn hình -> toạ độ trang giấy.
   * Dùng tỉ lệ rect thực tế thay vì chia cho zoomLevel để không lệch khi trang
   * đang được canh giữa hoặc vùng cuộn đang ở vị trí bất kỳ.
   */
  const toCanvasPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: clientX, y: clientY };
    return {
      x: (clientX - rect.left) * (pageWidth / rect.width),
      y: (clientY - rect.top) * (pageHeight / rect.height)
    };
  };

  /** Toạ độ trang giấy -> toạ độ màn hình (cho menu dùng position: fixed) */
  const toClientPoint = (pageX: number, pageY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: pageX, y: pageY };
    return {
      x: rect.left + pageX * (rect.width / pageWidth),
      y: rect.top + pageY * (rect.height / pageHeight)
    };
  };

  // Point in polygon test
  const isPointInPolygon = (pt: { x: number; y: number }, poly: { x: number; y: number }[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Lasso collision
  const isStrokeInPolygon = (stroke: Stroke, poly: { x: number; y: number }[]) => {
    return stroke.points.some(pt => isPointInPolygon(pt, poly));
  };

  /** Khung chữ / ảnh coi là được chọn khi một góc hoặc tâm nằm trong vùng khoanh */
  const isRectInPolygon = (
    rect: { x: number; y: number; width: number; height: number },
    poly: { x: number; y: number }[]
  ) => {
    const probes = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    ];
    return probes.some(p => isPointInPolygon(p, poly));
  };

  /** Chọn mọi loại đối tượng nằm trong vùng khoanh */
  const collectSelection = (poly: { x: number; y: number }[]) => ({
    strokes: page.strokes.filter(s => isStrokeInPolygon(s, poly)),
    textIds: page.textElements.filter(t => isRectInPolygon(t, poly)).map(t => t.id),
    imageIds: page.imageElements.filter(i => isRectInPolygon(i, poly)).map(i => i.id)
  });

  /** Khung bao chung, tính trên một trang cụ thể (dùng khi vừa dán xong) */
  const getSelectionBoundsIn = (
    targetPage: NotebookPage,
    strokes: Stroke[],
    textIds: string[],
    imageIds: string[]
  ) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const include = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    strokes.forEach(s => s.points.forEach(p => include(p.x, p.y)));
    targetPage.textElements
      .filter(t => textIds.includes(t.id))
      .forEach(t => { include(t.x, t.y); include(t.x + t.width, t.y + t.height); });
    targetPage.imageElements
      .filter(i => imageIds.includes(i.id))
      .forEach(i => { include(i.x, i.y); include(i.x + i.width, i.y + i.height); });

    if (minX === Infinity) return { x: 0, y: 0, width: 100, height: 40 };
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  };

  /** Khung bao trên trang đang mở */
  const getSelectionBounds = (strokes: Stroke[], textIds: string[], imageIds: string[]) =>
    getSelectionBoundsIn(page, strokes, textIds, imageIds);

  // Nắn nét thành hình học khi giữ yên bút
  const triggerShapeSmooth = () => {
    const points = currentStrokeRef.current;
    if (points.length < 8) return;

    const smoothed = ShapeSmoother.detectAndSmooth({
      id: 'temp',
      tool: currentTool,
      color,
      size,
      opacity: 1,
      points
    });

    if (!smoothed) return;

    setCurrentStroke(smoothed.smoothedPoints);
    currentStrokeRef.current = smoothed.smoothedPoints;

    // Đã nắn xong thì khoá nét lại: nếu vẫn cho thêm điểm, mỗi rung tay nhỏ sẽ
    // nối thêm vào hình vừa nắn và phá hỏng nó.
    shapeSnappedRef.current = true;

    setShapeHint(smoothed.label);
    if (shapeHintTimer.current) clearTimeout(shapeHintTimer.current);
    shapeHintTimer.current = setTimeout(() => setShapeHint(null), 1400);
  };

  // Add Text Element
  const addTextElementAt = (x: number, y: number) => {
    const newText: TextElement = {
      id: `t-${Date.now()}`,
      x,
      y,
      width: 340,
      height: 90,
      text: 'Ghi chú Tiếng Việt mới...',
      fontFamily: fontFamily,
      fontSize: 28,
      color: color
    };

    onPageUpdate({
      ...page,
      textElements: [...page.textElements, newText]
    });
    setSelectedTextId(newText.id);
  };

  // Open Interactive InkToText Modal upon Lasso action
  const handleConvertToTextModal = async () => {
    if (selectedStrokes.length === 0 || isRecognizingSelection) return;

    setIsRecognizingSelection(true);
    const strokeIds = selectedStrokes.map(s => s.id);
    const fallbackBbox = VietnameseInkRecognizer.getBoundingBox(selectedStrokes);

    try {
      const result = await VietnameseInkRecognizer.recognizeSelection(selectedStrokes);
      setPendingRecognizedText(result.text);
      setPendingSuggestions(result.suggestions);
      setPendingStrokesToReplace(result.strokesProcessed);
      setPendingBbox(result.boundingBox);
      setPendingError(null);
    } catch (e: any) {
      // Không đoán bừa: mở hộp thoại với ô trống và nói rõ vì sao, người dùng
      // vẫn tự gõ hoặc đọc bằng giọng nói được.
      setPendingRecognizedText('');
      setPendingSuggestions(VietnameseInkRecognizer.getUserDictionary());
      setPendingStrokesToReplace(strokeIds);
      setPendingBbox(fallbackBbox);
      setPendingError(
        e instanceof InkRecognitionError && e.kind === 'offline'
          ? 'Không có mạng nên chưa nhận diện được nét chữ. Bạn có thể tự nhập hoặc đọc bằng giọng nói.'
          : e instanceof InkRecognitionError && e.kind === 'empty'
            ? 'Không đọc được chữ nào từ vùng đã khoanh. Thử khoanh gọn hơn quanh một từ.'
            : 'Dịch vụ nhận diện không phản hồi. Bạn có thể tự nhập chữ bên dưới.'
      );
    } finally {
      setIsRecognizingSelection(false);
    }

    setInkModalOpen(true);
    clearSelection();
  };

  // Confirm Ink To Text Conversion from Modal
  const handleConfirmInkModal = (finalText: string, selectedFont: string) => {
    const newTextElement: TextElement = {
      id: `t-ai-${Date.now()}`,
      x: pendingBbox.x,
      y: pendingBbox.y,
      width: Math.max(pendingBbox.width, 320),
      height: Math.max(pendingBbox.height, 80),
      text: finalText,
      fontFamily: selectedFont,
      fontSize: 32,
      color: color,
      originalStrokeIds: pendingStrokesToReplace
    };

    const remainingStrokes = page.strokes.filter(s => !pendingStrokesToReplace.includes(s.id));

    onPageUpdate({
      ...page,
      strokes: remainingStrokes,
      textElements: [...page.textElements, newTextElement]
    });

    setInkModalOpen(false);
    setSelectedTextId(newTextElement.id);
  };

  // ---------------------------------------------------------------------------
  // Sao chép / dán / nhân bản đối tượng
  // ---------------------------------------------------------------------------
  const buildClipboardPayload = (): ClipboardPayload | null => {
    if (selectionCount === 0) return null;
    return PageOps.toClipboard(
      selectedStrokes,
      page.textElements.filter(t => selectedTextIds.includes(t.id)),
      page.imageElements.filter(i => selectedImageIds.includes(i.id))
    );
  };

  const handleCopy = () => {
    const payload = buildClipboardPayload();
    if (payload) onCopySelection(payload);
  };

  const handleCut = () => {
    const payload = buildClipboardPayload();
    if (!payload) return;
    onCopySelection(payload);
    handleDeleteSelectedStrokes();
  };

  /** Dán vào trang hiện tại rồi chọn luôn phần vừa dán để kéo đi ngay */
  const pasteClipboard = (payload: ClipboardPayload | null) => {
    if (PageOps.isClipboardEmpty(payload)) return;

    const { page: nextPage, newStrokeIds, newTextIds, newImageIds } = PageOps.pasteInto(
      page,
      payload!
    );
    onPageUpdate(nextPage);

    const pastedStrokes = nextPage.strokes.filter(s => newStrokeIds.includes(s.id));
    setSelectedStrokes(pastedStrokes);
    setSelectedTextIds(newTextIds);
    setSelectedImageIds(newImageIds);

    const bounds = {
      strokes: pastedStrokes,
      textIds: newTextIds,
      imageIds: newImageIds
    };
    const bbox = getSelectionBoundsIn(nextPage, bounds.strokes, bounds.textIds, bounds.imageIds);

    // Khung chọn hình chữ nhật quanh phần vừa dán để kéo/thu phóng được ngay
    setLassoPolygon([
      { x: bbox.x - 8, y: bbox.y - 8 },
      { x: bbox.x + bbox.width + 8, y: bbox.y - 8 },
      { x: bbox.x + bbox.width + 8, y: bbox.y + bbox.height + 8 },
      { x: bbox.x - 8, y: bbox.y + bbox.height + 8 }
    ]);
    setLassoMenuPos(toClientPoint(bbox.x + bbox.width / 2, bbox.y - 8));
  };

  const handlePaste = () => pasteClipboard(readClipboard());

  /** Nhân bản tại chỗ: chép rồi dán ngay, không đụng vào khay nhớ tạm */
  const handleDuplicateSelection = () => {
    const payload = buildClipboardPayload();
    if (payload) pasteClipboard(payload);
  };

  // Phím tắt sao chép/dán. Bỏ qua khi con trỏ đang ở trong ô nhập liệu để
  // không cướp Ctrl+C/V của việc gõ chữ.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const key = e.key.toLowerCase();
      if (key === 'c' && selectionCount > 0) {
        e.preventDefault();
        handleCopy();
      } else if (key === 'x' && selectionCount > 0) {
        e.preventDefault();
        handleCut();
      } else if (key === 'v') {
        e.preventDefault();
        handlePaste();
      } else if (key === 'd' && selectionCount > 0) {
        e.preventDefault();
        handleDuplicateSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleDeleteSelectedStrokes = () => {
    const strokeIds = selectedStrokes.map(s => s.id);

    onPageUpdate({
      ...page,
      strokes: page.strokes.filter(s => !strokeIds.includes(s.id)),
      textElements: page.textElements.filter(t => !selectedTextIds.includes(t.id)),
      imageElements: page.imageElements.filter(i => !selectedImageIds.includes(i.id))
    });

    clearSelection();
  };

  const getTemplateClass = () => {
    switch (page.template) {
      case 'ruled': return 'paper-ruled';
      case 'grid': return 'paper-grid';
      case 'dot': return 'paper-dot';
      case 'cornell': return 'paper-cornell';
      case 'dark-neon': return 'paper-dark-neon';
      default: return 'paper-blank';
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative w-full h-full overflow-hidden select-none ${audioSeekMode ? 'cursor-help' : ''}`}
    >
      {/* Báo đã nắn hình — không có phản hồi thì người dùng tưởng tính năng hỏng */}
      {shapeHint && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600 text-white text-xs font-bold shadow-xl animate-pop pointer-events-none">
          <Shapes className="w-4 h-4" />
          <span>Đã nắn thành {shapeHint}</span>
        </div>
      )}

      {/* Nhắc chế độ chạm nét vẽ để nghe lại — nằm ngoài vùng cuộn nên không trôi */}
      {audioSeekMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/95 text-amber-950 text-xs font-bold shadow-xl animate-pop pointer-events-none">
          <MousePointerClick className="w-4 h-4" />
          <span>Chạm vào một nét vẽ để nghe lại đoạn ghi âm lúc viết nét đó</span>
        </div>
      )}

      {/* VÙNG CUỘN — thanh cuộn xuất hiện khi trang lớn hơn khung nhìn.
          touch-action: none để WebView Android không tự cuộn khi bút chạm
          (bút cảm ứng cũng phát touch event). Việc cuộn do ứng dụng tự xử lý:
          1 ngón/chuột kéo khi Palm Rejection bật, 2 ngón luôn pan + zoom. */}
      <div
        ref={scrollerRef}
        onScroll={(e) => {
          scrollPositionRef.current = {
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop
          };
        }}
        className="w-full h-full overflow-auto bg-slate-200"
        style={{ touchAction: 'none' }}
      >
        {/* Lớp đệm giữ đúng kích thước cuộn theo trang ĐÃ scale */}
        <div
          className="relative"
          style={{
            width: `${pageWidth * zoomLevel}px`,
            height: `${pageHeight * zoomLevel}px`,
            margin: `${SHEET_MARGIN}px auto`
          }}
        >
          {/* TỜ GIẤY — kích thước logic cố định, chỉ scale bằng CSS transform.
              Không dùng overflow-hidden: thanh công cụ của khung chữ nằm ở
              -top-12 nên sẽ bị cắt nếu khung chữ ở sát mép trên trang. */}
          <div
            className={`absolute top-0 left-0 rounded-sm shadow-[0_12px_44px_rgba(0,0,0,0.55)] ${getTemplateClass()}`}
            style={{
              width: `${pageWidth}px`,
              height: `${pageHeight}px`,
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'top left',
              // Đảo màu cả tờ giấy; ảnh chèn được đảo ngược lại bên dưới nên
              // vẫn hiện đúng màu thật thay vì thành ảnh âm bản
              filter: nightMode ? 'invert(1) hue-rotate(180deg)' : undefined
            }}
          >
        {/* PDF Background */}
        {page.pdfDataUrl && (
          <img
            src={page.pdfDataUrl}
            alt="PDF Page"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-90 z-0"
            style={{ filter: nightMode ? 'invert(1) hue-rotate(180deg)' : undefined }}
          />
        )}

        {/* Image Layer — nằm DƯỚI lớp mực để có thể viết chú thích đè lên ảnh.
            Ảnh không nhận pointer event nên nét bút vẽ xuyên qua bình thường. */}
        {page.imageElements.map((img) => (
          <div
            key={`img-visual-${img.id}`}
            className="absolute z-[5] pointer-events-none"
            style={{
              left: `${img.x}px`,
              top: `${img.y}px`,
              width: `${img.width}px`,
              height: `${img.height}px`,
              transform: img.rotation ? `rotate(${img.rotation}deg)` : undefined
            }}
          >
            <img
              src={img.src}
              alt="Ảnh ghi chú"
              draggable={false}
              className="w-full h-full object-contain rounded-lg shadow-md select-none"
              style={{ filter: nightMode ? 'invert(1) hue-rotate(180deg)' : undefined }}
            />
          </div>
        ))}

        {/* LỚP TĨNH — nét mực đã lưu. Không nhận pointer event. */}
        <canvas
          ref={staticCanvasRef}
          className="absolute inset-0 w-full h-full z-10 pointer-events-none"
        />

        {/* LỚP ĐỘNG — nét đang vẽ + lasso, và là lớp nhận mọi thao tác bút */}
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          className={`absolute inset-0 w-full h-full z-[11] touch-none ${
            palmRejectionActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
          }`}
        />

        {/* Image Control Layer — chỉ các tay cầm nhận chạm, phần còn lại xuyên suốt */}
        {page.imageElements.map((img) => {
          const isSelected = selectedImageId === img.id;

          const updateImage = (patch: Partial<ImageElement>, coalesceKey?: string) => {
            const updated = page.imageElements.map(i => (i.id === img.id ? { ...i, ...patch } : i));
            onPageUpdate({ ...page, imageElements: updated }, coalesceKey);
          };

          return (
            <div
              key={`img-ctrl-${img.id}`}
              className="absolute z-30 pointer-events-none"
              style={{
                left: `${img.x}px`,
                top: `${img.y}px`,
                width: `${img.width}px`,
                height: `${img.height}px`
              }}
            >
              {/* Viền chọn: nét liền khi chọn trực tiếp, nét đứt khi lasso quét trúng */}
              {isSelected ? (
                <div className="absolute inset-0 ring-2 ring-indigo-500 rounded-lg pointer-events-none" />
              ) : selectedImageIds.includes(img.id) ? (
                <div className="absolute inset-0 ring-2 ring-indigo-500 ring-dashed bg-indigo-500/10 rounded-lg pointer-events-none" />
              ) : null}

              {/* Tay cầm kéo di chuyển (luôn hiện để tìm được ảnh dưới lớp mực) */}
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const local = toCanvasPoint(e.clientX, e.clientY);
                  beginGesture('image-move');
                  setSelectedImageId(img.id);
                  setSelectedTextId(null);
                  setIsDraggingImage(true);
                  setImageDragOffset({ x: local.x - img.x, y: local.y - img.y });
                }}
                className={`absolute -top-3 -left-3 w-7 h-7 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing pointer-events-auto shadow-lg border-2 border-white transition ${
                  isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800/80 text-indigo-300 hover:bg-indigo-600 hover:text-white'
                }`}
                title="Giữ và kéo để di chuyển ảnh"
              >
                <Grip className="w-3.5 h-3.5" />
              </div>

              {isSelected && (
                <>
                  {/* Thanh công cụ ảnh */}
                  <div className="chrome-bar chrome-bar-float absolute -top-12 left-6 px-1.5 py-1 rounded-xl flex items-center gap-0.5 pointer-events-auto border animate-pop">
                    <button
                      onClick={() => onOcrImage(img.id)}
                      disabled={ocrBusyImageId === img.id}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-white text-emerald-700 border border-slate-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition disabled:opacity-60"
                      title="Đọc chữ trong ảnh này thành khung chữ sửa được"
                    >
                      {ocrBusyImageId === img.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ScanText className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Đọc chữ</span>
                    </button>

                    <div className="h-4 w-px bg-slate-200 mx-0.5" />

                    <button
                      onClick={() => updateImage({ rotation: ((img.rotation || 0) - 90 + 360) % 360 }, `rotate-${img.id}`)}
                      className="chrome-btn w-7 h-7"
                      title="Xoay trái 90°"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-bold text-slate-600 px-1 tabular-nums">
                      {Math.round(img.rotation || 0)}°
                    </span>
                    <button
                      onClick={() => updateImage({ rotation: ((img.rotation || 0) + 90) % 360 }, `rotate-${img.id}`)}
                      className="chrome-btn w-7 h-7"
                      title="Xoay phải 90°"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    <div className="h-4 w-px bg-slate-200 mx-0.5" />

                    <button
                      onClick={() => {
                        const updated = page.imageElements.filter(i => i.id !== img.id);
                        onPageUpdate({ ...page, imageElements: updated });
                        setSelectedImageId(null);
                      }}
                      className="chrome-btn w-7 h-7 hover:bg-rose-50 hover:text-rose-600"
                      title="Xoá ảnh này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Tay cầm resize (giữ tỉ lệ) */}
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const local = toCanvasPoint(e.clientX, e.clientY);
                      beginGesture('image-resize');
                      setIsResizingImage(true);
                      setImageResizeStart({ x: local.x, y: local.y, w: img.width, h: img.height });
                    }}
                    className="absolute -bottom-2.5 -right-2.5 w-6 h-6 rounded-full bg-indigo-600 text-white border-2 border-white flex items-center justify-center cursor-nwse-resize shadow-lg pointer-events-auto hover:scale-125 transition"
                    title="Kéo để thay đổi kích thước ảnh"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Thước kẻ — nằm trên lớp mực để nhận được thao tác kéo/xoay của chính nó */}
        {ruler && (
          <RulerOverlay
            ruler={ruler}
            onChange={setRuler}
            onClose={onDisableRuler}
            toCanvasPoint={toCanvasPoint}
          />
        )}

        {/* Render Text Elements */}
        {page.textElements.map((txt) => {
          const isSelected = selectedTextId === txt.id;

          return (
            <div
              key={txt.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTextId(txt.id);
                setSelectedImageId(null);
              }}
              className={`absolute z-20 transition-all rounded-2xl ${
                inkInputTargetId === txt.id
                  ? 'ring-2 ring-amber-400 shadow-2xl bg-white/95 backdrop-blur-md p-3 border border-amber-300'
                  : isSelected
                    ? 'ring-2 ring-indigo-500 shadow-2xl bg-white/95 backdrop-blur-md p-3 border border-indigo-300'
                    : selectedTextIds.includes(txt.id)
                      ? 'ring-2 ring-indigo-500 ring-dashed bg-indigo-500/10 p-2'
                      : 'hover:ring-1 hover:ring-slate-400/50 p-2'
              }`}
              style={{
                left: `${txt.x}px`,
                top: `${txt.y}px`,
                width: `${txt.width}px`,
                height: `${txt.height}px`
              }}
            >
              {/* Thanh công cụ nổi của khung chữ đang chọn */}
              {isSelected && (
                <TextElementToolbar
                  element={txt}
                  isInkTarget={inkInputTargetId === txt.id}
                  onPatch={(patch, coalesceKey) => {
                    const updated = page.textElements.map(t =>
                      t.id === txt.id ? { ...t, ...patch } : t
                    );
                    onPageUpdate({ ...page, textElements: updated }, coalesceKey);
                  }}
                  onStartDrag={(e) => {
                    e.stopPropagation();
                    const local = toCanvasPoint(e.clientX, e.clientY);
                    beginGesture('text-move');
                    setSelectedTextId(txt.id);
                    setIsDraggingText(true);
                    setDragOffset({ x: local.x - txt.x, y: local.y - txt.y });
                  }}
                  onRequestInkInput={() => onRequestInkInput(txt.id)}
                  onToggleCheckbox={() => toggleCheckboxOnCaretLine(txt)}
                  onDelete={() => {
                    onPageUpdate({
                      ...page,
                      textElements: page.textElements.filter(t => t.id !== txt.id)
                    });
                    setSelectedTextId(null);
                  }}
                />
              )}

              {/* Editable Text Area */}
              <textarea
                ref={el => {
                  if (el) textareaRefs.current.set(txt.id, el);
                  else textareaRefs.current.delete(txt.id);
                }}
                value={txt.text}
                onChange={(e) => {
                  const updated = page.textElements.map(t => t.id === txt.id ? { ...t, text: e.target.value } : t);
                  // Gõ liên tục trong cùng khung chữ chỉ tạo 1 bước hoàn tác
                  onPageUpdate({ ...page, textElements: updated }, `text-edit-${txt.id}`);
                }}
                className="bg-transparent border-none outline-none resize-none w-full h-full leading-snug font-medium text-[#1F2937]"
                style={{
                  fontFamily: txt.fontFamily,
                  color: txt.color || '#1F2937',
                  fontSize: `${txt.fontSize}px`,
                  textAlign: txt.textAlign ?? 'left'
                }}
              />

              {/* Bottom-Right Corner Resize Handle */}
              {isSelected && (
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const local = toCanvasPoint(e.clientX, e.clientY);
                    beginGesture('text-resize');
                    setIsResizingText(true);
                    setResizeStart({ x: local.x, y: local.y, w: txt.width, h: txt.height, font: txt.fontSize });
                  }}
                  className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-indigo-600 text-white border-2 border-white flex items-center justify-center cursor-nwse-resize shadow-lg z-30 transform hover:scale-125 transition"
                  title="Kéo góc này để phóng to / thu nhỏ khung chữ"
                >
                  <Maximize2 className="w-3 h-3" />
                </div>
              )}
            </div>
          );
        })}
          </div>
        </div>
      </div>

      {/* Lasso Context Action Menu */}
      {lassoMenuPos && (
        <LassoContextMenu
          x={lassoMenuPos.x}
          y={lassoMenuPos.y}
          onConvertToText={handleConvertToTextModal}
          isRecognizing={isRecognizingSelection}
          canRecognize={selectedStrokes.length > 0}
          onCreateFlashcard={() => {
            const bbox = getSelectionBounds(selectedStrokes, selectedTextIds, selectedImageIds);
            // Chữ trong khung chữ được chọn dùng làm gợi ý cho mặt sau
            const suggested = page.textElements
              .filter(t => selectedTextIds.includes(t.id))
              .map(t => t.text)
              .join('\n');
            onCreateFlashcard(bbox, suggested);
            clearSelection();
          }}
          isCreatingFlashcard={isCreatingFlashcard}
          onCopy={handleCopy}
          onDuplicate={handleDuplicateSelection}
          onDeleteStrokes={handleDeleteSelectedStrokes}
          onScaleSelected={handleScaleSelectedStrokes}
          onClose={clearSelection}
        />
      )}

      {/* Interactive AI Ink To Text Modal (Light UI Theme) */}
      <InkToTextModal
        isOpen={inkModalOpen}
        initialText={pendingRecognizedText}
        suggestions={pendingSuggestions}
        errorMessage={pendingError}
        fontFamily={fontFamily}
        onConfirm={handleConfirmInkModal}
        onClose={() => setInkModalOpen(false)}
      />
    </div>
  );
};
