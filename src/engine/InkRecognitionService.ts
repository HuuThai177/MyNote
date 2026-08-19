import {
  VietnameseInkRecognizer,
  RawInkStroke,
  InkRecognitionError
} from './VietnameseInkRecognizer';

/** Mã ngôn ngữ ML Kit cho tiếng Việt (chữ Latin) */
export const VIETNAMESE_MODEL_TAG = 'vi';
/** Dung lượng mô hình ML Kit, dùng để báo trước cho người dùng */
export const MODEL_SIZE_LABEL = '~20 MB';
/** ML Kit khuyến nghị tối đa 20 ký tự ngữ cảnh phía trước */
const MAX_PRE_CONTEXT = 20;

export type RecognitionEngine = 'native' | 'web';

export type ModelStatus =
  | 'unsupported'   // Đang chạy trên trình duyệt, không có ML Kit
  | 'unknown'       // Chưa kiểm tra
  | 'missing'       // Có ML Kit nhưng chưa tải mô hình tiếng Việt
  | 'downloading'
  | 'ready';

export interface RecognizeRequest {
  strokes: RawInkStroke[];
  guideWidth: number;
  guideHeight: number;
  /** Chữ đứng ngay trước phần đang viết — giúp phân biệt "n" với "u", tách từ */
  preContext?: string;
  signal?: AbortSignal;
}

export interface RecognitionOutcome {
  text: string;
  candidates: string[];
  engine: RecognitionEngine;
}

/**
 * Chọn bộ nhận diện chữ viết tay tốt nhất đang có.
 *
 * - Trên Android/iOS: ML Kit Digital Ink, chạy HOÀN TOÀN NGOẠI TUYẾN sau khi
 *   tải mô hình tiếng Việt một lần. Đây là mô hình chính chủ của Google dành
 *   riêng cho chữ viết tay, khác với endpoint Input Tools vốn là API không
 *   chính thức và bắt buộc phải có mạng.
 * - Trên trình duyệt: quay về Google Input Tools, vì plugin ML Kit không có
 *   bản web.
 *
 * Hai đường nhận cùng một dạng dữ liệu vào và trả cùng một dạng kết quả, nên
 * nơi gọi không cần biết đang chạy engine nào.
 */
class InkRecognitionServiceImpl {
  private modelStatus: ModelStatus = 'unknown';
  private nativeChecked = false;
  private isNative = false;
  private listeners = new Set<(status: ModelStatus) => void>();

  // ---------------------------------------------------------------------------
  // Nền tảng & trạng thái mô hình
  // ---------------------------------------------------------------------------
  private async detectPlatform(): Promise<boolean> {
    if (this.nativeChecked) return this.isNative;
    try {
      const { Capacitor } = await import('@capacitor/core');
      this.isNative = Capacitor.isNativePlatform();
    } catch {
      this.isNative = false;
    }
    this.nativeChecked = true;
    return this.isNative;
  }

  private async loadPlugin() {
    const mod = await import('@capacitor-mlkit/digital-ink-recognition');
    return mod.DigitalInkRecognition;
  }

  private setStatus(status: ModelStatus) {
    if (this.modelStatus === status) return;
    this.modelStatus = status;
    this.listeners.forEach(listener => listener(status));
  }

  public onStatusChange(listener: (status: ModelStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getStatus(): ModelStatus {
    return this.modelStatus;
  }

  /** Kiểm tra mô hình tiếng Việt đã nằm sẵn trên máy chưa */
  public async refreshModelStatus(): Promise<ModelStatus> {
    if (!(await this.detectPlatform())) {
      this.setStatus('unsupported');
      return 'unsupported';
    }

    try {
      const plugin = await this.loadPlugin();
      const { languageTags } = await plugin.getDownloadedModels();
      this.setStatus(languageTags.includes(VIETNAMESE_MODEL_TAG) ? 'ready' : 'missing');
    } catch (e) {
      console.warn('Không đọc được danh sách mô hình ML Kit:', e);
      this.setStatus('missing');
    }

    return this.modelStatus;
  }

  /** Tải mô hình tiếng Việt về máy — một lần duy nhất, lần này cần mạng */
  public async downloadModel(): Promise<{ ok: boolean; error?: string }> {
    if (!(await this.detectPlatform())) {
      return {
        ok: false,
        error: 'Nhận diện ngoại tuyến chỉ có trên bản ứng dụng Android/iOS, không chạy trên trình duyệt.'
      };
    }

    this.setStatus('downloading');
    try {
      const plugin = await this.loadPlugin();
      await plugin.downloadModel({ languageTag: VIETNAMESE_MODEL_TAG });
      this.setStatus('ready');
      return { ok: true };
    } catch (e: any) {
      this.setStatus('missing');
      return { ok: false, error: e?.message || 'Tải mô hình thất bại' };
    }
  }

  public async deleteModel(): Promise<void> {
    if (!(await this.detectPlatform())) return;
    try {
      const plugin = await this.loadPlugin();
      await plugin.deleteDownloadedModel({ languageTag: VIETNAMESE_MODEL_TAG });
    } catch (e) {
      console.warn('Không xoá được mô hình:', e);
    }
    this.setStatus('missing');
  }

  // ---------------------------------------------------------------------------
  // Nhận diện
  // ---------------------------------------------------------------------------
  public async recognize(request: RecognizeRequest): Promise<RecognitionOutcome> {
    const canUseNative = (await this.detectPlatform()) && this.modelStatus === 'ready';

    if (canUseNative) {
      try {
        return await this.recognizeNative(request);
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e;
        if (e instanceof InkRecognitionError && e.kind === 'empty') throw e;

        // Mô hình bị xoá giữa chừng hoặc lỗi native: hạ xuống đường web
        console.warn('ML Kit thất bại, chuyển sang bộ nhận diện trực tuyến:', e);
        this.setStatus('missing');
      }
    }

    return this.recognizeWeb(request);
  }

  private async recognizeNative(request: RecognizeRequest): Promise<RecognitionOutcome> {
    const plugin = await this.loadPlugin();

    // Mốc thời gian tương đối tính từ điểm đầu của cả cụm nét, giữ nguyên thứ
    // tự và khoảng cách giữa các nét — đây là tín hiệu để engine nhận ra dấu
    // thanh được thêm sau khi đã viết xong chữ.
    const base = request.strokes[0]?.points[0]?.time ?? 0;

    const strokes = request.strokes.map(stroke => ({
      points: stroke.points.map(p => ({
        x: p.x,
        y: p.y,
        t: Math.max(0, Math.round((p.time ?? base) - base))
      }))
    }));

    const result = await plugin.recognize({
      languageTag: VIETNAMESE_MODEL_TAG,
      strokes,
      // writingArea giúp engine ước lượng chiều cao chữ, nhờ đó phân biệt được
      // chữ hoa với chữ thường
      writingArea: {
        width: Math.round(request.guideWidth),
        height: Math.round(request.guideHeight)
      },
      maxResultCount: 6,
      preContext: this.trimPreContext(request.preContext)
    });

    if (request.signal?.aborted) {
      const abort = new Error('Aborted');
      abort.name = 'AbortError';
      throw abort;
    }

    const candidates = result.candidates.map(c => c.text).filter(Boolean);
    if (candidates.length === 0) {
      throw new InkRecognitionError('Không nhận ra chữ nào', 'empty');
    }

    return {
      text: candidates[0],
      candidates: Array.from(new Set(candidates)).slice(0, 6),
      engine: 'native'
    };
  }

  private async recognizeWeb(request: RecognizeRequest): Promise<RecognitionOutcome> {
    const result = await VietnameseInkRecognizer.recognizeLine(
      request.strokes,
      request.guideWidth,
      request.guideHeight,
      request.signal,
      this.trimPreContext(request.preContext)
    );
    return { ...result, engine: 'web' };
  }

  /** ML Kit khuyến nghị không quá 20 ký tự, lấy phần đuôi gần nhất */
  private trimPreContext(preContext?: string): string | undefined {
    const trimmed = preContext?.replace(/\s+/g, ' ');
    if (!trimmed) return undefined;
    return trimmed.slice(-MAX_PRE_CONTEXT);
  }

  /** Engine sẽ được dùng cho lần nhận diện tiếp theo */
  public getActiveEngine(): RecognitionEngine {
    return this.modelStatus === 'ready' ? 'native' : 'web';
  }
}

export const InkRecognitionService = new InkRecognitionServiceImpl();
