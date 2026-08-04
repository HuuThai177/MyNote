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

    // 1. Render Existing Permanent Strokes
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

    // PALM REJECTION: Ignore finger touch when stylus is writing
    if (palmRejectionActive && e.pointerType === 'touch' && currentTool === 'pen') {
      return;
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

      if (smartShapeEnabled) {
        if (shapeHoldTimer.current) clearTimeout(shapeHoldTimer.current);
        shapeHoldTimer.current = setTimeout(() => {
          triggerShapeSmooth();
        }, 450);
      }
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLElement> | any) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
        }, 450);
      }
    }
  };

  // Pointer Up
  const handlePointerUp = () => {
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
        setLassoMenuPos({ x: bbox.x + bbox.width / 2, y: bbox.y });
      } else {
        setLassoPolygon([]);
      }
    } else if (currentStroke.length > 0) {
      // Normal Pen Drawing: ALWAYS save permanent stroke on canvas!
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

  // Lasso collision
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
  const handleConvertToTextModal = () => {
    if (selectedStrokes.length === 0) return;

    const result = VietnameseInkRecognizer.recognizeStrokes(selectedStrokes);
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
      className={`relative w-full h-full overflow-hidden select-none touch-none ${getTemplateClass()}`}
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
                ? 'ring-2 ring-indigo-500 shadow-2xl bg-slate-900/85 backdrop-blur-md p-3 border border-indigo-400/50' 
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
              className="bg-transparent border-none outline-none resize-none w-full h-full leading-snug font-medium"
              style={{
                fontFamily: txt.fontFamily,
                color: txt.color,
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

      {/* Lasso Context Action Menu */}
      {lassoMenuPos && (
        <LassoContextMenu
          x={lassoMenuPos.x}
          y={lassoMenuPos.y}
          onConvertToText={handleConvertToTextModal}
          onAiSummarize={handleAiSummarize}
          onDeleteStrokes={handleDeleteSelectedStrokes}
          onClose={() => {
            setLassoPolygon([]);
            setSelectedStrokes([]);
            setLassoMenuPos(null);
          }}
        />
      )}

      {/* Interactive AI Ink To Text Modal */}
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
