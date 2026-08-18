import { NotebookPage, Point, Stroke, ToolType } from '../types/notebook';

const TEMPLATE_BACKGROUND: Record<string, string> = {
  ruled: '#fcfcfe',
  grid: '#fdfdfd',
  dot: '#f8fafc',
  blank: '#ffffff',
  cornell: '#fafafa',
  'dark-neon': '#0b0f19'
};

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/**
 * Làm phẳng toàn bộ nội dung một trang (nền PDF, ảnh, nét mực, khung chữ)
 * thành MỘT canvas duy nhất.
 *
 * Cần thiết vì khung chữ và ảnh là phần tử DOM nằm ngoài canvas vẽ; nếu chỉ
 * gọi canvas.toDataURL() như trước thì ảnh và chữ sẽ biến mất khỏi file xuất ra.
 */
export class PageRenderer {
  /**
   * @param scale <1 để dựng ảnh thu nhỏ (thumbnail) mà vẫn dùng chung đúng
   *              đường vẽ với bản xuất đầy đủ, khỏi lệch giữa xem trước và
   *              file thật.
   */
  public static async renderPage(
    page: NotebookPage,
    baseWidth: number,
    baseHeight: number,
    scale: number = 1
  ): Promise<HTMLCanvasElement> {
    // Xuất đúng khổ giấy: nội dung tràn ra ngoài trang bị cắt giống như trên
    // màn hình, để file xuất ra khớp với những gì người dùng nhìn thấy.
    const width = Math.ceil(baseWidth);
    const height = Math.ceil(baseHeight);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không khởi tạo được canvas để xuất trang');

    // Mọi lệnh vẽ bên dưới vẫn dùng toạ độ TRANG; scale chỉ đổi độ phân giải
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Chờ font chữ tay tải xong, nếu không fillText sẽ dùng font mặc định
    try {
      await document.fonts.ready;
    } catch {
      /* bỏ qua */
    }

    // 1. Nền giấy
    ctx.fillStyle = TEMPLATE_BACKGROUND[page.template] ?? '#ffffff';
    ctx.fillRect(0, 0, width, height);
    this.drawTemplatePattern(ctx, page.template, width, height);

    // 2. Nền PDF (giữ tỉ lệ như object-contain trên giao diện)
    if (page.pdfDataUrl) {
      const pdfImage = await loadImage(page.pdfDataUrl);
      if (pdfImage) {
        const scale = Math.min(width / pdfImage.width, height / pdfImage.height);
        const drawWidth = pdfImage.width * scale;
        const drawHeight = pdfImage.height * scale;
        ctx.drawImage(pdfImage, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      }
    }

    // 3. Ảnh chèn (dưới lớp mực, đúng như khi hiển thị)
    for (const element of page.imageElements || []) {
      const image = await loadImage(element.src);
      if (!image) continue;

      ctx.save();
      if (element.rotation) {
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((element.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      ctx.drawImage(image, element.x, element.y, element.width, element.height);
      ctx.restore();
    }

    // 4. Nét mực
    (page.strokes || []).forEach(stroke => this.drawStroke(ctx, stroke));

    // 5. Khung chữ
    (page.textElements || []).forEach(element => {
      ctx.save();
      ctx.fillStyle = element.color || '#1F2937';
      ctx.font = `${element.fontSize}px ${element.fontFamily}`;
      ctx.textBaseline = 'top';

      const lineHeight = element.fontSize * 1.28;
      let cursorY = element.y + 8;

      element.text.split('\n').forEach(paragraph => {
        this.wrapLine(ctx, paragraph, element.width - 12).forEach(line => {
          ctx.fillText(line, element.x + 8, cursorY);
          cursorY += lineHeight;
        });
      });

      ctx.restore();
    });

    return canvas;
  }

  private static measureContentBounds(page: NotebookPage) {
    let maxX = 0;
    let maxY = 0;

    (page.strokes || []).forEach(s =>
      s.points.forEach((p: Point) => {
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
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
  }

  private static drawTemplatePattern(
    ctx: CanvasRenderingContext2D,
    template: string,
    width: number,
    height: number
  ) {
    ctx.save();

    if (template === 'ruled' || template === 'cornell') {
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      const step = template === 'cornell' ? 30 : 32;
      for (let y = step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }
      if (template === 'cornell') {
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(160, 0);
        ctx.lineTo(160, height);
        ctx.stroke();
      }
    } else if (template === 'grid' || template === 'dark-neon') {
      ctx.strokeStyle = template === 'grid' ? '#cbd5e1' : 'rgba(30, 41, 59, 0.6)';
      ctx.lineWidth = 1;
      const step = template === 'grid' ? 28 : 32;
      for (let y = step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }
      for (let x = step; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
      }
    } else if (template === 'dot') {
      ctx.fillStyle = '#64748b';
      for (let y = 24; y < height; y += 24) {
        for (let x = 24; x < width; x += 24) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  /** Cùng thuật toán vẽ với CanvasArea để file xuất ra trông giống trên màn hình */
  private static drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    const pts = stroke.points;
    if (!pts || pts.length < 1) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;

    const tool: ToolType = stroke.tool;

    if (tool === 'highlighter') {
      ctx.globalAlpha = 0.4;
      ctx.globalCompositeOperation = 'multiply';
      ctx.lineWidth = stroke.size * 2.5;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    } else if (pts.length === 1) {
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, (pts[0].pressure || 0.5) * stroke.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 1; i < pts.length; i++) {
        const p1 = pts[i - 1];
        const p2 = pts[i];
        const avgPressure = ((p1.pressure || 0.5) + (p2.pressure || 0.5)) / 2;
        ctx.lineWidth = Math.max(1, stroke.size * avgPressure * 1.5);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private static wrapLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    if (text.length === 0) return [''];

    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';

    words.forEach(word => {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });

    if (current) lines.push(current);
    return lines;
  }
}
