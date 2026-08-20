import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Notebook,
  NotebookPage,
  InkIndex,
  ToolType,
  PaperTemplate,
  AudioNote,
  ImageElement,
  TextElement,
  PaperSizeId,
  PaperOrientation,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_PAPER_SIZE,
  DEFAULT_ORIENTATION
} from './types/notebook';
import { clampZoom, getPageSizeLabel } from './engine/PageGeometry';
import { StencilTool } from './engine/StencilGeometry';
import { PageOps, ClipboardPayload } from './engine/PageOps';
import { InkRecognitionService, ModelStatus, MODEL_SIZE_LABEL } from './engine/InkRecognitionService';
import { InkIndexer, IndexProgress } from './engine/InkIndexer';
import { DocumentCapture } from './engine/DocumentCapture';
import { SpeechTranscriber, TranscriptSegment } from './engine/SpeechTranscriber';
import { FlashcardEngine, Flashcard, ReviewGrade } from './engine/FlashcardEngine';
import { PageRenderer } from './engine/PageRenderer';
import { getPageDimensions } from './engine/PageGeometry';
import { StorageEngine, SaveResult } from './engine/StorageEngine';
import { AudioSyncEngine } from './engine/AudioSyncEngine';
import { HistoryEngine } from './engine/HistoryEngine';
import { ImageImporter } from './engine/ImageImporter';
import { HeaderBar } from './components/HeaderBar';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { CanvasArea } from './components/CanvasArea';
import { ExportModal } from './components/ExportModal';
import { SearchModal } from './components/SearchModal';
import { AudioPlayerBar, SeekRequest } from './components/AudioPlayerBar';
import { InkInputPad } from './components/InkInputPad';
import { FlashcardReview } from './components/FlashcardReview';
import { StatsModal } from './components/StatsModal';
import { NoteGraphModal } from './components/NoteGraphModal';
import { AlertTriangle, CheckCircle2, Loader2, X, ChevronLeft, ChevronRight, MousePointer2, Minimize2 } from 'lucide-react';

const audioEngine = new AudioSyncEngine();

interface Toast {
  type: 'error' | 'info';
  message: string;
}

export const App: React.FC = () => {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string>('');
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Tools & Styling state
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [color, setColor] = useState<string>('#6366f1');
  const [size, setSize] = useState<number>(4);
  const [fontFamily, setFontFamily] = useState<string>("'Caveat', cursive");
  const [smartShapeEnabled, setSmartShapeEnabled] = useState<boolean>(true);
  /** Khuôn vẽ đang dùng: thước kẻ, khuôn tròn, thước đo góc, lưới đẳng cự */
  const [stencilTool, setStencilTool] = useState<StencilTool>('none');
  /** Trình chiếu: ẩn hết thanh công cụ, bút thành con trỏ laser */
  const [presentMode, setPresentMode] = useState<boolean>(false);
  /** Đảo màu trang để đọc/viết ban đêm */
  const [nightMode, setNightMode] = useState<boolean>(false);
  const [statsOpen, setStatsOpen] = useState<boolean>(false);
  const [graphOpen, setGraphOpen] = useState<boolean>(false);
  const [palmRejectionActive, setPalmRejectionActive] = useState<boolean>(true);

  // Khung nhìn trang giấy
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [fitRequest, setFitRequest] = useState<{ mode: 'width' | 'page'; token: number } | null>(null);

  // Audio Recording Sync
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [audioBarOpen, setAudioBarOpen] = useState<boolean>(false);
  /** Bật phụ đề khi ghi âm (nhận dạng lời nói tiếng Việt) */
  const [transcriptEnabled, setTranscriptEnabled] = useState<boolean>(true);
  const [livePartial, setLivePartial] = useState<string>('');
  const transcriptRef = useRef<TranscriptSegment[]>([]);
  const [audioSeekMode, setAudioSeekMode] = useState<boolean>(false);
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);
  const [playbackTime, setPlaybackTime] = useState<number | null>(null);

  // Modals & Sidebar
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);

  // PDF import & thông báo
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Bảng viết tay -> khung chữ.
  // Nội dung khung chữ = inkBaseText (đã chốt) + phần chữ "sống" đang nhận diện.
  const [inkInputTargetId, setInkInputTargetId] = useState<string | null>(null);
  const inkBaseTextRef = useRef<string>('');
  const inkLineTokenRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------
  const historyRef = useRef(new HistoryEngine<Notebook[]>(120));
  const notebooksRef = useRef<Notebook[]>([]);
  const [historyInfo, setHistoryInfo] = useState({ canUndo: false, canRedo: false });

  const syncHistoryInfo = useCallback(() => {
    const info = historyRef.current.getInfo();
    setHistoryInfo({ canUndo: info.canUndo, canRedo: info.canRedo });
  }, []);

  /**
   * Cửa duy nhất để thay đổi dữ liệu sổ tay.
   * Ghi lại trạng thái cũ vào History trước khi áp trạng thái mới.
   */
  const commit = useCallback((next: Notebook[], coalesceKey?: string) => {
    const previous = notebooksRef.current;
    if (next === previous) return;

    historyRef.current.record(previous, coalesceKey);
    notebooksRef.current = next;
    setNotebooks(next);
    syncHistoryInfo();
  }, [syncHistoryInfo]);

  const handleUndo = useCallback(() => {
    const restored = historyRef.current.undo(notebooksRef.current);
    if (!restored) return;
    notebooksRef.current = restored;
    setNotebooks(restored);
    syncHistoryInfo();
  }, [syncHistoryInfo]);

  const handleRedo = useCallback(() => {
    const restored = historyRef.current.redo(notebooksRef.current);
    if (!restored) return;
    notebooksRef.current = restored;
    setNotebooks(restored);
    syncHistoryInfo();
  }, [syncHistoryInfo]);

  // ---------------------------------------------------------------------------
  // Nạp & lưu dữ liệu (IndexedDB)
  // ---------------------------------------------------------------------------
  /** Ảnh chụp những gì đã ghi xuống đĩa, để biết sổ tay nào thực sự đổi */
  const persistedRef = useRef<Map<string, Notebook>>(new Map());

  useEffect(() => {
    let cancelled = false;

    StorageEngine.loadLibrary().then(loaded => {
      if (cancelled) return;
      notebooksRef.current = loaded;
      persistedRef.current = new Map(loaded.map(nb => [nb.id, nb]));
      setNotebooks(loaded);
      if (loaded.length > 0) setActiveNotebookId(loaded[0].id);
      setIsLoaded(true);

      // Dọn ảnh/ghi âm mồ côi sau khi xoá trang hoặc sổ tay ở phiên trước.
      // Chỉ chạy khi chắc chắn đã nạp được dữ liệu — nếu nạp hụt mà vẫn dọn thì
      // sẽ xoá nhầm asset đang dùng.
      if (loaded.length > 0) {
        setTimeout(() => {
          StorageEngine.collectGarbage(notebooksRef.current)
            .then(removed => {
              if (removed > 0) console.info(`Đã dọn ${removed} tệp đính kèm không còn dùng.`);
            })
            .catch(() => { /* dọn rác thất bại không ảnh hưởng gì */ });
        }, 4000);
      }
    });

    return () => { cancelled = true; };
  }, []);

  /**
   * Ghi GIA TĂNG: chỉ những sổ tay có tham chiếu khác lần ghi trước mới được
   * lưu lại. Vì mọi cập nhật đều là immutable nên so sánh tham chiếu là đủ và
   * chính xác — vẽ một nét chỉ chạm vào đúng sổ tay đang mở.
   */
  const flushToStorage = useCallback(async (library: Notebook[]) => {
    const persisted = persistedRef.current;
    const results: SaveResult[] = [];

    for (const notebook of library) {
      if (persisted.get(notebook.id) === notebook) continue;
      const result = await StorageEngine.saveNotebook(notebook);
      results.push(result);
      if (result.ok) persisted.set(notebook.id, notebook);
    }

    const liveIds = new Set(library.map(nb => nb.id));
    for (const id of Array.from(persisted.keys())) {
      if (liveIds.has(id)) continue;
      await StorageEngine.deleteNotebook(id);
      persisted.delete(id);
    }

    await StorageEngine.saveOrder(library.map(nb => nb.id));

    const failure = results.find(r => !r.ok);
    if (failure) setToast({ type: 'error', message: `Lưu thất bại: ${failure.error}` });
  }, []);

  // Lưu có debounce: một nét vẽ tạo hàng chục lần cập nhật state
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => flushToStorage(notebooks), 500);
    return () => clearTimeout(timer);
  }, [notebooks, isLoaded, flushToStorage]);

  // Lưu ngay khi ứng dụng bị đưa xuống nền (Android có thể kill tiến trình)
  useEffect(() => {
    if (!isLoaded) return;

    const flush = () => {
      if (document.visibilityState === 'hidden') flushToStorage(notebooksRef.current);
    };
    const flushNow = () => flushToStorage(notebooksRef.current);

    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flushNow);
    };
  }, [isLoaded, flushToStorage]);

  // Giữ activeNotebookId luôn trỏ tới sổ tay tồn tại (sau undo hoặc xoá)
  useEffect(() => {
    if (!isLoaded) return;
    if (notebooks.length === 0) {
      if (activeNotebookId) setActiveNotebookId('');
      return;
    }
    if (!notebooks.some(n => n.id === activeNotebookId)) {
      setActiveNotebookId(notebooks[0].id);
    }
  }, [notebooks, activeNotebookId, isLoaded]);

  // Kẹp chỉ số trang trong khoảng hợp lệ
  useEffect(() => {
    const nb = notebooks.find(n => n.id === activeNotebookId);
    const maxIndex = Math.max(0, (nb?.pages.length ?? 1) - 1);
    setCurrentPageIndex(prev => Math.min(prev, maxIndex));
  }, [notebooks, activeNotebookId]);

  // Lần đầu mở app: canh trang vừa chiều ngang khung nhìn.
  // Chạy sau khi CanvasArea đã mount nên nó nhận được fitRequest.
  useEffect(() => {
    if (isLoaded) requestFit('width');
  }, [isLoaded]);

  // Tự ẩn thông báo dạng info
  useEffect(() => {
    if (toast?.type !== 'info') return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Audio recording timer loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecordingAudio) {
      interval = setInterval(() => {
        setRecordingTime(audioEngine.getElapsedSeconds());
      }, 500);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecordingAudio]);

  const activeNotebook = notebooks.find(n => n.id === activeNotebookId) || null;
  const currentPage = activeNotebook?.pages[currentPageIndex] || null;

  // ---------------------------------------------------------------------------
  // Phím tắt
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();

      if (key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Chỉ nhường Ctrl+Z cho ô tìm kiếm. Khung chữ trên trang là controlled
      // component nên undo mặc định của trình duyệt không hoạt động — phải dùng
      // History của ứng dụng.
      if (target?.tagName === 'INPUT') return;

      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMode(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [handleUndo, handleRedo]);

  // ---------------------------------------------------------------------------
  // Zoom
  // ---------------------------------------------------------------------------
  // Bước zoom theo tỉ lệ (nhân/chia) để mượt ở cả mức nhỏ và mức lớn
  const handleZoomIn = () => setZoomLevel(prev => clampZoom(prev * 1.15, MIN_ZOOM, MAX_ZOOM));
  const handleZoomOut = () => setZoomLevel(prev => clampZoom(prev / 1.15, MIN_ZOOM, MAX_ZOOM));
  const handleResetZoom = () => setZoomLevel(1.0);
  const requestFit = (mode: 'width' | 'page') =>
    setFitRequest(prev => ({ mode, token: (prev?.token ?? 0) + 1 }));

  // ---------------------------------------------------------------------------
  // Cập nhật trang / sổ tay
  // ---------------------------------------------------------------------------
  const applyPageUpdate = (updatedPage: NotebookPage, coalesceKey?: string) => {
    const notebook = notebooksRef.current.find(n => n.id === activeNotebookId);
    if (!notebook) return;

    const updatedPages = notebook.pages.map((p, idx) => (idx === currentPageIndex ? updatedPage : p));
    const updatedNotebook = { ...notebook, pages: updatedPages, updatedAt: Date.now() };

    commit(
      notebooksRef.current.map(n => (n.id === activeNotebookId ? updatedNotebook : n)),
      coalesceKey
    );
  };

  const handleAddPage = () => {
    if (!activeNotebook) return;
    const newPageIndex = activeNotebook.pages.length;
    const reference = activeNotebook.pages[currentPageIndex];

    // Trang mới kế thừa khổ giấy của trang đang xem; trang PDF ('custom') thì
    // quay về mặc định của sổ tay vì không có file PDF cho trang trắng mới.
    const inheritedSize: PaperSizeId =
      reference?.paperSize && reference.paperSize !== 'custom'
        ? reference.paperSize
        : activeNotebook.defaultPaperSize ?? DEFAULT_PAPER_SIZE;

    const newPage: NotebookPage = {
      id: `p-${Date.now()}`,
      pageIndex: newPageIndex,
      template: reference?.template || 'grid',
      paperSize: inheritedSize,
      orientation: reference?.orientation ?? activeNotebook.defaultOrientation ?? DEFAULT_ORIENTATION,
      strokes: [],
      textElements: [],
      imageElements: [],
      audioNotes: []
    };

    const updatedNotebook = {
      ...activeNotebook,
      pages: [...activeNotebook.pages, newPage],
      updatedAt: Date.now()
    };

    commit(notebooks.map(n => (n.id === activeNotebookId ? updatedNotebook : n)));
    setCurrentPageIndex(newPageIndex);
  };

  const handleDeletePage = (index: number) => {
    if (!activeNotebook || activeNotebook.pages.length <= 1) return;
    const updatedPages = activeNotebook.pages.filter((_, idx) => idx !== index);
    const updatedNotebook = { ...activeNotebook, pages: updatedPages, updatedAt: Date.now() };
    commit(notebooks.map(n => (n.id === activeNotebookId ? updatedNotebook : n)));
  };

  const handleCreateNotebook = (
    title: string,
    category: string,
    template: PaperTemplate,
    paperSize: PaperSizeId = DEFAULT_PAPER_SIZE,
    orientation: PaperOrientation = DEFAULT_ORIENTATION
  ) => {
    const newNb: Notebook = {
      id: `nb-${Date.now()}`,
      title,
      category,
      coverColor: 'from-indigo-600 to-purple-600',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      defaultPaperSize: paperSize,
      defaultOrientation: orientation,
      pages: [
        {
          id: `p-${Date.now()}-1`,
          pageIndex: 0,
          template: template,
          paperSize,
          orientation,
          strokes: [],
          textElements: [],
          imageElements: [],
          audioNotes: []
        }
      ]
    };

    commit([newNb, ...notebooks]);
    setActiveNotebookId(newNb.id);
    setCurrentPageIndex(0);
  };

  const handleDeleteNotebook = (id: string) => {
    commit(notebooks.filter(n => n.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Quản lý sổ tay
  // ---------------------------------------------------------------------------
  /** Ghi lại thay đổi cho đúng một sổ tay, giữ nguyên phần còn lại */
  const patchNotebook = (notebookId: string, patch: Partial<Notebook>, coalesceKey?: string) => {
    const target = notebooksRef.current.find(n => n.id === notebookId);
    if (!target) return;

    const updated: Notebook = { ...target, ...patch, updatedAt: Date.now() };
    commit(
      notebooksRef.current.map(n => (n.id === notebookId ? updated : n)),
      coalesceKey
    );
  };

  const handleRenameNotebook = (notebookId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    // Gõ liên tục trong ô tên chỉ tạo 1 bước hoàn tác
    patchNotebook(notebookId, { title: trimmed }, `rename-${notebookId}`);
  };

  const handleChangeNotebookCategory = (notebookId: string, category: string) =>
    patchNotebook(notebookId, { category });

  const handleChangeNotebookCover = (notebookId: string, coverColor: string) =>
    patchNotebook(notebookId, { coverColor });

  // ---------------------------------------------------------------------------
  // Quản lý trang
  // ---------------------------------------------------------------------------
  /** Áp danh sách trang mới cho sổ tay đang mở */
  const setActivePages = (pages: NotebookPage[]) => {
    const notebook = notebooksRef.current.find(n => n.id === activeNotebookId);
    if (!notebook) return;
    commit(
      notebooksRef.current.map(n =>
        n.id === activeNotebookId
          ? { ...n, pages: PageOps.reindex(pages), updatedAt: Date.now() }
          : n
      )
    );
  };

  const handleRenamePage = (index: number, title: string) => {
    const notebook = notebooksRef.current.find(n => n.id === activeNotebookId);
    if (!notebook) return;

    const pages = notebook.pages.map((p, i) =>
      i === index ? { ...p, title: title.trim() || undefined } : p
    );
    commit(
      notebooksRef.current.map(n =>
        n.id === activeNotebookId ? { ...n, pages, updatedAt: Date.now() } : n
      ),
      `rename-page-${notebook.id}-${index}`
    );
  };

  const handleDuplicatePage = (index: number) => {
    const notebook = notebooksRef.current.find(n => n.id === activeNotebookId);
    const source = notebook?.pages[index];
    if (!notebook || !source) return;

    // Bản sao dùng CHUNG asset ảnh/ghi âm với bản gốc — không nhân đôi dung lượng
    const copy = PageOps.duplicatePage(source);
    const pages = [...notebook.pages];
    pages.splice(index + 1, 0, copy);

    setActivePages(pages);
    setCurrentPageIndex(index + 1);
    setToast({ type: 'info', message: `Đã nhân bản trang ${index + 1}.` });
  };

  const handleReorderPages = (from: number, to: number) => {
    const notebook = notebooksRef.current.find(n => n.id === activeNotebookId);
    if (!notebook || from === to) return;

    setActivePages(PageOps.movePage(notebook.pages, from, to));

    // Giữ người dùng ở đúng trang họ đang xem sau khi thứ tự đổi
    setCurrentPageIndex(prev => {
      if (prev === from) return to;
      if (from < prev && to >= prev) return prev - 1;
      if (from > prev && to <= prev) return prev + 1;
      return prev;
    });
  };

  const handleMovePageToNotebook = (pageIndex: number, targetNotebookId: string) => {
    const library = notebooksRef.current;
    const source = library.find(n => n.id === activeNotebookId);
    const target = library.find(n => n.id === targetNotebookId);
    const page = source?.pages[pageIndex];
    if (!source || !target || !page || source.id === target.id) return;

    if (source.pages.length <= 1) {
      setToast({ type: 'error', message: 'Sổ tay phải còn ít nhất một trang.' });
      return;
    }

    const now = Date.now();
    commit(
      library.map(n => {
        if (n.id === source.id) {
          return {
            ...n,
            pages: PageOps.reindex(n.pages.filter((_, i) => i !== pageIndex)),
            updatedAt: now
          };
        }
        if (n.id === target.id) {
          return { ...n, pages: PageOps.reindex([...n.pages, page]), updatedAt: now };
        }
        return n;
      })
    );

    setToast({
      type: 'info',
      message: `Đã chuyển trang ${pageIndex + 1} sang sổ tay "${target.title}".`
    });
  };

  // ---------------------------------------------------------------------------
  // Khay nhớ tạm — sống ở App để copy/paste được giữa các trang và sổ tay
  // ---------------------------------------------------------------------------
  const clipboardRef = useRef<ClipboardPayload | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);

  const handleCopySelection = (payload: ClipboardPayload) => {
    clipboardRef.current = payload;
    setHasClipboard(!PageOps.isClipboardEmpty(payload));

    const count =
      payload.strokes.length + payload.textElements.length + payload.imageElements.length;
    setToast({ type: 'info', message: `Đã sao chép ${count} đối tượng. Dán bằng Ctrl + V.` });
  };

  const readClipboard = (): ClipboardPayload | null => clipboardRef.current;

  const handleChangePageTemplate = (template: PaperTemplate) => {
    if (!currentPage) return;
    applyPageUpdate({ ...currentPage, template });
  };

  /** Đổi khổ giấy cho TRANG đang xem */
  const handleChangePageSize = (paperSize: PaperSizeId, orientation: PaperOrientation) => {
    if (!currentPage) return;

    // Bỏ kích thước riêng của trang PDF khi người dùng chủ động chọn khổ khác
    const { pageWidth, pageHeight, ...rest } = currentPage;
    applyPageUpdate({ ...rest, paperSize, orientation });
    requestFit('page');
  };

  /** Áp khổ giấy cho TOÀN BỘ trang trong sổ tay và đặt làm mặc định */
  const handleApplyPageSizeToNotebook = (paperSize: PaperSizeId, orientation: PaperOrientation) => {
    const notebook = notebooksRef.current.find(n => n.id === activeNotebookId);
    if (!notebook) return;

    const updatedNotebook: Notebook = {
      ...notebook,
      defaultPaperSize: paperSize,
      defaultOrientation: orientation,
      updatedAt: Date.now(),
      pages: notebook.pages.map(({ pageWidth, pageHeight, ...rest }) => ({
        ...rest,
        paperSize,
        orientation
      }))
    };

    commit(notebooksRef.current.map(n => (n.id === activeNotebookId ? updatedNotebook : n)));
    requestFit('page');
    setToast({
      type: 'info',
      message: `Đã áp khổ giấy mới cho toàn bộ ${notebook.pages.length} trang của sổ tay này.`
    });
  };

  // ---------------------------------------------------------------------------
  // Chèn ảnh
  // ---------------------------------------------------------------------------
  const handleInsertImage = async () => {
    if (!currentPage || !activeNotebook) {
      setToast({ type: 'info', message: 'Hãy tạo hoặc chọn một sổ tay trước khi chèn ảnh.' });
      return;
    }

    const file = await ImageImporter.pickImage();
    if (!file) return;

    try {
      const imported = await ImageImporter.loadAndCompress(file);
      const stagger = (currentPage.imageElements.length % 5) * 28;

      // Blob vào store `assets` ngay lúc chèn; bản ghi sổ tay chỉ giữ assetId
      const assetId = StorageEngine.newAssetId('image');
      const objectUrl = await StorageEngine.putAsset(assetId, imported.blob, 'image');

      const newImage: ImageElement = {
        id: `img-${Date.now()}`,
        x: 90 + stagger,
        y: 110 + stagger,
        width: imported.width,
        height: imported.height,
        rotation: 0,
        assetId,
        src: objectUrl
      };

      applyPageUpdate({ ...currentPage, imageElements: [...currentPage.imageElements, newImage] });
      setToast({ type: 'info', message: 'Đã chèn ảnh. Kéo tay cầm góc trên-trái để di chuyển, góc dưới-phải để resize.' });
    } catch (e: any) {
      setToast({ type: 'error', message: e?.message || 'Không chèn được ảnh này.' });
    }
  };

  // ---------------------------------------------------------------------------
  // Import PDF thật bằng pdf.js
  // ---------------------------------------------------------------------------
  const handleImportPdf = async () => {
    // Nạp pdf.js theo yêu cầu: thư viện rất nặng, không nên làm chậm lúc mở app
    const { PdfImporter } = await import('./engine/PdfImporter');

    const file = await PdfImporter.pickFile();
    if (!file) return;

    setPdfProgress({ current: 0, total: 0 });

    try {
      const pages = await PdfImporter.renderPdfToPages(file, 40, setPdfProgress);

      if (pages.length === 0) {
        setToast({ type: 'error', message: 'File PDF này không có trang nào đọc được.' });
        return;
      }

      const baseTime = Date.now();
      // Mỗi trang PDF dùng khổ 'custom' theo đúng tỉ lệ file gốc, chuẩn hoá về
      // chiều ngang 900px để nét bút có mật độ hợp lý trên mọi cỡ PDF.
      const PDF_PAGE_WIDTH = 900;

      const newPages: NotebookPage[] = await Promise.all(
        pages.map(async (rendered, i) => {
          const assetId = StorageEngine.newAssetId('pdf');
          const objectUrl = await StorageEngine.putAsset(assetId, rendered.blob, 'pdf');

          return {
            id: `p-pdf-${baseTime}-${i}`,
            pageIndex: 0, // Được đánh lại số ngay bên dưới
            template: 'blank',
            paperSize: 'custom',
            pageWidth: PDF_PAGE_WIDTH,
            pageHeight: Math.round(PDF_PAGE_WIDTH * (rendered.height / rendered.width)),
            pdfPageNumber: rendered.pageNumber,
            pdfAssetId: assetId,
            pdfDataUrl: objectUrl,
            pdfSourceName: file.name,
            strokes: [],
            textElements: [],
            imageElements: [],
            audioNotes: []
          } as NotebookPage;
        })
      );

      const targetNotebook = notebooksRef.current.find(n => n.id === activeNotebookId);

      if (targetNotebook) {
        // Chèn ngay sau trang đang xem
        const insertAt = currentPageIndex + 1;
        const merged = [
          ...targetNotebook.pages.slice(0, insertAt),
          ...newPages,
          ...targetNotebook.pages.slice(insertAt)
        ].map((p, idx) => ({ ...p, pageIndex: idx }));

        const updatedNotebook = {
          ...targetNotebook,
          pdfFileName: file.name,
          pages: merged,
          updatedAt: Date.now()
        };

        commit(notebooksRef.current.map(n => (n.id === activeNotebookId ? updatedNotebook : n)));
        setCurrentPageIndex(insertAt);
      } else {
        // Chưa có sổ tay nào: tạo mới theo tên file PDF
        const newNotebook: Notebook = {
          id: `nb-pdf-${baseTime}`,
          title: file.name.replace(/\.pdf$/i, ''),
          category: 'Tài Liệu',
          coverColor: 'from-blue-600 to-indigo-700',
          createdAt: baseTime,
          updatedAt: baseTime,
          pdfFileName: file.name,
          pages: newPages.map((p, idx) => ({ ...p, pageIndex: idx }))
        };

        commit([newNotebook, ...notebooksRef.current]);
        setActiveNotebookId(newNotebook.id);
        setCurrentPageIndex(0);
      }

      const totalInFile = await PdfImporter.getPageCount(file).catch(() => pages.length);
      setToast({
        type: 'info',
        message: totalInFile > pages.length
          ? `Đã import ${pages.length}/${totalInFile} trang đầu của "${file.name}" (giới hạn 40 trang mỗi lần).`
          : `Đã import ${pages.length} trang từ "${file.name}". Viết chú thích trực tiếp lên trang PDF.`
      });
    } catch (e: any) {
      console.error('Import PDF thất bại:', e);
      setToast({ type: 'error', message: `Không đọc được file PDF: ${e?.message || 'lỗi không xác định'}` });
    } finally {
      setPdfProgress(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Ghi âm đồng bộ nét vẽ
  // ---------------------------------------------------------------------------
  const handleToggleRecording = async () => {
    if (!isRecordingAudio) {
      if (!currentPage) {
        setToast({ type: 'info', message: 'Hãy chọn một trang trước khi ghi âm.' });
        return;
      }
      const result = await audioEngine.startRecording();
      if (!result.ok) {
        setToast({ type: 'error', message: result.error || 'Không bắt đầu ghi âm được.' });
        return;
      }

      setIsRecordingAudio(true);
      transcriptRef.current = [];
      setLivePartial('');

      let transcriptNote = '';
      if (transcriptEnabled) {
        // Nhiều máy Android không cho ghi âm và nhận giọng nói cùng lúc.
        // Thất bại ở đây KHÔNG được làm hỏng bản ghi — chỉ là không có phụ đề.
        const speech = await SpeechTranscriber.start({
          onSegment: text => {
            transcriptRef.current = [
              ...transcriptRef.current,
              { time: audioEngine.getElapsedSeconds(), text }
            ];
            setLivePartial('');
          },
          onPartial: setLivePartial,
          onFailure: () => setLivePartial('')
        });

        transcriptNote = speech.ok
          ? ' Phụ đề đang chạy.'
          : ' Không bật được phụ đề (máy có thể không cho ghi âm và nhận giọng nói cùng lúc) — vẫn ghi âm bình thường.';
      }

      setToast({
        type: 'info',
        message: 'Đang ghi âm — mọi nét viết từ giờ đều được gắn mốc thời gian.' + transcriptNote
      });
      return;
    }

    await SpeechTranscriber.stop();
    setLivePartial('');

    const recording = await audioEngine.stopRecording();
    setIsRecordingAudio(false);

    if (!recording) {
      setToast({ type: 'error', message: 'Không thu được dữ liệu âm thanh nào.' });
      return;
    }

    const page = notebooksRef.current
      .find(n => n.id === activeNotebookId)?.pages[currentPageIndex];

    if (!page) {
      setToast({ type: 'error', message: 'Trang ghi chú không còn tồn tại, bản ghi bị bỏ.' });
      return;
    }

    const assetId = StorageEngine.newAssetId('audio');
    const objectUrl = await StorageEngine.putAsset(assetId, recording.blob, 'audio');

    const newNote: AudioNote = {
      id: `audio-${Date.now()}`,
      title: `Bản ghi ${new Date().toLocaleTimeString('vi-VN')}`,
      assetId,
      url: objectUrl,
      duration: recording.duration,
      createdAt: Date.now(),
      transcript: transcriptRef.current.length > 0 ? transcriptRef.current : undefined
    };

    applyPageUpdate({ ...page, audioNotes: [...(page.audioNotes || []), newNote] });
    setAudioBarOpen(true);
    setToast({
      type: 'info',
      message:
        `Đã lưu bản ghi ${Math.round(recording.duration)}s` +
        (transcriptRef.current.length > 0
          ? ` kèm ${transcriptRef.current.length} câu phụ đề. Chạm một câu để nhảy tới đúng đoạn.`
          : '. Bật "Chạm nét nghe lại" rồi chạm vào nét vẽ để nghe đúng đoạn.')
    });
  };

  const handleDeleteAudioNote = (noteId: string) => {
    if (!currentPage) return;

    // Không revoke Object URL: nếu người dùng bấm Hoàn tác thì bản ghi phải
    // phát lại được ngay.
    const remaining = currentPage.audioNotes.filter(n => n.id !== noteId);
    applyPageUpdate({ ...currentPage, audioNotes: remaining });
    if (remaining.length === 0) {
      setAudioBarOpen(false);
      setAudioSeekMode(false);
    }
  };

  const handleSeekAudioFromStroke = (timeInSeconds: number) => {
    setSeekRequest(prev => ({ time: timeInSeconds, token: (prev?.token ?? 0) + 1 }));
  };

  // Đóng thanh phát khi trang hiện tại không còn bản ghi nào
  useEffect(() => {
    if ((currentPage?.audioNotes?.length ?? 0) === 0) {
      setAudioBarOpen(false);
      setAudioSeekMode(false);
      setPlaybackTime(null);
      setSeekRequest(null);
    }
  }, [currentPage?.id, currentPage?.audioNotes?.length]);

  // ---------------------------------------------------------------------------
  // Bảng viết tay -> khung chữ (nhận diện thời gian thực)
  // ---------------------------------------------------------------------------
  /** Lấy trang hiện tại từ ref để không dùng state cũ trong vòng lặp nhận diện */
  const readCurrentPage = (): NotebookPage | null =>
    notebooksRef.current.find(n => n.id === activeNotebookId)?.pages[currentPageIndex] ?? null;

  const handleRequestInkInput = (textElementId: string) => {
    // Đang bật cho chính khung này -> tắt
    if (inkInputTargetId === textElementId) {
      setInkInputTargetId(null);
      return;
    }

    const page = readCurrentPage();
    const target = page?.textElements.find(t => t.id === textElementId);
    if (!page || !target) return;

    // Chặn sớm khi offline: engine nhận diện là dịch vụ web, không có bộ nhận
    // diện offline nào chạy được (module ML Kit trong native/ viết cho React
    // Native, không nạp được vào bản Capacitor này).
    if (navigator.onLine === false) {
      setToast({
        type: 'error',
        message: 'Nhận diện chữ viết tay cần kết nối mạng. Hãy bật Wi-Fi hoặc dữ liệu rồi thử lại.'
      });
      return;
    }

    // Chữ hiện có trở thành phần "đã chốt"; chữ nhận diện được nối vào sau đó
    const existing = target.text.trim();
    const isPlaceholder = existing === 'Ghi chú Tiếng Việt mới...';
    inkBaseTextRef.current = isPlaceholder || existing === '' ? '' : `${target.text} `;
    inkLineTokenRef.current += 1;

    // Xoá chữ mẫu ngay để khung không hiện "Ghi chú Tiếng Việt mới..." khi viết
    if (isPlaceholder) {
      applyPageUpdate({
        ...page,
        textElements: page.textElements.map(t => (t.id === textElementId ? { ...t, text: '' } : t))
      });
    }

    setInkInputTargetId(textElementId);
    setAudioBarOpen(false); // Hai thanh dưới cùng không chồng nhau
    setToast({
      type: 'info',
      message: 'Viết Tiếng Việt vào bảng dưới cùng — chữ tự chạy vào khung. Bấm "Xong dòng" để chốt.'
    });
  };

  /** Thay phần chữ "sống" bằng kết quả nhận diện mới nhất của cả dòng */
  const handleLiveInkText = (recognizedLine: string) => {
    const page = readCurrentPage();
    if (!page || !inkInputTargetId) return;

    const nextText = inkBaseTextRef.current + recognizedLine;
    const updated = page.textElements.map(t =>
      t.id === inkInputTargetId ? { ...t, text: nextText } : t
    );

    // Cả một dòng viết tay gộp thành MỘT bước hoàn tác: phần chữ này do máy
    // quản lý cho tới khi người dùng bấm "Xong dòng".
    applyPageUpdate(
      { ...page, textElements: updated },
      `ink-live-${inkInputTargetId}-${inkLineTokenRef.current}`
    );
  };

  /** Chốt dòng: chữ đang sống trở thành chữ thường, sửa tay được */
  const handleCommitInkLine = (lineBreak: boolean) => {
    const page = readCurrentPage();
    const target = page?.textElements.find(t => t.id === inkInputTargetId);
    if (!page || !target) return;

    inkBaseTextRef.current = `${target.text}${lineBreak ? '\n' : ' '}`;
    inkLineTokenRef.current += 1; // Dòng sau là một bước hoàn tác riêng

    if (lineBreak) {
      applyPageUpdate({
        ...page,
        textElements: page.textElements.map(t =>
          t.id === inkInputTargetId ? { ...t, text: inkBaseTextRef.current } : t
        )
      });
    }
  };

  const handleInkUnavailable = (reason: string) => {
    setInkInputTargetId(null);
    setToast({ type: 'error', message: reason });
  };

  // Khung chữ đích bị xoá hoặc đổi trang -> tắt bảng viết
  useEffect(() => {
    if (!inkInputTargetId) return;
    const stillExists = currentPage?.textElements.some(t => t.id === inkInputTargetId);
    if (!stillExists) setInkInputTargetId(null);
  }, [currentPage?.id, currentPage?.textElements, inkInputTargetId]);

  // ---------------------------------------------------------------------------
  // OCR ảnh & quét tài liệu
  // ---------------------------------------------------------------------------
  const [ocrBusyImageId, setOcrBusyImageId] = useState<string | null>(null);
  const [scannerBusy, setScannerBusy] = useState(false);

  /** Đọc chữ trong một ảnh đã chèn, chèn kết quả thành khung chữ bên dưới ảnh */
  const handleOcrImage = async (imageId: string) => {
    const page = readCurrentPage();
    const image = page?.imageElements.find(i => i.id === imageId);
    if (!page || !image) return;

    if (!image.assetId) {
      setToast({ type: 'error', message: 'Ảnh này không còn dữ liệu gốc để đọc chữ.' });
      return;
    }

    setOcrBusyImageId(imageId);
    try {
      const asset = await StorageEngine.getAsset(image.assetId);
      if (!asset?.blob) throw new Error('Không tìm thấy dữ liệu ảnh');

      const result = await DocumentCapture.recognizeTextInBlob(asset.blob);

      if (!result.text) {
        setToast({ type: 'error', message: 'Không đọc được chữ nào trong ảnh này.' });
        return;
      }

      const newText: TextElement = {
        id: `t-ocr-${Date.now()}`,
        x: image.x,
        y: image.y + image.height + 16,
        width: Math.max(320, image.width),
        height: Math.max(80, result.lineCount * 30 + 24),
        text: result.text,
        fontFamily: "'Comfortaa', sans-serif",
        fontSize: 20,
        color: '#1e293b',
        textAlign: 'left'
      };

      const latest = readCurrentPage();
      if (!latest) return;
      applyPageUpdate({ ...latest, textElements: [...latest.textElements, newText] });

      setToast({
        type: 'info',
        message: `Đã đọc ${result.lineCount} dòng chữ từ ảnh. Khung chữ mới nằm ngay dưới ảnh, sửa được.`
      });
    } catch (e: any) {
      setToast({ type: 'error', message: e?.message || 'Đọc chữ từ ảnh thất bại.' });
    } finally {
      setOcrBusyImageId(null);
    }
  };

  /** Quét tài liệu bằng camera: mỗi trang quét thành một trang ghi chú */
  const handleScanDocument = async () => {
    if (scannerBusy) return;

    if (!(await DocumentCapture.isScannerAvailable())) {
      setToast({
        type: 'error',
        message: 'Quét tài liệu chỉ có trên bản ứng dụng Android.'
      });
      return;
    }

    setScannerBusy(true);
    try {
      setToast({ type: 'info', message: 'Đang chuẩn bị bộ quét của Google…' });
      const ready = await DocumentCapture.ensureScannerModule();
      if (!ready.ok) {
        setToast({ type: 'error', message: ready.error || 'Chưa sẵn sàng quét.' });
        return;
      }

      const scanned = await DocumentCapture.scanDocument(10);
      if (scanned.length === 0) {
        setScannerBusy(false);
        return; // Người dùng huỷ giữa chừng
      }

      const baseTime = Date.now();
      const PAGE_WIDTH = 900;

      const newPages: NotebookPage[] = await Promise.all(
        scanned.map(async (item, i) => {
          const assetId = StorageEngine.newAssetId('pdf');
          const objectUrl = await StorageEngine.putAsset(assetId, item.blob, 'pdf');

          return {
            id: `p-scan-${baseTime}-${i}`,
            pageIndex: 0,
            template: 'blank',
            paperSize: 'custom',
            pageWidth: PAGE_WIDTH,
            pageHeight: Math.round(PAGE_WIDTH * (item.height / item.width)),
            pdfAssetId: assetId,
            pdfDataUrl: objectUrl,
            pdfSourceName: `Bản quét ${new Date().toLocaleDateString('vi-VN')}`,
            strokes: [],
            textElements: [],
            imageElements: [],
            audioNotes: []
          } as NotebookPage;
        })
      );

      const notebook = notebooksRef.current.find(n => n.id === activeNotebookId);
      if (notebook) {
        const insertAt = currentPageIndex + 1;
        const merged = PageOps.reindex([
          ...notebook.pages.slice(0, insertAt),
          ...newPages,
          ...notebook.pages.slice(insertAt)
        ]);
        commit(
          notebooksRef.current.map(n =>
            n.id === activeNotebookId ? { ...n, pages: merged, updatedAt: Date.now() } : n
          )
        );
        setCurrentPageIndex(insertAt);
      }

      setToast({
        type: 'info',
        message: `Đã quét ${scanned.length} trang, viền đã được cắt và nắn thẳng. Ghi chú trực tiếp lên được.`
      });
    } catch (e: any) {
      setToast({ type: 'error', message: e?.message || 'Quét tài liệu thất bại.' });
    } finally {
      setScannerBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Thẻ ôn tập
  // ---------------------------------------------------------------------------
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [creatingFlashcard, setCreatingFlashcard] = useState(false);

  useEffect(() => {
    FlashcardEngine.loadAll().then(setFlashcards);
  }, []);

  const persistFlashcards = (next: Flashcard[]) => {
    setFlashcards(next);
    FlashcardEngine.saveAll(next);
  };

  const handleCreateFlashcard = async (
    region: { x: number; y: number; width: number; height: number },
    suggestedBack: string
  ) => {
    const page = readCurrentPage();
    const notebook = notebooksRef.current.find(n => n.id === activeNotebookId);
    if (!page || !notebook) return;

    setCreatingFlashcard(true);
    try {
      const dims = getPageDimensions(page);
      const canvas = await PageRenderer.renderRegion(page, dims.width, dims.height, region, 2);
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85)
      );
      if (!blob) throw new Error('Không tạo được ảnh mặt trước');

      // Ưu tiên chữ trong khung chữ được chọn; nếu không có thì lấy chỉ mục của trang
      const back = suggestedBack.trim() || page.inkIndex?.text?.trim() || '';

      const card = await FlashcardEngine.create({
        frontBlob: blob,
        backText: back,
        notebookId: notebook.id,
        notebookTitle: notebook.title,
        pageId: page.id,
        pageIndex: currentPageIndex
      });

      persistFlashcards([...flashcards, card]);
      setToast({
        type: 'info',
        message: back
          ? 'Đã tạo thẻ ôn tập. Mở Sổ Tay → Ôn tập để bắt đầu.'
          : 'Đã tạo thẻ ôn tập nhưng chưa có đáp án — đánh chỉ mục trang này để tự điền mặt sau.'
      });
    } catch (e: any) {
      setToast({ type: 'error', message: e?.message || 'Không tạo được thẻ ôn tập.' });
    } finally {
      setCreatingFlashcard(false);
    }
  };

  const handleGradeFlashcard = (cardId: string, grade: ReviewGrade) => {
    persistFlashcards(
      flashcards.map(c => (c.id === cardId ? FlashcardEngine.grade(c, grade) : c))
    );
  };

  const handleDeleteFlashcard = (cardId: string) => {
    persistFlashcards(FlashcardEngine.remove(flashcards, cardId));
  };

  const dueCardCount = useMemo(() => FlashcardEngine.countDue(flashcards), [flashcards]);

  // ---------------------------------------------------------------------------
  // Sao lưu & khôi phục toàn bộ thư viện
  // ---------------------------------------------------------------------------
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Mô hình nhận diện ngoại tuyến (ML Kit)
  // ---------------------------------------------------------------------------
  const [inkModelStatus, setInkModelStatus] = useState<ModelStatus>('unknown');

  useEffect(() => {
    InkRecognitionService.refreshModelStatus().then(setInkModelStatus);
    return InkRecognitionService.onStatusChange(setInkModelStatus);
  }, []);

  const handleDownloadInkModel = async () => {
    setToast({
      type: 'info',
      message: `Đang tải mô hình tiếng Việt (${MODEL_SIZE_LABEL}). Lần này cần mạng, sau đó dùng được ngoại tuyến.`
    });

    const result = await InkRecognitionService.downloadModel();
    setToast(
      result.ok
        ? { type: 'info', message: 'Đã tải xong. Nhận diện chữ viết tay giờ chạy ngay trên máy, không cần mạng.' }
        : { type: 'error', message: result.error || 'Tải mô hình thất bại.' }
    );
  };

  // ---------------------------------------------------------------------------
  // Đánh chỉ mục chữ viết tay để tìm kiếm
  // ---------------------------------------------------------------------------
  const indexerRef = useRef<InkIndexer | null>(null);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);

  /**
   * Ghi chỉ mục vào trang mà KHÔNG đưa vào lịch sử hoàn tác.
   *
   * Đánh chỉ mục là việc của máy, không phải thao tác của người dùng. Nếu mỗi
   * trang được đánh chỉ mục thành một bước undo thì bấm Ctrl+Z sẽ đi lùi qua
   * hàng chục bước vô nghĩa thay vì hoàn tác nét vừa vẽ.
   */
  const applyInkIndex = useCallback((notebookId: string, pageId: string, index: InkIndex) => {
    const library = notebooksRef.current;
    const notebook = library.find(n => n.id === notebookId);
    if (!notebook) return;

    const pageIndex = notebook.pages.findIndex(p => p.id === pageId);
    if (pageIndex < 0) return;

    const pages = [...notebook.pages];
    pages[pageIndex] = { ...pages[pageIndex], inkIndex: index };

    const next = library.map(n => (n.id === notebookId ? { ...n, pages } : n));
    notebooksRef.current = next;
    setNotebooks(next);
  }, []);

  const handleStartIndexing = async () => {
    if (indexerRef.current) return;

    if (InkRecognitionService.getStatus() !== 'ready') {
      setToast({
        type: 'error',
        message: 'Cần tải mô hình ngoại tuyến trước. Đánh chỉ mục cả thư viện qua mạng sẽ rất chậm.'
      });
      return;
    }

    const indexer = new InkIndexer();
    indexerRef.current = indexer;

    const result = await indexer.run(notebooksRef.current, applyInkIndex, setIndexProgress);

    indexerRef.current = null;
    setIndexProgress(null);
    setToast({
      type: 'info',
      message: result.cancelled
        ? `Đã dừng. Kịp đánh chỉ mục ${result.done} trang.`
        : result.done === 0
          ? 'Mọi trang viết tay đều đã có chỉ mục.'
          : `Đã đánh chỉ mục ${result.done} trang. Giờ tìm kiếm thấy được cả chữ viết tay.`
    });
  };

  const handleStopIndexing = () => {
    indexerRef.current?.cancel();
    indexerRef.current = null;
    setIndexProgress(null);
  };

  const inkIndexStats = useMemo(() => InkIndexer.countIndexable(notebooks), [notebooks]);

  const handleDeleteInkModel = async () => {
    await InkRecognitionService.deleteModel();
    setToast({ type: 'info', message: 'Đã xoá mô hình ngoại tuyến. Nhận diện sẽ quay lại dùng mạng.' });
  };


  useEffect(() => {
    StorageEngine.getMeta<number>('lastBackupAt').then(value => {
      if (typeof value === 'number') setLastBackupAt(value);
    });
  }, []);

  const handleCreateBackup = async () => {
    if (isBackingUp) return;
    setIsBackingUp(true);

    try {
      const { BackupEngine } = await import('./engine/BackupEngine');
      const { blob, summary } = await BackupEngine.createBackup(notebooksRef.current);
      const where = await BackupEngine.deliverBackup(blob, BackupEngine.suggestFileName());

      const now = Date.now();
      setLastBackupAt(now);
      StorageEngine.setMeta('lastBackupAt', now);

      setToast({
        type: 'info',
        message:
          `Đã tạo bản sao lưu ${summary.notebooks} sổ tay, ${summary.assets} tệp đính kèm ` +
          `(${BackupEngine.formatBytes(summary.bytes)}). ` +
          (where === 'shared'
            ? 'Chọn Google Drive trong khay chia sẻ để cất giữ.'
            : where === 'saved'
              ? 'File đã được ghi ra bộ nhớ ứng dụng.'
              : 'File đã được tải về máy.')
      });
    } catch (e: any) {
      setToast({ type: 'error', message: `Sao lưu thất bại: ${e?.message || 'lỗi không xác định'}` });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (isBackingUp) return;

    const { BackupEngine, BackupRestoreError } = await import('./engine/BackupEngine');
    const file = await BackupEngine.pickBackupFile();
    if (!file) return;

    setIsBackingUp(true);
    try {
      const { notebooks: restored, assetsRestored } = await BackupEngine.restoreBackup(file);

      // Trộn: sổ tay trùng id được thay bằng bản trong file, sổ tay mới thêm vào.
      // Không xoá sổ tay chỉ có trên máy — khôi phục không được phép làm mất dữ liệu.
      const restoredIds = new Set(restored.map(nb => nb.id));
      const kept = notebooksRef.current.filter(nb => !restoredIds.has(nb.id));
      const merged = [...restored, ...kept];

      commit(merged);
      setActiveNotebookId(restored[0].id);
      setCurrentPageIndex(0);

      const replaced = notebooksRef.current.length - kept.length;
      setToast({
        type: 'info',
        message:
          `Đã khôi phục ${restored.length} sổ tay và ${assetsRestored} tệp đính kèm. ` +
          (replaced > 0 ? `${replaced} sổ tay trùng tên đã được ghi đè.` : 'Không có sổ tay nào bị ghi đè.')
      });
    } catch (e: any) {
      setToast({
        type: 'error',
        message:
          e instanceof BackupRestoreError
            ? e.message
            : `Không khôi phục được: ${e?.message || 'lỗi không xác định'}`
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleJumpToSearchResult = (notebookId: string, pageIndex: number) => {
    setActiveNotebookId(notebookId);
    setCurrentPageIndex(pageIndex);
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-slate-950">
      {/* 1. GoodNotes Top Navigation Header */}
      {!presentMode && <HeaderBar
        notebook={activeNotebook}
        currentPageIndex={currentPageIndex}
        totalPages={activeNotebook?.pages.length || 1}
        paperSizeLabel={getPageSizeLabel(currentPage)}
        isRecording={isRecordingAudio}
        recordingTime={recordingTime}
        onToggleRecording={handleToggleRecording}
        transcriptEnabled={transcriptEnabled}
        onToggleTranscript={() => setTranscriptEnabled(v => !v)}
        livePartial={livePartial}
        onImportPdf={handleImportPdf}
        onExportPage={() => setExportModalOpen(true)}
        onPrevPage={() => setCurrentPageIndex(prev => Math.max(0, prev - 1))}
        onNextPage={() => setCurrentPageIndex(prev => Math.min((activeNotebook?.pages.length || 1) - 1, prev + 1))}
        onAddPage={handleAddPage}
        onOpenSidebar={() => setSidebarOpen(true)}
        canUndo={historyInfo.canUndo}
        canRedo={historyInfo.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenSearch={() => setSearchOpen(true)}
        onInsertImage={handleInsertImage}
        onScanDocument={handleScanDocument}
        isScanning={scannerBusy}
        isImportingPdf={pdfProgress !== null}
        audioNoteCount={currentPage?.audioNotes?.length || 0}
        audioBarOpen={audioBarOpen}
        onToggleAudioBar={() => {
          setAudioBarOpen(prev => {
            if (prev) {
              setAudioSeekMode(false);
              setPlaybackTime(null);
              setSeekRequest(null);
            }
            return !prev;
          });
        }}
      />}

      {/* 2. GoodNotes Sub-Header Floating Toolbar */}
      {!presentMode && <Toolbar
        currentTool={currentTool}
        onSelectTool={setCurrentTool}
        color={color}
        onChangeColor={setColor}
        size={size}
        onChangeSize={setSize}
        fontFamily={fontFamily}
        onChangeFontFamily={setFontFamily}
        smartShapeEnabled={smartShapeEnabled}
        onToggleSmartShape={() => setSmartShapeEnabled(!smartShapeEnabled)}
        stencilTool={stencilTool}
        onChangeStencil={setStencilTool}
        palmRejectionActive={palmRejectionActive}
        onTogglePalmRejection={() => setPalmRejectionActive(!palmRejectionActive)}
        zoomLevel={zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onFitWidth={() => requestFit('width')}
        onFitPage={() => requestFit('page')}
        presentMode={presentMode}
        onTogglePresentMode={() => setPresentMode(v => !v)}
        nightMode={nightMode}
        onToggleNightMode={() => setNightMode(v => !v)}
        onOpenStats={() => setStatsOpen(true)}
        onOpenGraph={() => setGraphOpen(true)}
      />}

      {/* 3. Main Drawing Canvas Area */}
      <main className="flex-1 relative w-full h-full overflow-hidden bg-slate-200">
        {!isLoaded ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
            <span className="text-sm font-semibold">Đang mở dữ liệu sổ tay…</span>
          </div>
        ) : currentPage ? (
          <CanvasArea
            key={currentPage.id}
            page={currentPage}
            currentTool={currentTool}
            color={color}
            size={size}
            fontFamily={fontFamily}
            smartShapeEnabled={smartShapeEnabled}
            stencilTool={stencilTool}
            onDisableStencil={() => setStencilTool('none')}
            palmRejectionActive={palmRejectionActive}
            zoomLevel={zoomLevel}
            onPageUpdate={applyPageUpdate}
            audioRecordingTime={recordingTime}
            isRecordingAudio={isRecordingAudio}
            audioSeekMode={audioSeekMode}
            onSeekAudioFromStroke={handleSeekAudioFromStroke}
            playbackTime={playbackTime}
            onRequestInkInput={handleRequestInkInput}
            inkInputTargetId={inkInputTargetId}
            onZoomChange={setZoomLevel}
            fitRequest={fitRequest}
            allNotebooks={notebooks}
            onFollowLink={handleJumpToSearchResult}
            laserMode={presentMode}
            nightMode={nightMode}
            onCreateFlashcard={handleCreateFlashcard}
            isCreatingFlashcard={creatingFlashcard}
            onOcrImage={handleOcrImage}
            ocrBusyImageId={ocrBusyImageId}
            onCopySelection={handleCopySelection}
            readClipboard={readClipboard}
            hasClipboard={hasClipboard}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 font-semibold">
            Vui lòng chọn hoặc tạo mới một sổ tay…
          </div>
        )}

        {/* Bảng viết tay Tiếng Việt -> khung chữ */}
        {inkInputTargetId && currentPage && (
          <InkInputPad
            targetPreview={
              currentPage.textElements.find(t => t.id === inkInputTargetId)?.text || ''
            }
            preContext={inkBaseTextRef.current}
            palmRejectionActive={palmRejectionActive}
            onLiveTextChange={handleLiveInkText}
            onCommitLine={handleCommitInkLine}
            onRecognitionUnavailable={handleInkUnavailable}
            onClose={() => setInkInputTargetId(null)}
          />
        )}

        {/* Thanh phát bản ghi âm đồng bộ nét vẽ */}
        {audioBarOpen && currentPage && (currentPage.audioNotes?.length ?? 0) > 0 && (
          <AudioPlayerBar
            notes={currentPage.audioNotes}
            seekRequest={seekRequest}
            seekMode={audioSeekMode}
            onToggleSeekMode={() => setAudioSeekMode(prev => !prev)}
            onDeleteNote={handleDeleteAudioNote}
            onPlaybackTimeChange={setPlaybackTime}
            onClose={() => {
              setAudioBarOpen(false);
              setAudioSeekMode(false);
              setPlaybackTime(null);
              setSeekRequest(null);
            }}
          />
        )}
      </main>

      {/* Tiến trình render PDF */}
      {pdfProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="chrome-bar chrome-bar-float rounded-2xl px-8 py-6 border animate-pop flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm font-bold text-slate-900">Đang chuyển trang PDF thành nền ghi chú…</p>
            <p className="text-xs text-slate-500">
              {pdfProgress.total > 0 ? `Trang ${pdfProgress.current} / ${pdfProgress.total}` : 'Đang đọc file…'}
            </p>
            {pdfProgress.total > 0 && (
              <div className="w-56 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(pdfProgress.current / pdfProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Thông báo */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] max-w-[min(560px,calc(100%-2rem))] px-4 py-3 rounded-2xl shadow-2xl animate-pop flex items-start gap-3 border ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/60 text-rose-100'
              : 'bg-slate-900/95 border-indigo-500/50 text-slate-100'
          }`}
        >
          {toast.type === 'error'
            ? <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
          <p className="text-xs font-semibold leading-relaxed">{toast.message}</p>
          <button
            onClick={() => setToast(null)}
            className="p-0.5 rounded text-current/60 hover:text-current transition shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sidebar Drawer */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        notebooks={notebooks}
        activeNotebookId={activeNotebookId}
        onSelectNotebook={(id) => {
          setActiveNotebookId(id);
          setCurrentPageIndex(0);
        }}
        onCreateNotebook={handleCreateNotebook}
        onDeleteNotebook={handleDeleteNotebook}
        currentPageIndex={currentPageIndex}
        onSelectPage={setCurrentPageIndex}
        onChangePageTemplate={handleChangePageTemplate}
        onAddPage={handleAddPage}
        onDeletePage={handleDeletePage}
        currentPaperSize={currentPage?.paperSize ?? DEFAULT_PAPER_SIZE}
        currentOrientation={currentPage?.orientation ?? DEFAULT_ORIENTATION}
        onChangePageSize={handleChangePageSize}
        onApplyPageSizeToNotebook={handleApplyPageSizeToNotebook}
        onCreateBackup={handleCreateBackup}
        onRestoreBackup={handleRestoreBackup}
        isBackupBusy={isBackingUp}
        lastBackupAt={lastBackupAt}
        onRenameNotebook={handleRenameNotebook}
        onChangeNotebookCategory={handleChangeNotebookCategory}
        onChangeNotebookCover={handleChangeNotebookCover}
        onRenamePage={handleRenamePage}
        onDuplicatePage={handleDuplicatePage}
        onReorderPages={handleReorderPages}
        onMovePageToNotebook={handleMovePageToNotebook}
        inkModelStatus={inkModelStatus}
        onDownloadInkModel={handleDownloadInkModel}
        onDeleteInkModel={handleDeleteInkModel}
        dueCardCount={dueCardCount}
        onOpenReview={() => setReviewOpen(true)}
        inkIndexStats={inkIndexStats}
        indexProgress={indexProgress}
        onStartIndexing={handleStartIndexing}
        onStopIndexing={handleStopIndexing}
      />

      {/* Thanh nổi khi trình chiếu */}
      {presentMode && (
        <div className="chrome-bar chrome-bar-float fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1.5 rounded-2xl border animate-pop">
          <button
            onClick={() => setCurrentPageIndex(prev => Math.max(0, prev - 1))}
            disabled={currentPageIndex === 0}
            className="chrome-btn w-9 h-9"
            title="Trang trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-bold text-slate-700 tabular-nums">
            {currentPageIndex + 1} / {activeNotebook?.pages.length || 1}
          </span>
          <button
            onClick={() =>
              setCurrentPageIndex(prev => Math.min((activeNotebook?.pages.length || 1) - 1, prev + 1))
            }
            disabled={currentPageIndex >= (activeNotebook?.pages.length || 1) - 1}
            className="chrome-btn w-9 h-9"
            title="Trang sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-200 mx-1" />

          <span className="flex items-center gap-1.5 px-2 text-[11px] font-bold text-rose-600">
            <MousePointer2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bút = laser</span>
          </span>

          <button
            onClick={() => setPresentMode(false)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 transition"
            title="Thoát trình chiếu (Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Thoát</span>
          </button>
        </div>
      )}

      {/* Bản đồ liên kết ghi chú */}
      <NoteGraphModal
        isOpen={graphOpen}
        notebooks={notebooks}
        onJump={handleJumpToSearchResult}
        onClose={() => setGraphOpen(false)}
      />

      {/* Thống kê thói quen */}
      <StatsModal isOpen={statsOpen} notebooks={notebooks} onClose={() => setStatsOpen(false)} />

      {/* Ôn tập thẻ */}
      <FlashcardReview
        isOpen={reviewOpen}
        cards={flashcards}
        onGrade={handleGradeFlashcard}
        onDelete={handleDeleteFlashcard}
        onJumpToSource={handleJumpToSearchResult}
        onClose={() => setReviewOpen(false)}
      />

      {/* Tìm kiếm toàn bộ sổ tay */}
      <SearchModal
        isOpen={searchOpen}
        notebooks={notebooks}
        onJump={handleJumpToSearchResult}
        onClose={() => setSearchOpen(false)}
      />

      {/* Flexible Export Options Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        notebook={activeNotebook}
        page={currentPage}
        currentPageIndex={currentPageIndex}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  );
};
