export interface RecordingResult {
  blob: Blob;
  url: string;
  duration: number;
}

export class AudioSyncEngine {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private startTime: number = 0;
  private isRecording: boolean = false;

  /** Định dạng tốt nhất mà WebView hiện tại hỗ trợ. */
  private static pickMimeType(): string | undefined {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    if (typeof MediaRecorder === 'undefined') return undefined;
    return candidates.find(type => MediaRecorder.isTypeSupported(type));
  }

  /**
   * Xin quyền micro và bắt đầu ghi.
   * Trả về false khi bị từ chối quyền hoặc thiết bị không hỗ trợ - phía gọi
   * phải thông báo cho người dùng thay vì ghi âm giả.
   */
  public async startRecording(): Promise<{ ok: boolean; error?: string }> {
    if (this.isRecording) return { ok: true };

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return { ok: false, error: 'Thiết bị hoặc WebView này không hỗ trợ ghi âm.' };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      const mimeType = AudioSyncEngine.pickMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.audioChunks.push(event.data);
      };

      this.mediaRecorder.start(1000);
      this.startTime = Date.now();
      this.isRecording = true;
      return { ok: true };
    } catch (err: any) {
      this.releaseStream();
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      return {
        ok: false,
        error: denied
          ? 'Bạn chưa cấp quyền Micro cho ứng dụng. Hãy bật quyền trong Cài đặt rồi thử lại.'
          : `Không bắt đầu ghi âm được: ${err?.message || 'lỗi không xác định'}`
      };
    }
  }

  /** Dừng ghi, trả về Blob để lưu vào IndexedDB. Null nếu không có dữ liệu. */
  public stopRecording(): Promise<RecordingResult | null> {
    return new Promise((resolve) => {
      const duration = (Date.now() - this.startTime) / 1000;
      const recorder = this.mediaRecorder;

      this.isRecording = false;

      if (!recorder || recorder.state === 'inactive') {
        this.releaseStream();
        return resolve(null);
      }

      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type });
        this.audioChunks = [];
        this.mediaRecorder = null;
        this.releaseStream();

        if (blob.size === 0) return resolve(null);
        resolve({ blob, url: URL.createObjectURL(blob), duration });
      };

      recorder.stop();
    });
  }

  /** Tắt micro để đèn báo thu âm của hệ điều hành không sáng mãi. */
  private releaseStream(): void {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
  }

  public getElapsedSeconds(): number {
    if (!this.isRecording) return 0;
    return (Date.now() - this.startTime) / 1000;
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}
