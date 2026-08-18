import { Stroke, Point } from '../types/notebook';

export interface SelectionRecognitionResult {
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  /** Các phương án khác + từ điển người dùng, dùng cho chip gợi ý */
  suggestions: string[];
  strokesProcessed: string[];
}

/** Một nét trên bảng viết tay, toạ độ thô trong hệ toạ độ của bảng */
export interface RawInkStroke {
  points: { x: number; y: number; time: number }[];
}

export interface LineRecognitionResult {
  /** Phương án tốt nhất cho cả dòng */
  text: string;
  /** Các phương án khác, dùng dựng chip gợi ý */
  candidates: string[];
}

export class InkRecognitionError extends Error {
  constructor(message: string, public readonly kind: 'offline' | 'network' | 'empty') {
    super(message);
    this.name = 'InkRecognitionError';
  }
}

const INPUT_TOOLS_ENDPOINT =
  'https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';

/**
 * Nhận diện chữ viết tay Tiếng Việt qua Google Input Tools ('vi').
 *
 * CHỈ CÓ MỘT ĐƯỜNG NHẬN DIỆN DUY NHẤT và nó cần mạng.
 * Bộ đoán offline theo heuristic của bản trước đã bị xoá: nó trả về từ lấy từ
 * một từ điển cứng ('Thái', 'Ghi chú'…) bất kể người dùng viết gì, tức là điền
 * chữ bịa vào ghi chú. Báo lỗi rõ ràng tốt hơn đoán sai trong im lặng.
 */
export class VietnameseInkRecognizer {
  private static readonly DICTIONARY_KEY = 'padnote_user_dictionary';

  private static readonly SEED_DICTIONARY: string[] = [
    'Ghi chú', 'Học tập', 'Công việc', 'Kế hoạch',
    'PadNote AI', 'Xiaomi Pad', 'Sổ tay số', 'Ý tưởng', 'Bài giảng', 'Dự án',
    'Việt Nam', 'Thiết kế', 'Xin chào', 'Thành công', 'Họp team', 'Lập trình'
  ];

  /**
   * Từ điển riêng của người dùng, giữ trong localStorage.
   * Bản trước chỉ để trong RAM nên mọi từ tự thêm đều mất sau khi tải lại app.
   * Dữ liệu chỉ là một mảng chuỗi ngắn nên localStorage là đủ, không cần
   * IndexedDB và không phải chờ bất đồng bộ lúc khởi động.
   */
  private static userDictionary: string[] = (() => {
    try {
      const stored = localStorage.getItem('padnote_user_dictionary');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.filter(w => typeof w === 'string');
      }
    } catch {
      /* dùng danh sách mặc định */
    }
    return [
      'Ghi chú', 'Học tập', 'Công việc', 'Kế hoạch',
      'PadNote AI', 'Xiaomi Pad', 'Sổ tay số', 'Ý tưởng', 'Bài giảng', 'Dự án',
      'Việt Nam', 'Thiết kế', 'Xin chào', 'Thành công', 'Họp team', 'Lập trình'
    ];
  })();

  private static persistDictionary(): void {
    try {
      localStorage.setItem(this.DICTIONARY_KEY, JSON.stringify(this.userDictionary.slice(0, 200)));
    } catch (e) {
      console.warn('Không lưu được từ điển người dùng:', e);
    }
  }

  public static getBoundingBox(strokes: Stroke[]) {
    if (strokes.length === 0) {
      return { x: 0, y: 0, width: 100, height: 40 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    strokes.forEach(stroke => {
      stroke.points.forEach((p: Point) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });

    const padding = 16;
    return {
      x: Math.max(0, Math.round(minX - padding)),
      y: Math.max(0, Math.round(minY - padding)),
      width: Math.max(100, Math.round((maxX - minX) + padding * 2)),
      height: Math.max(45, Math.round((maxY - minY) + padding * 2)),
    };
  }

  public static addWordToDictionary(word: string) {
    const trimmed = word?.trim();
    if (!trimmed || this.userDictionary.includes(trimmed)) return;
    this.userDictionary.unshift(trimmed);
    this.persistDictionary();
  }

  public static removeWordFromDictionary(word: string) {
    const next = this.userDictionary.filter(w => w !== word);
    if (next.length === this.userDictionary.length) return;
    this.userDictionary = next;
    this.persistDictionary();
  }

  public static getUserDictionary(): string[] {
    return this.userDictionary;
  }

  /**
   * Nhận diện MỘT DÒNG chữ viết tay trên bảng nhập (chế độ thời gian thực).
   *
   * Khác cách gửi của bản trước ở ba điểm quan trọng:
   * 1. Gửi toạ độ THÔ kèm `writing_guide` bằng đúng kích thước vùng viết thật.
   *    Endpoint dùng writing_guide để suy ra chiều cao chữ, nên co giãn nét về
   *    một khung cố định 800×600 như hàm cũ làm giảm độ chính xác dấu.
   * 2. Hỗ trợ AbortSignal — trong vòng lặp thời gian thực, request cũ về muộn
   *    sẽ ghi đè kết quả mới nếu không huỷ.
   * 3. KHÔNG có fallback heuristic. Bộ đoán offline chỉ trả về từ trong từ điển
   *    cứng nên trong vòng lặp này nó sẽ điền chữ bừa vào ghi chú của người
   *    dùng — thà báo lỗi còn hơn.
   */
  public static async recognizeLine(
    strokes: RawInkStroke[],
    guideWidth: number,
    guideHeight: number,
    signal?: AbortSignal
  ): Promise<LineRecognitionResult> {
    if (strokes.length === 0) {
      throw new InkRecognitionError('Chưa có nét nào để nhận diện', 'empty');
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new InkRecognitionError('Thiết bị đang offline', 'offline');
    }

    // MỐC THỜI GIAN DÙNG CHUNG cho mọi nét.
    // Bản trước đặt lại mốc về 0 cho TỪNG nét, làm mất hoàn toàn thông tin
    // "nét nào viết trước, cách nét trước bao lâu" — đó chính là tín hiệu engine
    // dựa vào để biết đâu là dấu thêm sau và đâu là chữ mới.
    const globalBaseTime = strokes[0]?.points[0]?.time ?? 0;

    const ink = strokes.map(stroke => {
      const xs: number[] = [];
      const ys: number[] = [];
      const ts: number[] = [];

      stroke.points.forEach(p => {
        xs.push(Math.round(p.x));
        ys.push(Math.round(p.y));
        ts.push(Math.max(0, Math.round((p.time ?? globalBaseTime) - globalBaseTime)));
      });

      return [xs, ys, ts];
    });

    let response: Response;
    try {
      response = await fetch(INPUT_TOOLS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          options: 'enable_pre_space',
          requests: [
            {
              writing_guide: {
                writing_area_width: Math.round(guideWidth),
                writing_area_height: Math.round(guideHeight)
              },
              ink,
              language: 'vi'
            }
          ]
        })
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      throw new InkRecognitionError('Không kết nối được dịch vụ nhận diện', 'network');
    }

    if (!response.ok) {
      throw new InkRecognitionError(`Dịch vụ nhận diện trả về lỗi ${response.status}`, 'network');
    }

    const data = await response.json();
    if (data?.[0] !== 'SUCCESS' || !data?.[1]?.[0]?.[1]) {
      throw new InkRecognitionError('Dịch vụ nhận diện trả về dữ liệu không đọc được', 'network');
    }

    const candidates: string[] = data[1][0][1];
    if (candidates.length === 0) {
      throw new InkRecognitionError('Không nhận ra chữ nào', 'empty');
    }

    return {
      text: candidates[0],
      candidates: Array.from(new Set(candidates)).slice(0, 6)
    };
  }

  /**
   * Nhận diện vùng nét được khoanh bằng Lasso trên trang giấy.
   *
   * Dùng chung engine với bảng viết tay: dời nét về gốc khung bao rồi lấy chính
   * kích thước khung bao làm `writing_guide`. Ném lỗi khi thất bại — KHÔNG có
   * đường lui đoán bừa.
   */
  public static async recognizeSelection(strokes: Stroke[]): Promise<SelectionRecognitionResult> {
    if (strokes.length === 0) {
      throw new InkRecognitionError('Chưa chọn nét nào', 'empty');
    }

    // Khung bao thô (không đệm) để làm hệ toạ độ gửi đi
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    strokes.forEach(stroke =>
      stroke.points.forEach((p: Point) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      })
    );

    const rawWidth = Math.max(1, maxX - minX);
    const rawHeight = Math.max(1, maxY - minY);

    const payload: RawInkStroke[] = strokes.map(stroke => ({
      points: stroke.points.map(p => ({
        x: p.x - minX,
        y: p.y - minY,
        time: p.time ?? 0
      }))
    }));

    // Chừa lề quanh nét giống như khi viết trên bảng, giúp engine ước lượng
    // chiều cao chữ sát thực tế hơn.
    const result = await this.recognizeLine(payload, rawWidth * 1.15, rawHeight * 1.6);

    return {
      text: result.text,
      boundingBox: this.getBoundingBox(strokes),
      suggestions: Array.from(new Set([...result.candidates, ...this.userDictionary])).slice(0, 12),
      strokesProcessed: strokes.map(s => s.id)
    };
  }
}
