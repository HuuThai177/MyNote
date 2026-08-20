import { StorageEngine } from './StorageEngine';

export interface Flashcard {
  id: string;
  /** Ảnh nét viết tay ở mặt trước, khoá trong store `assets` */
  frontAssetId: string;
  /** Object URL dựng lại mỗi phiên */
  frontUrl?: string;
  /** Đáp án ở mặt sau */
  backText: string;
  notebookId: string;
  notebookTitle: string;
  pageId: string;
  pageIndex: number;
  createdAt: number;

  // --- Lịch ôn tập ---
  /** Mốc đến hạn ôn (epoch ms) */
  due: number;
  /** Khoảng cách tới lần ôn tiếp theo, tính bằng ngày */
  interval: number;
  /** Hệ số dễ; càng thấp thì lịch càng dày */
  ease: number;
  /** Số lần ôn đúng liên tiếp */
  streak: number;
  reviews: number;
  lapses: number;
}

export type ReviewGrade = 'forgot' | 'hard' | 'good' | 'easy';

const CARDS_KEY = 'flashcards';
const DAY_MS = 86400000;
const MIN_EASE = 1.3;

/**
 * Ôn tập ngắt quãng cho thẻ tạo từ chính nét chữ viết tay.
 *
 * Lịch ôn theo tinh thần SM-2: nhớ tốt thì giãn khoảng cách theo hệ số dễ, quên
 * thì đưa về học lại từ đầu và hạ hệ số. Mục đích là ôn đúng lúc sắp quên chứ
 * không ôn đều đặn vô ích.
 */
export class FlashcardEngine {
  static async loadAll(): Promise<Flashcard[]> {
    const stored = await StorageEngine.getMeta<Flashcard[]>(CARDS_KEY);
    if (!Array.isArray(stored)) return [];

    // Dựng lại Object URL cho ảnh mặt trước
    return Promise.all(
      stored.map(async card => {
        const asset = await StorageEngine.getAsset(card.frontAssetId);
        return {
          ...card,
          frontUrl: asset?.blob ? URL.createObjectURL(asset.blob) : undefined
        };
      })
    );
  }

  static async saveAll(cards: Flashcard[]): Promise<void> {
    // Object URL vô nghĩa ở phiên sau nên không lưu xuống
    await StorageEngine.setMeta(
      CARDS_KEY,
      cards.map(({ frontUrl, ...rest }) => rest)
    );
  }

  static async create(params: {
    frontBlob: Blob;
    backText: string;
    notebookId: string;
    notebookTitle: string;
    pageId: string;
    pageIndex: number;
  }): Promise<Flashcard> {
    const frontAssetId = StorageEngine.newAssetId('image');
    const frontUrl = await StorageEngine.putAsset(frontAssetId, params.frontBlob, 'image');

    return {
      id: `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      frontAssetId,
      frontUrl,
      backText: params.backText,
      notebookId: params.notebookId,
      notebookTitle: params.notebookTitle,
      pageId: params.pageId,
      pageIndex: params.pageIndex,
      createdAt: Date.now(),
      // Thẻ mới đến hạn ngay để học lần đầu
      due: Date.now(),
      interval: 0,
      ease: 2.5,
      streak: 0,
      reviews: 0,
      lapses: 0
    };
  }

  /** Thẻ đã tới hạn ôn, thẻ quá hạn lâu nhất lên trước */
  static getDue(cards: Flashcard[], now = Date.now()): Flashcard[] {
    return cards.filter(c => c.due <= now).sort((a, b) => a.due - b.due);
  }

  static countDue(cards: Flashcard[], now = Date.now()): number {
    return cards.reduce((n, c) => (c.due <= now ? n + 1 : n), 0);
  }

  /**
   * Cập nhật lịch sau khi tự chấm.
   * `forgot` đưa thẻ về học lại trong ngày; các mức còn lại giãn dần theo
   * hệ số dễ, đúng tinh thần SM-2.
   */
  static grade(card: Flashcard, grade: ReviewGrade, now = Date.now()): Flashcard {
    const next: Flashcard = { ...card, reviews: card.reviews + 1 };

    if (grade === 'forgot') {
      next.lapses += 1;
      next.streak = 0;
      next.interval = 0;
      next.ease = Math.max(MIN_EASE, card.ease - 0.2);
      next.due = now + 10 * 60 * 1000; // ôn lại sau 10 phút
      return next;
    }

    next.streak = card.streak + 1;

    if (grade === 'hard') {
      next.ease = Math.max(MIN_EASE, card.ease - 0.15);
      next.interval = card.interval <= 1 ? 1 : Math.max(1, card.interval * 1.2);
    } else if (grade === 'good') {
      next.interval = next.streak === 1 ? 1 : next.streak === 2 ? 3 : card.interval * card.ease;
    } else {
      next.ease = card.ease + 0.15;
      next.interval = next.streak === 1 ? 2 : next.streak === 2 ? 5 : card.interval * card.ease * 1.3;
    }

    next.interval = Math.min(365, Math.max(1, Math.round(next.interval)));
    next.due = now + next.interval * DAY_MS;
    return next;
  }

  /** Mô tả lịch ôn kế tiếp để hiện ngay trên nút chấm điểm */
  static describeNext(card: Flashcard, grade: ReviewGrade): string {
    const graded = this.grade(card, grade);
    const days = Math.round((graded.due - Date.now()) / DAY_MS);
    if (days < 1) return '10 phút';
    if (days === 1) return '1 ngày';
    if (days < 30) return `${days} ngày`;
    return `${Math.round(days / 30)} tháng`;
  }

  static remove(cards: Flashcard[], id: string): Flashcard[] {
    return cards.filter(c => c.id !== id);
  }
}
