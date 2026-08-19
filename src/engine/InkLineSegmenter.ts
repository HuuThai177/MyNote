import { Stroke } from '../types/notebook';

export interface StrokeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  centerY: number;
}

export interface InkLine {
  strokes: Stroke[];
  bounds: { x: number; y: number; width: number; height: number };
}

/** Nét thấp hơn ngưỡng này so với chiều cao chữ điển hình được coi là dấu phụ */
const MARK_HEIGHT_RATIO = 0.45;
/** Khoảng cách dọc tối đa (so với chiều cao chữ) để hai nét thuộc cùng một dòng */
const SAME_LINE_TOLERANCE = 0.62;

/**
 * Tách các nét rời rạc trên một trang thành từng DÒNG chữ.
 *
 * Bắt buộc phải có bước này trước khi đánh chỉ mục: bộ nhận diện được thiết kế
 * cho một dòng chữ, ném cả trang vào nó chỉ ra kết quả vô nghĩa.
 *
 * Chỗ khó là dấu tiếng Việt. Dấu sắc, huyền, nặng… là những nét NHỎ nằm tách
 * hẳn phía trên hoặc dưới thân chữ, nếu gom nhóm thuần theo toạ độ dọc thì
 * chúng sẽ bị tách thành một "dòng" riêng và làm hỏng cả hai dòng. Vì vậy
 * thuật toán chia hai bước: dựng dòng từ các nét THÂN CHỮ trước, rồi mới gán
 * từng dấu về dòng phù hợp dựa trên vùng phủ ngang.
 */
export class InkLineSegmenter {
  static boundsOf(stroke: Stroke): StrokeBounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    stroke.points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });

    if (minX === Infinity) {
      return { x: 0, y: 0, width: 0, height: 0, centerY: 0 };
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      centerY: (minY + maxY) / 2
    };
  }

  private static median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /** Hai khoảng ngang có giao nhau không (đã nới thêm biên) */
  private static overlapsHorizontally(
    a: { x: number; width: number },
    b: { x: number; width: number },
    slack: number
  ): boolean {
    return a.x - slack < b.x + b.width && b.x - slack < a.x + a.width;
  }

  public static segment(strokes: Stroke[]): InkLine[] {
    if (strokes.length === 0) return [];

    const entries = strokes
      .map(stroke => ({ stroke, bounds: this.boundsOf(stroke) }))
      .filter(e => e.bounds.width > 0 || e.bounds.height > 0);

    if (entries.length === 0) return [];

    // Trung vị chống nhiễu tốt hơn trung bình: một nét gạch chân dài hoặc một
    // dấu chấm nhỏ không kéo lệch được ước lượng chiều cao chữ.
    const typicalHeight = Math.max(12, this.median(entries.map(e => e.bounds.height)));
    const markThreshold = typicalHeight * MARK_HEIGHT_RATIO;

    const bodies = entries.filter(e => e.bounds.height >= markThreshold);
    const marks = entries.filter(e => e.bounds.height < markThreshold);

    // Không có nét thân nào (cả trang chỉ toàn nét nhỏ) -> coi như một dòng
    if (bodies.length === 0) {
      return [this.buildLine(entries.map(e => e.stroke))];
    }

    // ---- Bước 1: dựng dòng từ các nét thân chữ ----
    const sorted = [...bodies].sort((a, b) => a.bounds.centerY - b.bounds.centerY);
    const bands: { top: number; bottom: number; entries: typeof bodies }[] = [];

    sorted.forEach(entry => {
      const tolerance = typicalHeight * SAME_LINE_TOLERANCE;
      const band = bands[bands.length - 1];

      const belongsToBand =
        band !== undefined &&
        entry.bounds.centerY <= band.bottom + tolerance &&
        entry.bounds.y <= band.bottom + tolerance;

      if (belongsToBand) {
        band.top = Math.min(band.top, entry.bounds.y);
        band.bottom = Math.max(band.bottom, entry.bounds.y + entry.bounds.height);
        band.entries.push(entry);
      } else {
        bands.push({
          top: entry.bounds.y,
          bottom: entry.bounds.y + entry.bounds.height,
          entries: [entry]
        });
      }
    });

    // ---- Bước 2: gán dấu phụ về dòng gần nhất có phủ ngang ----
    marks.forEach(mark => {
      let best = -1;
      let bestDistance = Infinity;

      bands.forEach((band, index) => {
        const bandBox = this.bandBox(band.entries);
        const overlaps = this.overlapsHorizontally(mark.bounds, bandBox, typicalHeight * 0.5);
        if (!overlaps) return;

        // Khoảng cách dọc từ dấu tới dải chữ
        const distance =
          mark.bounds.centerY < band.top
            ? band.top - mark.bounds.centerY
            : mark.bounds.centerY > band.bottom
              ? mark.bounds.centerY - band.bottom
              : 0;

        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });

      // Dấu quá xa mọi dòng (nhiều khả năng là nét trang trí) -> bỏ qua nhóm
      // theo phủ ngang, gán về dòng gần nhất theo chiều dọc
      if (best < 0) {
        bands.forEach((band, index) => {
          const distance = Math.min(
            Math.abs(mark.bounds.centerY - band.top),
            Math.abs(mark.bounds.centerY - band.bottom)
          );
          if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
          }
        });
      }

      if (best >= 0) bands[best].entries.push(mark);
    });

    // ---- Bước 3: trong mỗi dòng sắp nét theo thứ tự viết từ trái sang phải ----
    return bands
      .map(band => {
        const ordered = [...band.entries].sort((a, b) => a.bounds.x - b.bounds.x);
        return this.buildLine(ordered.map(e => e.stroke));
      })
      .sort((a, b) => a.bounds.y - b.bounds.y);
  }

  private static bandBox(entries: { bounds: StrokeBounds }[]) {
    let minX = Infinity;
    let maxX = -Infinity;
    entries.forEach(e => {
      minX = Math.min(minX, e.bounds.x);
      maxX = Math.max(maxX, e.bounds.x + e.bounds.width);
    });
    return { x: minX, width: maxX - minX };
  }

  private static buildLine(strokes: Stroke[]): InkLine {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    strokes.forEach(stroke => {
      const b = this.boundsOf(stroke);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    });

    return {
      strokes,
      bounds: {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY)
      }
    };
  }
}
