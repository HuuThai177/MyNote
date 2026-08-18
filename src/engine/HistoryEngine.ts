export interface HistorySnapshotInfo {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
}

/**
 * Undo / Redo dựa trên ảnh chụp trạng thái (snapshot).
 *
 * Vì toàn bộ notebook được cập nhật kiểu immutable, mỗi snapshot chỉ là một
 * tham chiếu mảng - phần dữ liệu không đổi được chia sẻ giữa các snapshot nên
 * chi phí bộ nhớ rất thấp.
 *
 * `coalesceKey` dùng để gộp một chuỗi thao tác liên tục (kéo di chuyển, resize,
 * gõ chữ) thành MỘT bước hoàn tác duy nhất. CanvasArea sinh key mới cho mỗi cử
 * chỉ nên hai cử chỉ khác nhau không bao giờ bị gộp lẫn.
 */
export class HistoryEngine<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private lastCoalesceKey: string | null = null;
  private lastRecordedAt = 0;

  constructor(
    private readonly limit: number = 100,
    private readonly coalesceWindowMs: number = 4000
  ) {}

  /**
   * Ghi lại trạng thái TRƯỚC khi thay đổi.
   * Gọi ngay trước mỗi lần commit dữ liệu mới.
   */
  public record(previous: T, coalesceKey?: string): void {
    const now = Date.now();
    const shouldMerge =
      !!coalesceKey &&
      this.lastCoalesceKey === coalesceKey &&
      now - this.lastRecordedAt < this.coalesceWindowMs;

    if (!shouldMerge) {
      this.undoStack.push(previous);
      if (this.undoStack.length > this.limit) {
        this.undoStack.shift();
      }
    }

    this.lastCoalesceKey = coalesceKey ?? null;
    this.lastRecordedAt = now;
    this.redoStack = [];
  }

  public undo(current: T): T | null {
    const previous = this.undoStack.pop();
    if (previous === undefined) return null;

    this.redoStack.push(current);
    this.breakCoalescing();
    return previous;
  }

  public redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;

    this.undoStack.push(current);
    this.breakCoalescing();
    return next;
  }

  /** Ngắt chuỗi gộp để thao tác kế tiếp luôn tạo bước hoàn tác mới. */
  public breakCoalescing(): void {
    this.lastCoalesceKey = null;
    this.lastRecordedAt = 0;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.breakCoalescing();
  }

  public getInfo(): HistorySnapshotInfo {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length
    };
  }
}
