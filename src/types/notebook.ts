export type ToolType = 'pen' | 'highlighter' | 'eraser-stroke' | 'eraser-pixel' | 'lasso' | 'text' | 'shape';

export type PaperTemplate = 'ruled' | 'grid' | 'dot' | 'blank' | 'cornell' | 'dark-neon';

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
  originalStrokeIds?: string[];
}

export interface ImageElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  src: string;
}

export interface AudioNote {
  id: string;
  url: string;
  duration: number; // in seconds
  createdAt: number;
}

export interface NotebookPage {
  id: string;
  pageIndex: number;
  template: PaperTemplate;
  pdfPageNumber?: number;
  pdfDataUrl?: string; // Cache rendered PDF image
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
