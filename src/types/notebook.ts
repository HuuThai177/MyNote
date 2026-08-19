// 'eraser-pixel' và 'shape' đã bị bỏ: không có nút nào chọn được và không có
// nhánh xử lý nào trong CanvasArea, nên chúng là giá trị chết.
export type ToolType = 'pen' | 'highlighter' | 'eraser-stroke' | 'lasso' | 'text';

export type PaperTemplate = 'ruled' | 'grid' | 'dot' | 'blank' | 'cornell' | 'dark-neon';

/** Khổ giấy. 'custom' dùng cho trang import từ PDF (giữ đúng tỉ lệ file gốc). */
export type PaperSizeId = 'a4' | 'a5' | 'letter' | 'square' | 'tablet' | 'infinite' | 'custom';

export type PaperOrientation = 'portrait' | 'landscape';

export interface PaperSizeSpec {
  id: PaperSizeId;
  name: string;
  description: string;
  /** Kích thước ở hướng dọc, đơn vị px @96dpi (A4 = 210mm × 297mm) */
  width: number;
  height: number;
  supportsOrientation: boolean;
}

export const PAPER_SIZES: PaperSizeSpec[] = [
  {
    id: 'a4',
    name: 'A4 (210 × 297 mm)',
    description: 'Khổ chuẩn để in và nộp bài',
    width: 794,
    height: 1123,
    supportsOrientation: true
  },
  {
    id: 'a5',
    name: 'A5 (148 × 210 mm)',
    description: 'Sổ tay nhỏ, ghi chú nhanh',
    width: 559,
    height: 794,
    supportsOrientation: true
  },
  {
    id: 'letter',
    name: 'Letter (8.5 × 11 in)',
    description: 'Khổ giấy chuẩn Mỹ',
    width: 816,
    height: 1056,
    supportsOrientation: true
  },
  {
    id: 'square',
    name: 'Vuông (1:1)',
    description: 'Sơ đồ tư duy, phác thảo',
    width: 900,
    height: 900,
    supportsOrientation: false
  },
  {
    id: 'tablet',
    name: 'Màn hình Tablet (16:10)',
    description: 'Vừa khít màn hình Xiaomi Pad',
    width: 800,
    height: 1280,
    supportsOrientation: true
  },
  {
    id: 'infinite',
    name: 'Giấy Cuộn Vô Hạn',
    description: 'Tự dài thêm khi bạn viết tới cuối trang',
    width: 794,
    height: 1123,
    supportsOrientation: false
  }
];


/** Màu bìa sổ tay (chuỗi gradient của Tailwind) */
export interface CoverColorOption {
  id: string;
  name: string;
  gradient: string;
}

export const COVER_COLORS: CoverColorOption[] = [
  { id: 'indigo', name: 'Chàm', gradient: 'from-indigo-600 to-blue-700' },
  { id: 'emerald', name: 'Ngọc lục', gradient: 'from-emerald-600 to-teal-700' },
  { id: 'purple', name: 'Tím', gradient: 'from-purple-600 to-pink-700' },
  { id: 'amber', name: 'Hổ phách', gradient: 'from-amber-500 to-orange-600' },
  { id: 'rose', name: 'Hồng đào', gradient: 'from-rose-500 to-red-600' },
  { id: 'sky', name: 'Xanh trời', gradient: 'from-sky-500 to-cyan-600' },
  { id: 'slate', name: 'Xám khói', gradient: 'from-slate-600 to-slate-800' },
  { id: 'lime', name: 'Xanh cốm', gradient: 'from-lime-500 to-green-600' }
];

export const NOTEBOOK_CATEGORIES = [
  'Học Tập',
  'Công Việc',
  'Thiết Kế',
  'Lập Kế Hoạch',
  'Cá Nhân',
  'Tài Liệu'
];

export const DEFAULT_PAPER_SIZE: PaperSizeId = 'a4';
export const DEFAULT_ORIENTATION: PaperOrientation = 'portrait';

/** Giới hạn zoom của trang giấy */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export interface Point {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

export interface Stroke {
  id: string;
  tool: ToolType;
  color: string;
  size: number;
  opacity: number;
  points: Point[];
  audioTimestamp?: number; // Time offset in seconds from audio recording start
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontFamily: string; // 'Caveat', 'Dancing Script', 'Patrick Hand', 'Comfortaa', etc.
  fontSize: number;
  color: string;
  /** Canh lề nội dung trong khung; mặc định 'left' khi thiếu */
  textAlign?: TextAlign;
  originalStrokeIds?: string[];
}

export interface ImageElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /**
   * URL dùng để hiển thị trong phiên hiện tại (Object URL).
   * KHÔNG được lưu xuống IndexedDB — nó vô nghĩa ở phiên sau.
   */
  src: string;
  /** Khoá tới Blob trong store `assets`; đây mới là thứ được lưu bền */
  assetId?: string;
}

export interface AudioNote {
  id: string;
  title?: string;
  /** Object URL của phiên hiện tại — không lưu xuống IndexedDB */
  url?: string;
  /** Khoá tới Blob âm thanh trong store `assets` */
  assetId?: string;
  duration: number; // in seconds
  createdAt: number;
}

/** Chữ viết tay của một trang sau khi đã nhận diện, phục vụ tìm kiếm */
export interface InkIndex {
  /** Toàn bộ chữ đọc được, mỗi dòng viết tay là một dòng text */
  text: string;
  /** Dấu vân của tập nét lúc đánh chỉ mục — khác đi nghĩa là chỉ mục đã cũ */
  signature: string;
  indexedAt: number;
  lineCount: number;
}

export interface NotebookPage {
  id: string;
  pageIndex: number;
  template: PaperTemplate;
  /** Khổ giấy; mặc định 'a4' khi thiếu (dữ liệu bản cũ) */
  paperSize?: PaperSizeId;
  orientation?: PaperOrientation;
  /** Chỉ dùng khi paperSize === 'custom' (trang PDF) */
  pageWidth?: number;
  pageHeight?: number;
  pdfPageNumber?: number;
  /** Object URL ảnh nền PDF của phiên hiện tại — không lưu xuống IndexedDB */
  pdfDataUrl?: string;
  /** Khoá tới Blob ảnh nền PDF trong store `assets` */
  pdfAssetId?: string;
  pdfSourceName?: string;
  /** Kết quả nhận diện chữ viết tay để tìm kiếm; không ảnh hưởng hiển thị */
  inkIndex?: InkIndex;
  strokes: Stroke[];
  textElements: TextElement[];
  imageElements: ImageElement[];
  audioNotes: AudioNote[];
}

export interface Notebook {
  id: string;
  title: string;
  category: string;
  coverColor: string;
  createdAt: number;
  updatedAt: number;
  /** Khổ giấy mặc định khi thêm trang mới vào sổ tay này */
  defaultPaperSize?: PaperSizeId;
  defaultOrientation?: PaperOrientation;
  pdfFileName?: string;
  pdfFileUrl?: string;
  pages: NotebookPage[];
}

export interface FontOption {
  name: string;
  family: string;
  previewText: string;
}

export const VIETNAMESE_HANDWRITING_FONTS: FontOption[] = [
  { name: 'Caveat (Nét bút dạ)', family: "'Caveat', cursive", previewText: 'Chữ viết tay tự nhiên' },
  { name: 'Dancing Script (Nét mềm mại)', family: "'Dancing Script', cursive", previewText: 'Ghi chú nghệ thuật' },
  { name: 'Patrick Hand (Bút chì học sinh)', family: "'Patrick Hand', cursive", previewText: 'Lập kế hoạch hàng ngày' },
  { name: 'Playpen Sans (Nét nghiêng hiện đại)', family: "'Playpen Sans', cursive", previewText: 'Sổ tay công việc' },
  { name: 'Comfortaa (Chữ tròn gọn)', family: "'Comfortaa', sans-serif", previewText: 'Văn bản tối giản' },
];
