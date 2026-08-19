import { Notebook, NotebookPage, InkIndex } from '../types/notebook';
import { InkLineSegmenter } from './InkLineSegmenter';
import { InkRecognitionService } from './InkRecognitionService';
import { RawInkStroke } from './VietnameseInkRecognizer';

/** Nghỉ giữa hai trang để không chiếm CPU của việc vẽ */
const PAUSE_BETWEEN_PAGES = 220;
/** Trang có nhiều dòng hơn mức này thì chỉ lấy phần đầu, tránh treo máy */
const MAX_LINES_PER_PAGE = 60;

export interface IndexProgress {
  done: number;
  total: number;
  currentNotebook: string;
}

export interface IndexTarget {
  notebookId: string;
  pageId: string;
  page: NotebookPage;
}

/**
 * Đánh chỉ mục chữ viết tay để tìm kiếm thấy được.
 *
 * Chỉ khả thi nhờ ML Kit chạy ngoại tuyến: mỗi trang cần vài lần nhận diện, nếu
 * vẫn phải gọi qua mạng như trước thì đánh chỉ mục cả thư viện là hàng nghìn
 * request — không dùng được.
 *
 * Chỉ mục lưu thẳng vào từng trang nên nó tự động đi theo bản sao lưu và không
 * cần cơ chế lưu trữ riêng.
 */
export class InkIndexer {
  private cancelled = false;

  /**
   * Dấu vân của tập nét, dùng để biết trang có đổi kể từ lần đánh chỉ mục trước.
   * Số nét cộng tổng số điểm là đủ nhạy: thêm, xoá hay vẽ lại đều làm nó đổi.
   */
  static signatureOf(page: NotebookPage): string {
    const strokes = page.strokes || [];
    const points = strokes.reduce((sum, s) => sum + s.points.length, 0);
    return `${strokes.length}:${points}`;
  }

  /** Trang có nét viết tay nhưng chỉ mục chưa có hoặc đã cũ */
  static isStale(page: NotebookPage): boolean {
    if (!page.strokes || page.strokes.length === 0) return false;
    if (!page.inkIndex) return true;
    return page.inkIndex.signature !== this.signatureOf(page);
  }

  static collectStale(notebooks: Notebook[]): IndexTarget[] {
    const targets: IndexTarget[] = [];
    notebooks.forEach(nb =>
      nb.pages.forEach(page => {
        if (this.isStale(page)) targets.push({ notebookId: nb.id, pageId: page.id, page });
      })
    );
    return targets;
  }

  static countIndexable(notebooks: Notebook[]): { indexed: number; total: number } {
    let indexed = 0;
    let total = 0;
    notebooks.forEach(nb =>
      nb.pages.forEach(page => {
        if (!page.strokes || page.strokes.length === 0) return;
        total++;
        if (page.inkIndex && page.inkIndex.signature === this.signatureOf(page)) indexed++;
      })
    );
    return { indexed, total };
  }

  /** Nhận diện toàn bộ chữ viết tay trên MỘT trang, ghép lại theo dòng */
  static async indexPage(page: NotebookPage): Promise<InkIndex> {
    const lines = InkLineSegmenter.segment(page.strokes || []).slice(0, MAX_LINES_PER_PAGE);
    const recognized: string[] = [];

    for (const line of lines) {
      const payload: RawInkStroke[] = line.strokes.map(stroke => ({
        points: stroke.points.map(p => ({
          x: p.x - line.bounds.x,
          y: p.y - line.bounds.y,
          time: p.time
        }))
      }));

      try {
        const result = await InkRecognitionService.recognize({
          strokes: payload,
          guideWidth: line.bounds.width * 1.05,
          guideHeight: line.bounds.height * 1.4,
          // Dòng trước làm ngữ cảnh cho dòng sau, giúp tách từ chính xác hơn
          preContext: recognized[recognized.length - 1]
        });
        if (result.text.trim()) recognized.push(result.text.trim());
      } catch {
        // Một dòng không đọc được không nên làm hỏng cả trang
      }
    }

    return {
      text: recognized.join('\n'),
      signature: this.signatureOf(page),
      indexedAt: Date.now(),
      lineCount: recognized.length
    };
  }

  // ---------------------------------------------------------------------------
  // Chạy theo hàng đợi
  // ---------------------------------------------------------------------------
  public cancel() {
    this.cancelled = true;
  }

  /**
   * Đánh chỉ mục lần lượt từng trang còn cũ.
   * `onPageIndexed` được gọi ngay sau mỗi trang để kết quả hiện dần, không phải
   * chờ xong hết mới thấy gì.
   */
  public async run(
    notebooks: Notebook[],
    onPageIndexed: (notebookId: string, pageId: string, index: InkIndex) => void,
    onProgress?: (progress: IndexProgress) => void
  ): Promise<{ done: number; cancelled: boolean }> {
    this.cancelled = false;

    const targets = InkIndexer.collectStale(notebooks);
    let done = 0;

    for (const target of targets) {
      if (this.cancelled) break;

      const notebookTitle = notebooks.find(n => n.id === target.notebookId)?.title ?? '';
      onProgress?.({ done, total: targets.length, currentNotebook: notebookTitle });

      try {
        const index = await InkIndexer.indexPage(target.page);
        if (this.cancelled) break;
        onPageIndexed(target.notebookId, target.pageId, index);
      } catch (e) {
        console.warn('Không đánh chỉ mục được trang:', e);
      }

      done++;
      await new Promise(resolve => setTimeout(resolve, PAUSE_BETWEEN_PAGES));
    }

    onProgress?.({ done, total: targets.length, currentNotebook: '' });
    return { done, cancelled: this.cancelled };
  }
}
