/**
 * OCR ảnh và quét tài liệu qua ML Kit.
 *
 * Cả hai chỉ chạy trên bản đóng gói native. Plugin OCR đòi ĐƯỜNG DẪN FILE THẬT
 * (`file:///…`) — không nhận base64 cũng không nhận Object URL — trong khi ảnh
 * của ứng dụng nằm dạng Blob trong IndexedDB. Vì vậy phải ghi tạm ra bộ nhớ
 * đệm trước khi đọc chữ, rồi xoá đi.
 */

export interface OcrResult {
  text: string;
  blockCount: number;
  lineCount: number;
}

export interface ScannedPage {
  blob: Blob;
  width: number;
  height: number;
}

const TEMP_PREFIX = 'padnote-ocr-';

class DocumentCaptureImpl {
  private nativeChecked = false;
  private isNative = false;

  private async detectNative(): Promise<boolean> {
    if (this.nativeChecked) return this.isNative;
    try {
      const { Capacitor } = await import('@capacitor/core');
      this.isNative = Capacitor.isNativePlatform();
      this.nativeChecked = true;
    } catch {
      this.isNative = false;
      this.nativeChecked = true;
    }
    return this.isNative;
  }

  public async isAvailable(): Promise<boolean> {
    return this.detectNative();
  }

  /** Android duy nhất: plugin quét tài liệu không có trên iOS lẫn web */
  public async isScannerAvailable(): Promise<boolean> {
    if (!(await this.detectNative())) return false;
    try {
      const { Capacitor } = await import('@capacitor/core');
      return Capacitor.getPlatform() === 'android';
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Chuyển đổi Blob <-> file tạm
  // ---------------------------------------------------------------------------
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = () => reject(new Error('Không đọc được dữ liệu ảnh'));
      reader.readAsDataURL(blob);
    });
  }

  private base64ToBlob(base64: string, type: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  // ---------------------------------------------------------------------------
  // OCR
  // ---------------------------------------------------------------------------
  /** Đọc chữ trong một ảnh đang lưu dưới dạng Blob */
  public async recognizeTextInBlob(blob: Blob): Promise<OcrResult> {
    if (!(await this.detectNative())) {
      throw new Error('Đọc chữ từ ảnh chỉ có trên bản ứng dụng Android/iOS.');
    }

    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { TextRecognition } = await import('@capacitor-mlkit/text-recognition');

    const fileName = `${TEMP_PREFIX}${Date.now()}.jpg`;
    let written: { uri: string } | null = null;

    try {
      written = await Filesystem.writeFile({
        path: fileName,
        data: await this.blobToBase64(blob),
        directory: Directory.Cache
      });

      const result = await TextRecognition.processImage({ path: written.uri });

      const lineCount = (result.blocks || []).reduce(
        (sum, block) => sum + (block.lines?.length || 0),
        0
      );

      return {
        text: (result.text || '').trim(),
        blockCount: result.blocks?.length || 0,
        lineCount
      };
    } finally {
      // Ảnh tạm chỉ để đưa cho ML Kit, đọc xong là bỏ
      if (written) {
        try {
          await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache });
        } catch {
          /* không xoá được thì thôi, đây là thư mục cache */
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Quét tài liệu
  // ---------------------------------------------------------------------------
  /**
   * Bộ quét là một module Play Services tải riêng, không nằm sẵn trong máy.
   * Trả về true khi đã sẵn sàng dùng.
   */
  public async ensureScannerModule(
    onProgress?: (percent: number) => void
  ): Promise<{ ok: boolean; error?: string }> {
    if (!(await this.isScannerAvailable())) {
      return { ok: false, error: 'Quét tài liệu chỉ có trên Android.' };
    }

    const { DocumentScanner } = await import('@capacitor-mlkit/document-scanner');

    try {
      const { available } = await DocumentScanner.isGoogleDocumentScannerModuleAvailable();
      if (available) return { ok: true };

      let listener: { remove: () => void } | null = null;
      if (onProgress) {
        listener = await DocumentScanner.addListener(
          'googleDocumentScannerModuleInstallProgress',
          event => onProgress(event.progress ?? 0)
        );
      }

      await DocumentScanner.installGoogleDocumentScannerModule();
      listener?.remove();

      const recheck = await DocumentScanner.isGoogleDocumentScannerModuleAvailable();
      return recheck.available
        ? { ok: true }
        : { ok: false, error: 'Chưa cài xong bộ quét của Google. Thử lại sau ít phút.' };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Không cài được bộ quét tài liệu.' };
    }
  }

  /** Mở giao diện quét của hệ thống, trả về từng trang đã cắt viền và nắn phối cảnh */
  public async scanDocument(pageLimit = 10): Promise<ScannedPage[]> {
    const { DocumentScanner } = await import('@capacitor-mlkit/document-scanner');
    const { Filesystem } = await import('@capacitor/filesystem');

    const result = await DocumentScanner.scanDocument({
      galleryImportAllowed: true,
      pageLimit,
      // Chỉ cần ảnh; PDF do ứng dụng tự dựng khi xuất file
      resultFormats: 'JPEG',
      scannerMode: 'FULL'
    });

    const uris = result.scannedImages ?? [];
    const pages: ScannedPage[] = [];

    for (const uri of uris) {
      try {
        const file = await Filesystem.readFile({ path: uri });
        const blob = this.base64ToBlob(String(file.data), 'image/jpeg');
        const { width, height } = await this.measureImage(blob);
        pages.push({ blob, width, height });
      } catch (e) {
        console.warn('Không đọc được trang đã quét:', uri, e);
      }
    }

    return pages;
  }

  /** Đo kích thước thật của ảnh để dựng trang đúng tỉ lệ */
  public measureImage(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const size = { width: img.naturalWidth || 1, height: img.naturalHeight || 1 };
        URL.revokeObjectURL(url);
        resolve(size);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Không đọc được kích thước ảnh'));
      };
      img.src = url;
    });
  }
}

export const DocumentCapture = new DocumentCaptureImpl();
