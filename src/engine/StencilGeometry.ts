export type StencilTool = 'none' | 'ruler' | 'circle' | 'protractor' | 'isometric';

export interface Vec {
  x: number;
  y: number;
}

/** Khoảng cách tối đa để nét bút bị hút vào khuôn */
export const STENCIL_SNAP_DISTANCE = 46;

/** Ba trục của lưới đẳng cự: hai đường 30° và một đường dọc */
export const ISOMETRIC_ANGLES = [30, 90, 150];

/**
 * Hình học cho bộ khuôn vẽ.
 *
 * Mỗi hàm nhận điểm bút thô và trả về điểm đã hút vào khuôn, hoặc null khi
 * điểm nằm ngoài tầm hút — lúc đó nét vẽ tự do như bình thường. Tách riêng
 * khỏi phần giao diện để kiểm chứng được bằng test thuần tuý.
 */
export class StencilGeometry {
  /** Hút vào đường tròn: dùng cho khuôn tròn và vành thước đo góc */
  static snapToCircle(
    point: Vec,
    center: Vec,
    radius: number,
    tolerance = STENCIL_SNAP_DISTANCE
  ): Vec | null {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.hypot(dx, dy);

    // Ngay tại tâm thì không xác định được hướng chiếu
    if (distance < 0.001) return null;
    if (Math.abs(distance - radius) > tolerance) return null;

    const scale = radius / distance;
    return { x: center.x + dx * scale, y: center.y + dy * scale };
  }

  /**
   * Hút vào nửa trên của vành thước đo góc.
   * Thước đo góc là nửa đường tròn, phần dưới đáy không có vành để bám.
   */
  static snapToProtractor(
    point: Vec,
    center: Vec,
    radius: number,
    baseAngle: number,
    tolerance = STENCIL_SNAP_DISTANCE
  ): Vec | null {
    const onCircle = this.snapToCircle(point, center, radius, tolerance);
    if (!onCircle) return null;

    // Góc của điểm so với cạnh đáy thước; chỉ nhận nửa trên (0..180)
    const raw = (Math.atan2(onCircle.y - center.y, onCircle.x - center.x) * 180) / Math.PI;
    const relative = this.normalizeDegrees(raw - baseAngle);
    if (relative > 180) return null;

    return onCircle;
  }

  /**
   * Hút hướng nét về trục gần nhất trong danh sách góc cho trước.
   * Dùng cho lưới đẳng cự: mọi nét đều đi theo 30°, 90° hoặc 150°.
   */
  static snapToAxes(start: Vec, point: Vec, angles: number[]): Vec {
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return point;

    const pointAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

    let bestAngle = angles[0];
    let bestDelta = Infinity;

    // Mỗi trục có hai chiều nên phải xét cả góc đối
    angles.forEach(angle => {
      [angle, angle + 180].forEach(candidate => {
        const delta = Math.abs(this.signedAngleDelta(pointAngle, candidate));
        if (delta < bestDelta) {
          bestDelta = delta;
          bestAngle = candidate;
        }
      });
    });

    const radians = (bestAngle * Math.PI) / 180;
    return {
      x: start.x + Math.cos(radians) * length,
      y: start.y + Math.sin(radians) * length
    };
  }

  /** Góc đọc được trên thước đo góc cho một điểm bất kỳ */
  static measureAngle(center: Vec, point: Vec, baseAngle: number): number {
    const raw = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
    return Math.round(this.normalizeDegrees(raw - baseAngle));
  }

  static normalizeDegrees(value: number): number {
    return ((value % 360) + 360) % 360;
  }

  /** Chênh lệch góc trong khoảng -180..180 */
  static signedAngleDelta(from: number, to: number): number {
    const delta = this.normalizeDegrees(to - from);
    return delta > 180 ? delta - 360 : delta;
  }
}
