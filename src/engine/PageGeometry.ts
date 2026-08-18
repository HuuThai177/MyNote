import {
  NotebookPage,
  PaperOrientation,
  PaperSizeId,
  PaperSizeSpec,
  PAPER_SIZES,
  DEFAULT_PAPER_SIZE,
  DEFAULT_ORIENTATION,
  Point
} from '../types/notebook';

export interface PageDimensions {
  width: number;
  height: number;
  isInfinite: boolean;
}

/** Khoảng trống chừa thêm dưới nội dung cuối cùng của giấy cuộn vô hạn */
const INFINITE_TAIL = 500;
/** Làm tròn chiều cao giấy vô hạn theo bậc này để tránh layout nhảy liên tục */
const INFINITE_STEP = 300;

export const getPaperSpec = (id: PaperSizeId | undefined): PaperSizeSpec =>
  PAPER_SIZES.find(s => s.id === id) ?? PAPER_SIZES.find(s => s.id === DEFAULT_PAPER_SIZE)!;

/** Toạ độ nội dung xa nhất trên trang (dùng cho giấy vô hạn & xuất file) */
export const measureContentExtent = (page: NotebookPage) => {
  let maxX = 0;
  let maxY = 0;

  (page.strokes || []).forEach(s =>
    s.points.forEach((p: Point) => {
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    })
  );
  (page.textElements || []).forEach(t => {
    maxX = Math.max(maxX, t.x + t.width);
    maxY = Math.max(maxY, t.y + t.height);
  });
  (page.imageElements || []).forEach(i => {
    maxX = Math.max(maxX, i.x + i.width);
    maxY = Math.max(maxY, i.y + i.height);
  });

  return { maxX, maxY };
};

/**
 * Kích thước logic của trang giấy, độc lập hoàn toàn với mức zoom và
 * kích thước cửa sổ. Mọi toạ độ nét vẽ đều nằm trong hệ này.
 */
export const getPageDimensions = (page: NotebookPage): PageDimensions => {
  // Trang import từ PDF giữ đúng tỉ lệ file gốc
  if (page.paperSize === 'custom' && page.pageWidth && page.pageHeight) {
    return { width: page.pageWidth, height: page.pageHeight, isInfinite: false };
  }

  const spec = getPaperSpec(page.paperSize);

  if (spec.id === 'infinite') {
    const { maxY } = measureContentExtent(page);
    const needed = maxY + INFINITE_TAIL;
    const height = Math.max(spec.height, Math.ceil(needed / INFINITE_STEP) * INFINITE_STEP);
    return { width: spec.width, height, isInfinite: true };
  }

  const orientation: PaperOrientation = spec.supportsOrientation
    ? (page.orientation ?? DEFAULT_ORIENTATION)
    : 'portrait';

  return orientation === 'landscape'
    ? { width: spec.height, height: spec.width, isInfinite: false }
    : { width: spec.width, height: spec.height, isInfinite: false };
};

/** Nhãn ngắn hiển thị trên header, ví dụ "A4 · Dọc" */
export const getPageSizeLabel = (page: NotebookPage | null): string => {
  if (!page) return '—';

  if (page.paperSize === 'custom') {
    const dims = getPageDimensions(page);
    return `PDF · ${Math.round(dims.width)}×${Math.round(dims.height)}`;
  }

  const spec = getPaperSpec(page.paperSize);
  const shortName = spec.name.split(' (')[0];

  if (!spec.supportsOrientation) return shortName;
  return `${shortName} · ${(page.orientation ?? DEFAULT_ORIENTATION) === 'landscape' ? 'Ngang' : 'Dọc'}`;
};

/**
 * Suy ra khổ giấy cho dữ liệu tạo bởi bản cũ (toạ độ khi đó bám theo viewport).
 * Chọn khổ nhỏ nhất vẫn chứa hết nội dung để không cắt mất nét đã vẽ.
 */
export const inferLegacyPaperSize = (
  page: NotebookPage
): { paperSize: PaperSizeId; orientation: PaperOrientation } => {
  const { maxX, maxY } = measureContentExtent(page);

  if (maxX === 0 && maxY === 0) {
    return { paperSize: DEFAULT_PAPER_SIZE, orientation: DEFAULT_ORIENTATION };
  }

  const candidates: { paperSize: PaperSizeId; orientation: PaperOrientation }[] = [
    { paperSize: 'a4', orientation: 'portrait' },
    { paperSize: 'a4', orientation: 'landscape' },
    { paperSize: 'tablet', orientation: 'landscape' }
  ];

  for (const candidate of candidates) {
    const dims = getPageDimensions({ ...page, ...candidate });
    if (maxX <= dims.width && maxY <= dims.height) return candidate;
  }

  // Nội dung tràn khỏi mọi khổ cố định: dùng giấy cuộn để không mất gì
  return { paperSize: 'infinite', orientation: 'portrait' };
};

export const clampZoom = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, parseFloat(value.toFixed(3))));
