import { Point, Stroke } from '../types/notebook';

export type DetectedShapeType = 'line' | 'circle' | 'rectangle' | 'triangle' | 'arrow';

export interface SmoothedShapeResult {
  type: DetectedShapeType;
  smoothedPoints: Point[];
}

export class ShapeSmoother {
  /**
   * Analyzes raw stroke points and detects if it matches a geometric shape
   */
  public static detectAndSmooth(stroke: Stroke): SmoothedShapeResult | null {
    const pts = stroke.points;
    if (pts.length < 5) return null;

    const start = pts[0];
    const end = pts[pts.length - 1];
    const distStartEnd = Math.hypot(end.x - start.x, end.y - start.y);

    let totalPathLength = 0;
    for (let i = 1; i < pts.length; i++) {
      totalPathLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }

    // 1. Straight Line Check: start and end are far apart and path length is close to straight distance
    if (distStartEnd > 40 && totalPathLength / distStartEnd < 1.2) {
      let finalEndX = end.x;
      let finalEndY = end.y;

      // Smart ruler snapping: snap to horizontal or vertical if angle is close (< 8 degrees)
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);
      if (dy < dx * 0.14) {
        // Snap to horizontal
        finalEndY = start.y;
      } else if (dx < dy * 0.14) {
        // Snap to vertical
        finalEndX = start.x;
      }

      return {
        type: 'line',
        smoothedPoints: [
          start,
          { x: finalEndX, y: finalEndY, pressure: (start.pressure + end.pressure) / 2, time: end.time }
        ]
      };
    }

    // 2. Closed Loop Check: start and end are close together
    const isClosed = distStartEnd < Math.max(35, totalPathLength * 0.2);

    if (isClosed) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      pts.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });

      const width = maxX - minX;
      const height = maxY - minY;
      const aspectRatio = width / Math.max(1, height);

      // Check Circle vs Rectangle
      if (aspectRatio > 0.65 && aspectRatio < 1.5) {
        // Perfect Circle
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const radius = (width + height) / 4;
        const circlePoints: Point[] = [];
        const numSegments = 32;

        for (let i = 0; i <= numSegments; i++) {
          const angle = (i / numSegments) * Math.PI * 2;
          circlePoints.push({
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
            pressure: 0.8,
            time: Date.now() + i
          });
        }

        return {
          type: 'circle',
          smoothedPoints: circlePoints
        };
      } else {
        // Smooth Rectangle
        const rectPoints: Point[] = [
          { x: minX, y: minY, pressure: 0.8, time: Date.now() },
          { x: maxX, y: minY, pressure: 0.8, time: Date.now() + 10 },
          { x: maxX, y: maxY, pressure: 0.8, time: Date.now() + 20 },
          { x: minX, y: maxY, pressure: 0.8, time: Date.now() + 30 },
          { x: minX, y: minY, pressure: 0.8, time: Date.now() + 40 },
        ];
        return {
          type: 'rectangle',
          smoothedPoints: rectPoints
        };
      }
    }

    return null;
  }
}
