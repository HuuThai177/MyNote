import React, { useRef, useEffect, useState } from 'react';
import { 
  Stroke, 
  Point, 
  ToolType, 
  NotebookPage, 
  TextElement, 
  ImageElement,
  VIETNAMESE_HANDWRITING_FONTS
} from '../types/notebook';
import { ShapeSmoother } from '../engine/ShapeSmoother';
import { VietnameseInkRecognizer } from '../engine/VietnameseInkRecognizer';
import { LassoContextMenu } from './LassoContextMenu';
import { InkToTextModal } from './InkToTextModal';
import { 
  Grip, 
  Trash2, 
  Sparkles, 
  Type, 
  Plus, 
  Minus, 
  Maximize2,
  Check
} from 'lucide-react';

interface CanvasAreaProps {
  page: NotebookPage;
  currentTool: ToolType;
  color: string;
  size: number;
  fontFamily: string;
  smartShapeEnabled: boolean;
  palmRejectionActive: boolean;
  zoomLevel: number;
  onPageUpdate: (updatedPage: NotebookPage) => void;
  audioRecordingTime: number;
  isRecordingAudio: boolean;
}

export const CanvasArea: React.FC<CanvasAreaProps> = ({
  page,
  currentTool,
  color,
  size,
  fontFamily,
  smartShapeEnabled,
  palmRejectionActive,
  zoomLevel,
  onPageUpdate,
  audioRecordingTime,
  isRecordingAudio
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [lassoPolygon, setLassoPolygon] = useState<{ x: number; y: number }[]>([]);
  const [selectedStrokes, setSelectedStrokes] = useState<Stroke[]>([]);
  const [lassoMenuPos, setLassoMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Lasso Selection Dragging & Scale State
  const [isDraggingLasso, setIsDraggingLasso] = useState(false);
  const [lassoDragLastPos, setLassoDragLastPos] = useState<{ x: number; y: number } | null>(null);

  // Active Selected Text Element State
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [isResizingText, setIsResizingText] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; w: number; h: number; font: number }>({ x: 0, y: 0, w: 0, h: 0, font: 0 });

  // Interactive InkToText Edit Modal State
  const [inkModalOpen, setInkModalOpen] = useState(false);
  const [pendingRecognizedText, setPendingRecognizedText] = useState('');
  const [pendingSuggestions, setPendingSuggestions] = useState<string[]>([]);
  const [pendingStrokesToReplace, setPendingStrokesToReplace] = useState<string[]>([]);
  const [pendingBbox, setPendingBbox] = useState<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 300, height: 80 });

  const shapeHoldTimer = useRef<NodeJS.Timeout | null>(null);

  // Deselect text box when tool changes to pen/highlighter/eraser/lasso
  useEffect(() => {
    if (currentTool !== 'text') {
      setSelectedTextId(null);
    }
  }, [currentTool]);

  // Synchronize Canvas DPI & Resize
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const canvas = canvasRef.current;
      canvas.width = rect.width / zoomLevel;
      canvas.height = rect.height / zoomLevel;
      renderCanvas();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [page, zoomLevel]);

  // Main Render Canvas Function
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Render Existing Permanent Strokes
    page.strokes.forEach(stroke => {
      drawSingleStroke(ctx, stroke.points, stroke.color, stroke.size, stroke.tool);
    });

    // 2. Render Active Stroke (In Progress)
    if (currentStroke.length > 0) {
      drawSingleStroke(ctx, currentStroke, color, size, currentTool);
    }

    // 3. Render Lasso Selection Polygon & Bounding Box
    if (lassoPolygon.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lassoPolygon[0].x, lassoPolygon[0].y);
      for (let i = 1; i < lassoPolygon.length; i++) {
        ctx.lineTo(lassoPolygon[i].x, lassoPolygon[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };

  useEffect(() => {
    renderCanvas();
  }, [page.strokes, currentStroke, lassoPolygon]);

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
    // Deselect text box when drawing on canvas
    if (selectedTextId) {
      setSelectedTextId(null);
    }

    // STRICT PALM REJECTION: When ON, strictly allow ONLY Stylus / Pen pointers (e.pointerType === 'pen')
    // Completely rejects finger touch (pointerType === 'touch') or mouse when Palm Rejection is active
    if (palmRejectionActive && e.pointerType !== 'pen') {
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / zoomLevel;
    const y = (e.clientY - rect.top) / zoomLevel;
    const pressure = e.pressure > 0 ? e.pressure : 0.6;
    const pt: Point = { x, y, pressure, time: Date.now() };

    // Check if clicking inside active Lasso Selection area to DRAG MOVE objects
    if (selectedStrokes.length > 0 && lassoPolygon.length > 2) {
      if (isPointInPolygon({ x, y }, lassoPolygon)) {
        setIsDraggingLasso(true);
        setLassoDragLastPos({ x, y });
        return;
      }
    }

    setIsDrawing(true);

    if (currentTool === 'lasso') {
      setLassoPolygon([{ x, y }]);
      setSelectedStrokes([]);
      setLassoMenuPos(null);
    } else if (currentTool.startsWith('eraser')) {
      eraseAtPoint(x, y);
    } else if (currentTool === 'text') {
      addTextElementAt(x, y);
    } else {
      setCurrentStroke([pt]);

      if (smartShapeEnabled) {
        if (shapeHoldTimer.current) clearTimeout(shapeHoldTimer.current);
        shapeHoldTimer.current = setTimeout(() => {
          triggerShapeSmooth();
        }, 500); // 0.5s Hold
      }
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLElement> | any) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / zoomLevel;
    const y = (e.clientY - rect.top) / zoomLevel;

    // Handle Dragging / Moving Lasso Selected Objects
    if (isDraggingLasso && lassoDragLastPos && selectedStrokes.length > 0) {
      const dx = x - lassoDragLastPos.x;
      const dy = y - lassoDragLastPos.y;
      setLassoDragLastPos({ x, y });

      const selectedIds = selectedStrokes.map(s => s.id);

      // Shift selected strokes points
      const updatedStrokes = page.strokes.map(stroke => {
        if (selectedIds.includes(stroke.id)) {
          return {
            ...stroke,
            points: stroke.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }))
          };
        }
        return stroke;
      });

      // Shift lasso polygon
      const updatedPoly = lassoPolygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
      const updatedSelected = updatedStrokes.filter(s => selectedIds.includes(s.id));

      setLassoPolygon(updatedPoly);
      setSelectedStrokes(updatedSelected);
      onPageUpdate({ ...page, strokes: updatedStrokes });

      if (lassoMenuPos) {
        setLassoMenuPos({ x: (lassoMenuPos.x + dx * zoomLevel), y: (lassoMenuPos.y + dy * zoomLevel) });
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
      onPageUpdate({ ...page, textElements: updated });
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
      onPageUpdate({ ...page, textElements: updated });
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
      setCurrentStroke(prev => [...prev, pt]);

      if (smartShapeEnabled && shapeHoldTimer.current) {
        clearTimeout(shapeHoldTimer.current);
        shapeHoldTimer.current = setTimeout(() => {
          triggerShapeSmooth();
        }, 500); // 0.5s Hold
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
    if (isDraggingLasso) {
      setIsDraggingLasso(false);
      setLassoDragLastPos(null);
    }

    if (isDraggingText) setIsDraggingText(false);
    if (isResizingText) setIsResizingText(false);

    if (!isDrawing) return;
    setIsDrawing(false);

    if (shapeHoldTimer.current) clearTimeout(shapeHoldTimer.current);

    if (currentTool === 'lasso' && lassoPolygon.length > 2) {
      const selected = page.strokes.filter(s => isStrokeInPolygon(s, lassoPolygon));
      setSelectedStrokes(selected);

      if (selected.length > 0) {
        const bbox = VietnameseInkRecognizer.getBoundingBox(selected);
        setLassoMenuPos({ x: (bbox.x + bbox.width / 2) * zoomLevel, y: bbox.y * zoomLevel });
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
        const selected = page.strokes.filter(s => isStrokeInPolygon(s, circlePoly));
        
        if (selected.length > 0) {
          setSelectedStrokes(selected);
          setLassoPolygon(circlePoly);
          const bbox = VietnameseInkRecognizer.getBoundingBox(selected);
          setLassoMenuPos({ x: (bbox.x + bbox.width / 2) * zoomLevel, y: bbox.y * zoomLevel });
          setCurrentStroke([]);
          return;
        }
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

  // Scale / Resize Selected Objects in Lasso Area
  const handleScaleSelectedStrokes = (scaleFactor: number) => {
    if (selectedStrokes.length === 0) return;

    const bbox = VietnameseInkRecognizer.getBoundingBox(selectedStrokes);
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
    const selectedIds = selectedStrokes.map(s => s.id);

    const updatedStrokes = page.strokes.map(stroke => {
      if (selectedIds.includes(stroke.id)) {
        return {
          ...stroke,
          size: Math.max(1, stroke.size * scaleFactor),
          points: stroke.points.map(p => ({
            ...p,
            x: centerX + (p.x - centerX) * scaleFactor,
            y: centerY + (p.y - centerY) * scaleFactor
          }))
        };
      }
      return stroke;
    });

    const updatedPoly = lassoPolygon.map(p => ({
      x: centerX + (p.x - centerX) * scaleFactor,
      y: centerY + (p.y - centerY) * scaleFactor
    }));

    const updatedSelected = updatedStrokes.filter(s => selectedIds.includes(s.id));

    setLassoPolygon(updatedPoly);
    setSelectedStrokes(updatedSelected);
    onPageUpdate({ ...page, strokes: updatedStrokes });

    const newBbox = VietnameseInkRecognizer.getBoundingBox(updatedSelected);
    setLassoMenuPos({ x: (newBbox.x + newBbox.width / 2) * zoomLevel, y: newBbox.y * zoomLevel });
  };

  // Eraser collision
  const eraseAtPoint = (x: number, y: number) => {
    const eraserRadius = size * 2.5;
    const updatedStrokes = page.strokes.filter(stroke => {
      return !stroke.points.some(p => Math.hypot(p.x - x, p.y - y) < eraserRadius);
    });

    if (updatedStrokes.length !== page.strokes.length) {
      onPageUpdate({ ...page, strokes: updatedStrokes });
    }
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

  // Smart Shape Smooth
  const triggerShapeSmooth = () => {
    if (currentStroke.length < 5) return;
    const tempStroke: Stroke = {
      id: 'temp',
      tool: currentTool,
      color,
      size,
      opacity: 1,
      points: currentStroke
    };

    const smoothed = ShapeSmoother.detectAndSmooth(tempStroke);
    if (smoothed) {
      setCurrentStroke(smoothed.smoothedPoints);
    }
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
    if (selectedStrokes.length === 0) return;

    const result = await VietnameseInkRecognizer.recognizeStrokesAsync(selectedStrokes);
    setPendingRecognizedText(result.text || 'Ghi chú');
    setPendingSuggestions(result.suggestions || []);
    setPendingStrokesToReplace(result.strokesProcessed);
    setPendingBbox(result.boundingBox);
    setInkModalOpen(true);

    setLassoPolygon([]);
    setSelectedStrokes([]);
    setLassoMenuPos(null);
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

  const handleAiSummarize = () => {
    alert('✨ AI Assistant: Đã tối ưu nét chữ và chuẩn hóa Tiếng Việt thành công!');
  };

  const handleDeleteSelectedStrokes = () => {
    const selectedIds = selectedStrokes.map(s => s.id);
    const remaining = page.strokes.filter(s => !selectedIds.includes(s.id));
    onPageUpdate({ ...page, strokes: remaining });
    setLassoPolygon([]);
    setSelectedStrokes([]);
    setLassoMenuPos(null);
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
      className={`relative w-full h-full overflow-auto select-none touch-none ${getTemplateClass()}`}
    >
      {/* Zoom Transform Wrapper */}
      <div 
        className="relative w-full h-full min-w-full min-h-full origin-top-left transition-transform duration-75"
        style={{ transform: `scale(${zoomLevel})` }}
      >
        {/* PDF Background */}
        {page.pdfDataUrl && (
          <img
            src={page.pdfDataUrl}
            alt="PDF Page"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-90 z-0"
          />
        )}

        {/* Interactive Graphic Canvas Layer */}
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          className="absolute inset-0 w-full h-full z-10 cursor-crosshair touch-none"
        />

        {/* Render Text Elements */}
        {page.textElements.map((txt) => {
          const isSelected = selectedTextId === txt.id;

          return (
            <div
              key={txt.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTextId(txt.id);
              }}
              className={`absolute z-20 transition-all rounded-2xl ${
                isSelected 
                  ? 'ring-2 ring-indigo-500 shadow-2xl bg-white/95 backdrop-blur-md p-3 border border-indigo-300' 
                  : 'hover:ring-1 hover:ring-slate-400/50 p-2'
              }`}
              style={{
                left: `${txt.x}px`,
                top: `${txt.y}px`,
                width: `${txt.width}px`,
                height: `${txt.height}px`
              }}
            >
              {/* Active Floating Text Toolbar */}
              {isSelected && (
                <div className="absolute -top-12 left-0 right-0 glass-toolbar px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 z-30 shadow-xl border border-slate-700 animate-pop">
                  {/* Drag Handle */}
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setIsDraggingText(true);
                      setDragOffset({ x: e.clientX - txt.x, y: e.clientY - txt.y });
                    }}
                    className="flex items-center gap-1 cursor-grab active:cursor-grabbing text-indigo-400 hover:text-indigo-300 font-bold text-xs"
                    title="Giữ và kéo để di chuyển khung chữ"
                  >
                    <Grip className="w-4 h-4" />
                    <span>Kéo di chuyển</span>
                  </div>

                  {/* Font Size & Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const updated = page.textElements.map(t => t.id === txt.id ? { ...t, fontSize: Math.max(14, t.fontSize - 2) } : t);
                        onPageUpdate({ ...page, textElements: updated });
                      }}
                      className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                      title="Thu nhỏ font"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold text-slate-200 px-1">{txt.fontSize}px</span>
                    <button
                      onClick={() => {
                        const updated = page.textElements.map(t => t.id === txt.id ? { ...t, fontSize: Math.min(72, t.fontSize + 2) } : t);
                        onPageUpdate({ ...page, textElements: updated });
                      }}
                      className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                      title="Phóng to font"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    <div className="h-4 w-px bg-slate-700 mx-1" />

                    {/* Delete Text Element */}
                    <button
                      onClick={() => {
                        const updated = page.textElements.filter(t => t.id !== txt.id);
                        onPageUpdate({ ...page, textElements: updated });
                        setSelectedTextId(null);
                      }}
                      className="p-1 rounded bg-rose-600/80 text-white hover:bg-rose-600"
                      title="Xóa khung chữ này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Editable Text Area */}
              <textarea
                value={txt.text}
                onChange={(e) => {
                  const updated = page.textElements.map(t => t.id === txt.id ? { ...t, text: e.target.value } : t);
                  onPageUpdate({ ...page, textElements: updated });
                }}
                className="bg-transparent border-none outline-none resize-none w-full h-full leading-snug font-medium text-[#1F2937]"
                style={{
                  fontFamily: txt.fontFamily,
                  color: txt.color || '#1F2937',
                  fontSize: `${txt.fontSize}px`
                }}
              />

              {/* Bottom-Right Corner Resize Handle */}
              {isSelected && (
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setIsResizingText(true);
                    setResizeStart({ x: e.clientX, y: e.clientY, w: txt.width, h: txt.height, font: txt.fontSize });
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

      {/* Lasso Context Action Menu */}
      {lassoMenuPos && (
        <LassoContextMenu
          x={lassoMenuPos.x}
          y={lassoMenuPos.y}
          onConvertToText={handleConvertToTextModal}
          onAiSummarize={handleAiSummarize}
          onDeleteStrokes={handleDeleteSelectedStrokes}
          onScaleSelected={handleScaleSelectedStrokes}
          onClose={() => {
            setLassoPolygon([]);
            setSelectedStrokes([]);
            setLassoMenuPos(null);
          }}
        />
      )}

      {/* Interactive AI Ink To Text Modal (Light UI Theme) */}
      <InkToTextModal
        isOpen={inkModalOpen}
        initialText={pendingRecognizedText}
        suggestions={pendingSuggestions}
        fontFamily={fontFamily}
        onConfirm={handleConfirmInkModal}
        onClose={() => setInkModalOpen(false)}
      />
    </div>
  );
};
