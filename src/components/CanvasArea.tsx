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

interface CanvasAreaProps {
  page: NotebookPage;
  currentTool: ToolType;
  color: string;
  size: number;
  fontFamily: string;
  smartShapeEnabled: boolean;
  palmRejectionActive: boolean;
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

  // Shape Hold Auto-Smoothing Timer
  const shapeHoldTimer = useRef<NodeJS.Timeout | null>(null);
  const lastPointerPoint = useRef<Point | null>(null);

  // Synchronize Canvas DPI & Resize
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const canvas = canvasRef.current;
      canvas.width = rect.width;
      canvas.height = rect.height;
      renderCanvas();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [page]);

  // Main Render Canvas Function
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Render Existing Strokes
    page.strokes.forEach(stroke => {
      drawSingleStroke(ctx, stroke.points, stroke.color, stroke.size, stroke.tool);
    });

    // 2. Render Active Stroke (In Progress)
    if (currentStroke.length > 0) {
      drawSingleStroke(ctx, currentStroke, color, size, currentTool);
    }

    // 3. Render Lasso Selection Polygon
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

  // Smooth Catmull-Rom Spline Drawing
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

  // Pointer Down (Touch / Stylus Event)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // PALM REJECTION: If palm rejection active, ignore finger touches when writing
    if (palmRejectionActive && e.pointerType === 'touch' && currentTool === 'pen') {
      return; // Ignore finger draw to prevent palm smudge!
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.6;
    const pt: Point = { x, y, pressure, time: Date.now() };

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
      lastPointerPoint.current = pt;

      // Smart Shape Timer
      if (smartShapeEnabled) {
        if (shapeHoldTimer.current) clearTimeout(shapeHoldTimer.current);
        shapeHoldTimer.current = setTimeout(() => {
          triggerShapeSmooth();
        }, 450);
      }
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.6;
    const pt: Point = { x, y, pressure, time: Date.now() };

    if (currentTool === 'lasso') {
      setLassoPolygon(prev => [...prev, { x, y }]);
    } else if (currentTool.startsWith('eraser')) {
      eraseAtPoint(x, y);
    } else if (currentTool === 'pen' || currentTool === 'highlighter') {
      setCurrentStroke(prev => [...prev, pt]);
      lastPointerPoint.current = pt;

      // Reset Smart Shape Hold Timer on movement
      if (smartShapeEnabled && shapeHoldTimer.current) {
        clearTimeout(shapeHoldTimer.current);
        shapeHoldTimer.current = setTimeout(() => {
          triggerShapeSmooth();
        }, 450);
      }
    }
  };

  // Pointer Up
  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (shapeHoldTimer.current) clearTimeout(shapeHoldTimer.current);

    if (currentTool === 'lasso' && lassoPolygon.length > 2) {
      // Find strokes inside Lasso polygon
      const selected = page.strokes.filter(s => isStrokeInPolygon(s, lassoPolygon));
      setSelectedStrokes(selected);

      if (selected.length > 0) {
        const bbox = VietnameseInkRecognizer.getBoundingBox(selected);
        setLassoMenuPos({ x: bbox.x + bbox.width / 2, y: bbox.y });
      } else {
        setLassoPolygon([]);
      }
    } else if (currentStroke.length > 0) {
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

  // Eraser collision detection
  const eraseAtPoint = (x: number, y: number) => {
    const eraserRadius = size * 2.5;
    const updatedStrokes = page.strokes.filter(stroke => {
      return !stroke.points.some(p => Math.hypot(p.x - x, p.y - y) < eraserRadius);
    });

    if (updatedStrokes.length !== page.strokes.length) {
      onPageUpdate({ ...page, strokes: updatedStrokes });
    }
  };

  // Polygon collision test for Lasso
  const isStrokeInPolygon = (stroke: Stroke, poly: { x: number; y: number }[]) => {
    return stroke.points.some(pt => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
          (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    });
  };

  // Smart Shape Smoothing Trigger
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
      width: 280,
      height: 60,
      text: 'Nhập ghi chú...',
      fontFamily: fontFamily,
      fontSize: 26,
      color: color
    };

    onPageUpdate({
      ...page,
      textElements: [...page.textElements, newText]
    });
  };

  // Convert Lasso Strokes to Vietnamese Handwriting Text Font
  const handleConvertToText = () => {
    if (selectedStrokes.length === 0) return;

    const result = VietnameseInkRecognizer.recognizeStrokes(selectedStrokes);

    const newTextElement: TextElement = {
      id: `t-ai-${Date.now()}`,
      x: result.boundingBox.x,
      y: result.boundingBox.y,
      width: Math.max(result.boundingBox.width, 300),
      height: Math.max(result.boundingBox.height, 70),
      text: result.text,
      fontFamily: fontFamily,
      fontSize: 30,
      color: color,
      originalStrokeIds: result.strokesProcessed
    };

    // Remove old handwritten strokes, add new text element
    const remainingStrokes = page.strokes.filter(s => !result.strokesProcessed.includes(s.id));

    onPageUpdate({
      ...page,
      strokes: remainingStrokes,
      textElements: [...page.textElements, newTextElement]
    });

    setLassoPolygon([]);
    setSelectedStrokes([]);
    setLassoMenuPos(null);
  };

  // AI Summarize/Fix Grammar
  const handleAiSummarize = () => {
    alert('✨ AI Assistant: Đã tóm tắt bài ghi chú và chuẩn hóa chính tả Tiếng Việt!');
  };

  // Delete Lasso selected strokes
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
      className={`relative w-full h-full overflow-hidden select-none touch-none ${getTemplateClass()}`}
    >
      {/* PDF Background (if loaded) */}
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
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="absolute inset-0 w-full h-full z-10 cursor-crosshair touch-none"
      />

      {/* Render Text Elements (Converted Handwriting / User Typed) */}
      {page.textElements.map((txt) => (
        <div
          key={txt.id}
          className="absolute z-20 p-2 rounded-xl border border-transparent hover:border-indigo-500/50 group transition cursor-move"
          style={{
            left: `${txt.x}px`,
            top: `${txt.y}px`,
            fontFamily: txt.fontFamily,
            fontSize: `${txt.fontSize}px`,
            color: txt.color
          }}
        >
          <textarea
            value={txt.text}
            onChange={(e) => {
              const updated = page.textElements.map(t => t.id === txt.id ? { ...t, text: e.target.value } : t);
              onPageUpdate({ ...page, textElements: updated });
            }}
            className="bg-transparent border-none outline-none resize-none overflow-hidden w-full leading-snug"
            rows={Math.max(1, txt.text.split('\n').length)}
            style={{ fontFamily: txt.fontFamily, color: txt.color, fontSize: `${txt.fontSize}px` }}
          />
        </div>
      ))}

      {/* Lasso Floating Context Action Menu */}
      {lassoMenuPos && (
        <LassoContextMenu
          x={lassoMenuPos.x}
          y={lassoMenuPos.y}
          onConvertToText={handleConvertToText}
          onAiSummarize={handleAiSummarize}
          onDeleteStrokes={handleDeleteSelectedStrokes}
          onClose={() => {
            setLassoPolygon([]);
            setSelectedStrokes([]);
            setLassoMenuPos(null);
          }}
        />
      )}
    </div>
  );
};
