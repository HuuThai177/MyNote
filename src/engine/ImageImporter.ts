const MAX_DIMENSION = 1600;      // Giới hạn cạnh dài nhất khi lưu
const JPEG_QUALITY = 0.85;
const DEFAULT_PLACE_WIDTH = 380; // Kích thước hiển thị ban đầu trên trang

export interface ImportedImage {
  /** Blob để lưu vào store `assets` — nhẹ hơn base64 khoảng 33% */
  blob: Blob;
  width: number;   // Kích thước hiển thị đề xuất trên canvas
  height: number;
}

export class ImageImporter {
  /**
   * Mở thư viện ảnh / camera của thiết bị.
   * `useCamera` bật thuộc tính capture để Android mở trực tiếp camera sau.
   */
  public static pickImage(useCamera: boolean = false): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (useCamera) input.setAttribute('capture', 'environment');

      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  /**
   * Đọc file ảnh, thu nhỏ về mức hợp lý rồi trả về dataURL kèm kích thước
   * hiển thị giữ đúng tỉ lệ gốc.
   */
  public static async loadAndCompress(file: File): Promise<ImportedImage> {
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await this.loadImageElement(objectUrl);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Không khởi tạo được canvas để xử lý ảnh');

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      // PNG giữ được nền trong suốt, các định dạng khác nén JPEG cho nhẹ.
      const isTransparent = file.type === 'image/png' || file.type === 'image/webp';
      const blob = await this.canvasToBlob(
        canvas,
        isTransparent ? 'image/png' : 'image/jpeg',
        isTransparent ? undefined : JPEG_QUALITY
      );

      const aspect = image.height / image.width;
      const displayWidth = Math.min(DEFAULT_PLACE_WIDTH, image.width);

      return {
        blob,
        width: Math.round(displayWidth),
        height: Math.round(displayWidth * aspect)
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private static canvasToBlob(
    canvas: HTMLCanvasElement,
    type: string,
    quality?: number
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Không nén được ảnh'))),
        type,
        quality
      );
    });
  }

  private static loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Không đọc được file ảnh này'));
      img.src = src;
    });
  }
}
