import * as pdfjsLib from 'pdfjs-dist';
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

// Worker được bundle cùng ứng dụng (không tải qua CDN) để chạy được offline
// và trong WebView của Capacitor trên Android.
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker();

export interface RenderedPdfPage {
  pageNumber: number;
  /** Ảnh nền dạng Blob để lưu vào store `assets` */
  blob: Blob;
  width: number;
  height: number;
}

export interface PdfImportProgress {
  current: number;
  total: number;
}

const MAX_RENDER_WIDTH = 1400;   // Đủ nét để ghi chú, tránh phình dung lượng
const JPEG_QUALITY = 0.82;

export class PdfImporter {
  /** Mở hộp thoại chọn file PDF. Trả về null nếu người dùng huỷ. */
  public static pickFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf';

      input.onchange = () => resolve(input.files?.[0] ?? null);
      // Người dùng bấm Cancel: 'cancel' event được hỗ trợ trên Chromium/WebView mới.
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  /**
   * Render từng trang PDF thành ảnh nền để viết chú thích lên trên.
   * `maxPages` chặn trường hợp import file hàng trăm trang làm treo thiết bị.
   */
  public static async renderPdfToPages(
    file: File,
    maxPages: number = 40,
    onProgress?: (progress: PdfImportProgress) => void
  ): Promise<RenderedPdfPage[]> {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

    const total = Math.min(pdf.numPages, maxPages);
    const rendered: RenderedPdfPage[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
        onProgress?.({ current: pageNumber, total });

        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2, MAX_RENDER_WIDTH / baseViewport.width);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          page.cleanup();
          continue;
        }

        // PDF không có nền trắng mặc định -> tô trắng trước khi render.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;

        const blob = await new Promise<Blob | null>(resolve =>
          canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
        );

        if (blob) {
          rendered.push({ pageNumber, blob, width: canvas.width, height: canvas.height });
        }

        page.cleanup();
      }
    } finally {
      await pdf.destroy();
    }

    return rendered;
  }

  public static async getPageCount(file: File): Promise<number> {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const count = pdf.numPages;
    await pdf.destroy();
    return count;
  }
}
