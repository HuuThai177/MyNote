/**
 * Nhận dạng lời nói tiếng Việt thành phụ đề có mốc thời gian.
 *
 * RỦI RO ĐÃ BIẾT: Android thường chỉ cho MỘT nguồn thu âm hoạt động tại một
 * thời điểm. Ứng dụng đang dùng MediaRecorder để ghi âm, nên bộ nhận dạng có
 * thể không giành được micro. Vì vậy mọi lỗi ở đây đều phải suy giảm êm — ghi
 * âm vẫn chạy tiếp, chỉ là không có phụ đề — chứ tuyệt đối không được làm hỏng
 * bản ghi của người dùng.
 */

export interface TranscriptSegment {
  /** Giây tính từ lúc bắt đầu ghi âm */
  time: number;
  text: string;
}

export interface TranscriberHandlers {
  /** Một câu đã chốt */
  onSegment: (text: string) => void;
  /** Chữ đang nghe dở, chỉ để hiển thị trực tiếp */
  onPartial?: (text: string) => void;
  /** Bộ nhận dạng chết giữa chừng */
  onFailure?: (message: string) => void;
}

type Listener = { remove: () => void } | undefined;

class SpeechTranscriberImpl {
  private listeners: Listener[] = [];
  private running = false;
  private nativeChecked = false;
  private isNative = false;

  private async detectNative(): Promise<boolean> {
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
    const mod = await import('@capgo/capacitor-speech-recognition');
    return mod.SpeechRecognition;
  }

  public async isAvailable(): Promise<boolean> {
    if (!(await this.detectNative())) return false;
    try {
      const plugin = await this.loadPlugin();
      const { available } = await plugin.available();
      return available;
    } catch {
      return false;
    }
  }

  public getIsRunning(): boolean {
    return this.running;
  }

  /**
   * Bắt đầu nghe liên tục.
   * `popup: false` để không che màn hình — người dùng còn đang ghi chép.
   */
  public async start(handlers: TranscriberHandlers): Promise<{ ok: boolean; error?: string }> {
    if (this.running) return { ok: true };

    if (!(await this.detectNative())) {
      return { ok: false, error: 'Phụ đề chỉ có trên bản ứng dụng Android/iOS.' };
    }

    try {
      const plugin = await this.loadPlugin();

      const { available } = await plugin.available();
      if (!available) {
        return { ok: false, error: 'Thiết bị không có bộ nhận dạng giọng nói tiếng Việt.' };
      }

      const permission = await plugin.requestPermissions();
      if (permission.speechRecognition !== 'granted') {
        return { ok: false, error: 'Bạn chưa cấp quyền nhận dạng giọng nói.' };
      }

      // Câu đã chốt
      this.listeners.push(
        await plugin.addListener('segmentResults', (event: any) => {
          const text = event?.matches?.[0];
          if (typeof text === 'string' && text.trim()) handlers.onSegment(text.trim());
        })
      );

      // Chữ đang nghe dở
      if (handlers.onPartial) {
        this.listeners.push(
          await plugin.addListener('partialResults', (event: any) => {
            const text = event?.accumulatedText ?? event?.accumulated ?? event?.matches?.[0];
            if (typeof text === 'string') handlers.onPartial!(text);
          })
        );
      }

      this.listeners.push(
        await plugin.addListener('error', (event: any) => {
          const code = event?.errorCode ?? event?.message ?? 'không rõ';
          handlers.onFailure?.(String(code));
        })
      );

      await plugin.start({
        language: 'vi-VN',
        popup: false,
        partialResults: true,
        addPunctuation: true,
        // Giữ phiên chạy qua những quãng im lặng khi thầy dừng nói
        allowForSilence: 4000
      });

      this.running = true;
      return { ok: true };
    } catch (e: any) {
      await this.cleanupListeners();
      return {
        ok: false,
        error: e?.message || 'Không khởi động được bộ nhận dạng giọng nói.'
      };
    }
  }

  public async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    try {
      const plugin = await this.loadPlugin();
      await plugin.stop();
    } catch {
      /* dừng thất bại không ảnh hưởng bản ghi âm */
    }

    await this.cleanupListeners();
  }

  private async cleanupListeners(): Promise<void> {
    this.listeners.forEach(listener => {
      try {
        listener?.remove();
      } catch {
        /* bỏ qua */
      }
    });
    this.listeners = [];
  }
}

export const SpeechTranscriber = new SpeechTranscriberImpl();
