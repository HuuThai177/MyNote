import { Point, Stroke } from '../types/notebook';

export type DetectedShapeType =
  | 'line'
  | 'circle'
  | 'ellipse'
  | 'rectangle'
  | 'triangle'
  | 'polygon';

export interface SmoothedShapeResult {
  type: DetectedShapeType;
  label: string;
  smoothedPoints: Point[];
}

const SHAPE_LABELS: Record<DetectedShapeType, string> = {
  line: 'Đường thẳng',
  circle: 'Hình tròn',
  ellipse: 'Hình bầu dục',
  rectangle: 'Hình chữ nhật',
  triangle: 'Hình tam giác',
  polygon: 'Đa giác'
};

/**
 * Nắn nét vẽ tay thành hình học chuẩn.
 *
 * Bản trước chỉ nhận ra đường thẳng, hình tròn và hình chữ nhật — tam giác và
 * đa giác hoàn toàn không có, dù kiểu dữ liệu có khai. Bản này đếm đỉnh thật
 * bằng thuật toán Ramer–Douglas–Peucker rồi phân loại theo số đỉnh, nên tam
 * giác, ngũ giác… đều ra đúng.
 */
export class ShapeSmoother {
  public static detectAndSmooth(stroke: Stroke): SmoothedShapeResult | null {
    const pts = stroke.points;
    if (pts.length < 8) return null;

    const start = pts[0];
    const end = pts[pts.length - 1];
    const gapStartEnd = Math.hypot(end.x - start.x, end.y - start.y);

    let pathLength = 0;
    for (let i = 1; i < pts.length; i++) {
      pathLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    if (pathLength < 60) return null; // Nét quá ngắn, có thể chỉ là dấu chấm

    const bounds = this.getBounds(pts);
    const diagonal = Math.hypot(bounds.width, bounds.height);

    // ---- 1. ĐƯỜNG THẲNG: đi gần như trực tiếp từ đầu tới cuối ----
    if (gapStartEnd > 40 && pathLength / gapStartEnd < 1.18) {
      return { type: 'line', label: SHAPE_LABELS.line, smoothedPoints: this.buildLine(start, end) };
    }

    // ---- 2. HÌNH KÍN: điểm cuối quay về gần điểm đầu ----
    const isClosed = gapStartEnd < Math.max(40, diagonal * 0.28);
    if (!isClosed) return null;

    // Rút gọn nét thành các đỉnh thật. Ngưỡng tỉ lệ theo kích thước hình để
    // hình nhỏ không bị gộp mất đỉnh, hình lớn không sinh đỉnh thừa.
    const tolerance = Math.max(6, diagonal * 0.055);
    const corners = this.cornersOf(pts, tolerance);

    /**
     * ĐA GIÁC HAY ĐƯỜNG CONG?
     *
     * Không thể chỉ dựa vào "độ tròn": ngũ giác đều cũng có các đỉnh gần như
     * cách đều tâm nên đạt điểm tròn rất cao. Dấu hiệu phân biệt thật nằm ở
     * CẠNH — đa giác có cạnh thẳng, đường tròn thì không.
     *
     * Cách đo: rút gọn lại lần nữa với ngưỡng chặt hơn nhiều. Cạnh thẳng thì số
     * đỉnh gần như không đổi; còn đường cong sẽ sinh ra thêm rất nhiều đỉnh.
     */
    const tightCorners = this.cornersOf(pts, tolerance * 0.3);
    const hasStraightEdges = tightCorners.length <= corners.length + 2;

    // ---- 3. TAM GIÁC ----
    if (corners.length === 3 && hasStraightEdges) {
      return {
        type: 'triangle',
        label: SHAPE_LABELS.triangle,
        smoothedPoints: this.buildPolygon(corners)
      };
    }

    // ---- 4. HÌNH CHỮ NHẬT / VUÔNG ----
    if (corners.length === 4 && hasStraightEdges) {
      return {
        type: 'rectangle',
        label: SHAPE_LABELS.rectangle,
        smoothedPoints: this.buildRectangle(bounds)
      };
    }

    // ---- 5. ĐA GIÁC khác (ngũ giác, lục giác…) ----
    if (corners.length >= 5 && corners.length <= 10 && hasStraightEdges) {
      return {
        type: 'polygon',
        label: `${SHAPE_LABELS.polygon} ${corners.length} cạnh`,
        smoothedPoints: this.buildPolygon(corners)
      };
    }

    // ---- 6. TRÒN / BẦU DỤC ----
    if (this.measureRoundness(pts, bounds) > 0.82) {
      const aspect = bounds.width / Math.max(1, bounds.height);
      const isCircle = aspect > 0.82 && aspect < 1.22;
      return {
        type: isCircle ? 'circle' : 'ellipse',
        label: isCircle ? SHAPE_LABELS.circle : SHAPE_LABELS.ellipse,
        smoothedPoints: this.buildEllipse(bounds, isCircle)
      };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Dựng hình
  // ---------------------------------------------------------------------------
  private static buildLine(start: Point, end: Point): Point[] {
    let endX = end.x;
    let endY = end.y;

    // Nắn về ngang / dọc khi đã gần đúng (lệch dưới ~8°)
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    if (dy < dx * 0.14) endY = start.y;
    else if (dx < dy * 0.14) endX = start.x;

    const pressure = ((start.pressure || 0.7) + (end.pressure || 0.7)) / 2;
    return [
      { ...start },
      { x: endX, y: endY, pressure, time: end.time }
    ];
  }

  private static buildPolygon(corners: Point[]): Point[] {
    const pressure = 0.8;
    const now = Date.now();
    const closed = [...corners, corners[0]];

    // Chia nhỏ từng cạnh để nét vẽ ra vẫn mượt khi phóng to
    const output: Point[] = [];
    for (let i = 0; i < closed.length - 1; i++) {
      const a = closed[i];
      const b = closed[i + 1];
      const steps = 10;
      for (let s = 0; s < steps; s++) {
        output.push({
          x: a.x + ((b.x - a.x) * s) / steps,
          y: a.y + ((b.y - a.y) * s) / steps,
          pressure,
          time: now + output.length
        });
      }
    }
    output.push({ x: closed[0].x, y: closed[0].y, pressure, time: now + output.length });
    return output;
  }

  private static buildRectangle(b: { x: number; y: number; width: number; height: number }): Point[] {
    return this.buildPolygon([
      { x: b.x, y: b.y, pressure: 0.8, time: 0 },
      { x: b.x + b.width, y: b.y, pressure: 0.8, time: 0 },
      { x: b.x + b.width, y: b.y + b.height, pressure: 0.8, time: 0 },
      { x: b.x, y: b.y + b.height, pressure: 0.8, time: 0 }
    ]);
  }

  private static buildEllipse(
    b: { x: number; y: number; width: number; height: number },
    forceCircle: boolean
  ): Point[] {
    const centerX = b.x + b.width / 2;
    const centerY = b.y + b.height / 2;
    const radius = (b.width + b.height) / 4;
    const radiusX = forceCircle ? radius : b.width / 2;
    const radiusY = forceCircle ? radius : b.height / 2;

    const points: Point[] = [];
    const segments = 48;
    const now = Date.now();

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push({
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY,
        pressure: 0.8,
        time: now + i
      });
    }
    return points;
  }

  // ---------------------------------------------------------------------------
  // Phân tích
  // ---------------------------------------------------------------------------
  private static getBounds(pts: Point[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Mức độ "tròn": 1 nghĩa là mọi điểm cách tâm đúng bằng nhau (sau khi chuẩn
   * hoá theo tỉ lệ khung bao, nên hình bầu dục cũng cho điểm cao).
   */
  private static measureRoundness(
    pts: Point[],
    b: { x: number; y: number; width: number; height: number }
  ): number {
    const centerX = b.x + b.width / 2;
    const centerY = b.y + b.height / 2;
    const radiusX = Math.max(1, b.width / 2);
    const radiusY = Math.max(1, b.height / 2);

    // Chuẩn hoá về hình tròn đơn vị rồi đo độ lệch bán kính
    const radii = pts.map(p =>
      Math.hypot((p.x - centerX) / radiusX, (p.y - centerY) / radiusY)
    );

    const mean = radii.reduce((sum, r) => sum + r, 0) / radii.length;
    if (mean === 0) return 0;

    const variance = radii.reduce((sum, r) => sum + (r - mean) ** 2, 0) / radii.length;
    return Math.max(0, 1 - Math.sqrt(variance) / mean);
  }

  /** Các đỉnh của hình kín ở một ngưỡng rút gọn cho trước (đã bỏ điểm khép vòng) */
  private static cornersOf(pts: Point[], tolerance: number): Point[] {
    const simplified = this.simplify(pts, tolerance);
    if (simplified.length < 2) return simplified;

    const first = simplified[0];
    const last = simplified[simplified.length - 1];
    return Math.hypot(last.x - first.x, last.y - first.y) < tolerance
      ? simplified.slice(0, -1)
      : simplified;
  }

  /** Ramer–Douglas–Peucker: giữ lại những điểm thực sự là đỉnh */
  private static simplify(pts: Point[], tolerance: number): Point[] {
    if (pts.length < 3) return pts;

    const first = 0;
    const last = pts.length - 1;
    let maxDistance = 0;
    let index = 0;

    for (let i = first + 1; i < last; i++) {
      const distance = this.perpendicularDistance(pts[i], pts[first], pts[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }

    if (maxDistance <= tolerance) return [pts[first], pts[last]];

    const left = this.simplify(pts.slice(first, index + 1), tolerance);
    const right = this.simplify(pts.slice(index, last + 1), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  private static perpendicularDistance(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);

    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
}
