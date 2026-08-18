import { Notebook } from '../types/notebook';
import { inferLegacyPaperSize } from './PageGeometry';

const DB_NAME = 'padnote_ai';
const DB_VERSION = 2;

const STORE_NOTEBOOKS = 'notebooks';
const STORE_ASSETS = 'assets';
const STORE_META = 'meta';

/** Bản ghi cũ của DB v1: toàn bộ thư viện nhồi trong một khoá */
const LEGACY_STORE_V1 = 'notebooks';
const LEGACY_RECORD_KEY = 'all';
const LEGACY_LOCALSTORAGE_KEY = 'padnote_ai_notebooks_v1';

const META_ORDER_KEY = 'notebookOrder';

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface StoredAsset {
  id: string;
  blob: Blob;
  kind: 'image' | 'audio' | 'pdf';
  createdAt: number;
}

/**
 * Lưu trữ bền vững trên IndexedDB, tách làm ba store:
 *
 * - `notebooks`: MỖI SỔ TAY MỘT KHOÁ. Nhờ vậy vẽ một nét chỉ ghi lại đúng sổ
 *   tay đang mở, thay vì ghi lại toàn bộ thư viện như bản trước.
 * - `assets`: Blob nhị phân (ảnh chèn, ghi âm, ảnh nền PDF) tách riêng. Chúng
 *   chiếm gần hết dung lượng nhưng gần như không bao giờ đổi, nên tách ra khỏi
 *   bản ghi sổ tay giúp mỗi lần lưu chỉ còn vài chục KB.
 * - `meta`: thứ tự sắp xếp sổ tay.
 *
 * Cách tách này cũng là điều kiện để đồng bộ gia tăng lên Google Drive: chỉ đẩy
 * sổ tay có `updatedAt` mới và những asset chưa từng đẩy.
 */
export class StorageEngine {
  private static dbPromise: Promise<IDBDatabase | null> | null = null;
  /** Object URL đã tạo trong phiên này, để thu hồi khi cần */
  private static objectUrls = new Set<string>();

  // ---------------------------------------------------------------------------
  // Mở CSDL
  // ---------------------------------------------------------------------------
  private static openDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        console.warn('IndexedDB không khả dụng.');
        return resolve(null);
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;

        // v1 dùng store 'notebooks' với một khoá 'all'. Giữ nguyên store đó
        // (cùng tên) và đọc bản ghi cũ ở bước migrate bên dưới.
        if (!db.objectStoreNames.contains(STORE_NOTEBOOKS)) {
          db.createObjectStore(STORE_NOTEBOOKS);
        }
        if (!db.objectStoreNames.contains(STORE_ASSETS)) {
          db.createObjectStore(STORE_ASSETS);
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }

        if (oldVersion > 0 && oldVersion < 2) {
          console.info('Nâng cấp lưu trữ v1 → v2 (tách theo từng sổ tay).');
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('Không mở được IndexedDB:', request.error);
        resolve(null);
      };
      request.onblocked = () => resolve(null);
    });

    return this.dbPromise;
  }

  // ---------------------------------------------------------------------------
  // Tiện ích giao dịch
  // ---------------------------------------------------------------------------
  private static request<T>(store: IDBObjectStore, req: IDBRequest): Promise<T | null> {
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(null);
    });
  }

  private static describeError(error: DOMException | null): string {
    if (!error) return 'Lỗi lưu trữ không xác định';
    if (error.name === 'QuotaExceededError') {
      return 'Bộ nhớ thiết bị đã hết dung lượng. Hãy xoá bớt ảnh, PDF hoặc bản ghi âm.';
    }
    return error.message || error.name;
  }

  private static commit(tx: IDBTransaction): Promise<SaveResult> {
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve({ ok: true });
      tx.onabort = () => resolve({ ok: false, error: this.describeError(tx.error) });
      tx.onerror = () => resolve({ ok: false, error: this.describeError(tx.error) });
    });
  }

  // ---------------------------------------------------------------------------
  // Asset nhị phân
  // ---------------------------------------------------------------------------
  public static newAssetId(kind: StoredAsset['kind']): string {
    return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /** Lưu Blob và trả về Object URL dùng ngay trong phiên hiện tại */
  public static async putAsset(
    assetId: string,
    blob: Blob,
    kind: StoredAsset['kind']
  ): Promise<string> {
    const db = await this.openDb();
    if (db) {
      const tx = db.transaction(STORE_ASSETS, 'readwrite');
      tx.objectStore(STORE_ASSETS).put(
        { id: assetId, blob, kind, createdAt: Date.now() } satisfies StoredAsset,
        assetId
      );
      await this.commit(tx);
    }
    return this.trackObjectUrl(URL.createObjectURL(blob));
  }

  public static async getAsset(assetId: string): Promise<StoredAsset | null> {
    const db = await this.openDb();
    if (!db) return null;
    const tx = db.transaction(STORE_ASSETS, 'readonly');
    const store = tx.objectStore(STORE_ASSETS);
    return this.request<StoredAsset>(store, store.get(assetId));
  }

  public static async getAllAssetIds(): Promise<string[]> {
    const db = await this.openDb();
    if (!db) return [];
    const tx = db.transaction(STORE_ASSETS, 'readonly');
    const store = tx.objectStore(STORE_ASSETS);
    const keys = await this.request<IDBValidKey[]>(store, store.getAllKeys());
    return (keys ?? []).map(String);
  }

  public static async deleteAssets(assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) return;
    const db = await this.openDb();
    if (!db) return;
    const tx = db.transaction(STORE_ASSETS, 'readwrite');
    const store = tx.objectStore(STORE_ASSETS);
    assetIds.forEach(id => store.delete(id));
    await this.commit(tx);
  }

  private static trackObjectUrl(url: string): string {
    this.objectUrls.add(url);
    return url;
  }

  public static revokeAllObjectUrls(): void {
    this.objectUrls.forEach(url => URL.revokeObjectURL(url));
    this.objectUrls.clear();
  }

  // ---------------------------------------------------------------------------
  // Chuẩn hoá: tách phần chỉ dùng trong phiên khỏi phần lưu bền
  // ---------------------------------------------------------------------------
  /** Bỏ Object URL trước khi ghi xuống đĩa — chúng vô nghĩa ở phiên sau */
  private static stripRuntimeFields(notebook: Notebook): Notebook {
    return {
      ...notebook,
      pages: notebook.pages.map(page => ({
        ...page,
        pdfDataUrl: page.pdfAssetId ? undefined : page.pdfDataUrl,
        imageElements: page.imageElements.map(img =>
          img.assetId ? { ...img, src: '' } : img
        ),
        audioNotes: page.audioNotes.map(note =>
          note.assetId ? { ...note, url: undefined } : note
        )
      }))
    };
  }

  /** Dựng lại Object URL từ asset sau khi tải sổ tay lên */
  private static async rehydrate(notebook: Notebook): Promise<Notebook> {
    const resolveUrl = async (assetId?: string): Promise<string | undefined> => {
      if (!assetId) return undefined;
      const asset = await this.getAsset(assetId);
      if (!asset?.blob) return undefined;
      return this.trackObjectUrl(URL.createObjectURL(asset.blob));
    };

    const pages = await Promise.all(
      notebook.pages.map(async (page, index) => ({
        ...page,
        pageIndex: index,
        strokes: page.strokes || [],
        textElements: page.textElements || [],
        pdfDataUrl: page.pdfAssetId ? await resolveUrl(page.pdfAssetId) : page.pdfDataUrl,
        imageElements: await Promise.all(
          (page.imageElements || []).map(async img => ({
            ...img,
            src: img.assetId ? ((await resolveUrl(img.assetId)) ?? img.src) : img.src
          }))
        ),
        audioNotes: await Promise.all(
          (page.audioNotes || []).map(async note => ({
            ...note,
            url: note.assetId ? await resolveUrl(note.assetId) : note.url
          }))
        )
      }))
    );

    return { ...notebook, pages };
  }

  /** Bổ sung trường thiếu cho dữ liệu do bản cũ tạo ra */
  private static normalize(notebook: Notebook): Notebook {
    return {
      ...notebook,
      pages: (notebook.pages || []).map((page, index) => {
        const filled = {
          ...page,
          pageIndex: index,
          strokes: page.strokes || [],
          textElements: page.textElements || [],
          imageElements: page.imageElements || [],
          audioNotes: page.audioNotes || []
        };
        return filled.paperSize ? filled : { ...filled, ...inferLegacyPaperSize(filled) };
      })
    };
  }

  // ---------------------------------------------------------------------------
  // Đọc thư viện
  // ---------------------------------------------------------------------------
  public static async loadLibrary(): Promise<Notebook[]> {
    const db = await this.openDb();
    if (!db) {
      const legacy = this.readLegacyLocalStorage();
      return legacy ? legacy.map(nb => this.normalize(nb)) : this.createInitialDefaultNotebooks();
    }

    const tx = db.transaction(STORE_NOTEBOOKS, 'readonly');
    const store = tx.objectStore(STORE_NOTEBOOKS);
    const records = (await this.request<any[]>(store, store.getAll())) ?? [];

    // Bản ghi v1 nằm chung store dưới khoá 'all' và là một MẢNG sổ tay
    const legacyRecord = records.find(r => Array.isArray(r));
    const perNotebook = records.filter(r => r && !Array.isArray(r) && r.id);

    if (perNotebook.length === 0 && legacyRecord) {
      return this.migrateFromV1(legacyRecord as Notebook[]);
    }

    if (perNotebook.length === 0) {
      const legacy = this.readLegacyLocalStorage();
      if (legacy) return this.migrateFromV1(legacy);

      const defaults = this.createInitialDefaultNotebooks();
      await Promise.all(defaults.map(nb => this.saveNotebook(nb)));
      await this.saveOrder(defaults.map(nb => nb.id));
      return defaults;
    }

    const order = await this.loadOrder();
    const byId = new Map(perNotebook.map(nb => [nb.id as string, nb as Notebook]));

    const ordered: Notebook[] = [];
    order.forEach(id => {
      const nb = byId.get(id);
      if (nb) {
        ordered.push(nb);
        byId.delete(id);
      }
    });
    // Sổ tay chưa có trong thứ tự (tạo ở thiết bị khác) xếp theo lần sửa gần nhất
    ordered.push(...Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt));

    return Promise.all(ordered.map(nb => this.rehydrate(this.normalize(nb))));
  }

  /**
   * Chuyển dữ liệu v1 (một mảng khổng lồ, ảnh/audio nhúng thẳng) sang v2:
   * tách từng sổ tay ra khoá riêng và bóc Blob nhị phân sang store `assets`.
   */
  private static async migrateFromV1(legacy: Notebook[]): Promise<Notebook[]> {
    console.info(`Đang chuyển ${legacy.length} sổ tay sang cấu trúc lưu trữ mới…`);
    const migrated: Notebook[] = [];

    for (const raw of legacy) {
      const notebook = this.normalize(raw);

      const pages = await Promise.all(
        notebook.pages.map(async page => {
          let pdfDataUrl = page.pdfDataUrl;
          let pdfAssetId = page.pdfAssetId;

          if (!pdfAssetId && pdfDataUrl?.startsWith('data:')) {
            const blob = this.dataUrlToBlob(pdfDataUrl);
            pdfAssetId = this.newAssetId('pdf');
            pdfDataUrl = await this.putAsset(pdfAssetId, blob, 'pdf');
          }

          const imageElements = await Promise.all(
            page.imageElements.map(async img => {
              if (img.assetId || !img.src?.startsWith('data:')) return img;
              const blob = this.dataUrlToBlob(img.src);
              const assetId = this.newAssetId('image');
              const src = await this.putAsset(assetId, blob, 'image');
              return { ...img, assetId, src };
            })
          );

          const audioNotes = await Promise.all(
            page.audioNotes.map(async note => {
              const legacyBlob = (note as any).blob as Blob | undefined;
              if (note.assetId || !(legacyBlob instanceof Blob)) return note;
              const assetId = this.newAssetId('audio');
              const url = await this.putAsset(assetId, legacyBlob, 'audio');
              const { blob, ...rest } = note as any;
              return { ...rest, assetId, url };
            })
          );

          return { ...page, pdfDataUrl, pdfAssetId, imageElements, audioNotes };
        })
      );

      const upgraded = { ...notebook, pages };
      await this.saveNotebook(upgraded);
      migrated.push(upgraded);
    }

    await this.saveOrder(migrated.map(nb => nb.id));

    // CỐ Ý KHÔNG xoá bản ghi v1. Migration chạy ngay lần đầu mở bản mới, tức
    // trước khi người dùng kịp tạo bản sao lưu nào; giữ lại bản gốc để còn
    // đường lùi nếu chuyển đổi có sai sót. Dọn bằng `purgeLegacyRecord()` sau
    // khi đã yên tâm.
    console.info('Chuyển đổi hoàn tất. Bản ghi cũ được giữ lại làm bản dự phòng.');
    return migrated;
  }

  /** Xoá bản ghi v1 dự phòng để lấy lại dung lượng (gọi thủ công khi đã yên tâm) */
  public static async purgeLegacyRecord(): Promise<void> {
    await this.clearLegacyRecord();
  }

  private static dataUrlToBlob(dataUrl: string): Blob {
    const [header, encoded] = dataUrl.split(',');
    const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  private static readLegacyLocalStorage(): Notebook[] | null {
    try {
      const data = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  private static async clearLegacyRecord(): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    const tx = db.transaction(LEGACY_STORE_V1, 'readwrite');
    tx.objectStore(LEGACY_STORE_V1).delete(LEGACY_RECORD_KEY);
    await this.commit(tx);
  }

  // ---------------------------------------------------------------------------
  // Ghi
  // ---------------------------------------------------------------------------
  public static async saveNotebook(notebook: Notebook): Promise<SaveResult> {
    const db = await this.openDb();
    if (!db) return { ok: false, error: 'Thiết bị không hỗ trợ IndexedDB' };

    const tx = db.transaction(STORE_NOTEBOOKS, 'readwrite');
    tx.objectStore(STORE_NOTEBOOKS).put(this.stripRuntimeFields(notebook), notebook.id);
    return this.commit(tx);
  }

  public static async deleteNotebook(notebookId: string): Promise<SaveResult> {
    const db = await this.openDb();
    if (!db) return { ok: false, error: 'Thiết bị không hỗ trợ IndexedDB' };

    const tx = db.transaction(STORE_NOTEBOOKS, 'readwrite');
    tx.objectStore(STORE_NOTEBOOKS).delete(notebookId);
    return this.commit(tx);
  }

  public static async saveOrder(notebookIds: string[]): Promise<SaveResult> {
    const db = await this.openDb();
    if (!db) return { ok: false, error: 'Thiết bị không hỗ trợ IndexedDB' };

    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put(notebookIds, META_ORDER_KEY);
    return this.commit(tx);
  }

  /** Ghi một giá trị nhỏ vào store `meta` (mốc sao lưu, tuỳ chọn…) */
  public static async setMeta<T>(key: string, value: T): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put(value, key);
    await this.commit(tx);
  }

  public static async getMeta<T>(key: string): Promise<T | null> {
    const db = await this.openDb();
    if (!db) return null;
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    return this.request<T>(store, store.get(key));
  }

  private static async loadOrder(): Promise<string[]> {
    const db = await this.openDb();
    if (!db) return [];
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const order = await this.request<string[]>(store, store.get(META_ORDER_KEY));
    return order ?? [];
  }

  /** Xoá asset không còn sổ tay nào tham chiếu tới */
  public static async collectGarbage(notebooks: Notebook[]): Promise<number> {
    const referenced = new Set<string>();
    notebooks.forEach(nb =>
      nb.pages.forEach(page => {
        if (page.pdfAssetId) referenced.add(page.pdfAssetId);
        page.imageElements.forEach(img => img.assetId && referenced.add(img.assetId));
        page.audioNotes.forEach(note => note.assetId && referenced.add(note.assetId));
      })
    );

    const all = await this.getAllAssetIds();
    const orphans = all.filter(id => !referenced.has(id));
    await this.deleteAssets(orphans);
    return orphans.length;
  }

  public static async estimateUsage(): Promise<{ usage: number; quota: number } | null> {
    try {
      if (navigator.storage?.estimate) {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        return { usage, quota };
      }
    } catch {
      /* bỏ qua */
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Dữ liệu mẫu lần chạy đầu
  // ---------------------------------------------------------------------------
  public static createInitialDefaultNotebooks(): Notebook[] {
    return [
      {
        id: 'nb-xiaomi-pad',
        title: 'Hướng Dẫn Sử Dụng PadNote AI - Xiaomi Pad',
        category: 'Học Tập',
        coverColor: 'from-indigo-600 to-blue-700',
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now(),
        defaultPaperSize: 'a4',
        defaultOrientation: 'portrait',
        pages: [
          {
            id: 'page-1',
            pageIndex: 0,
            template: 'grid',
            paperSize: 'a4',
            orientation: 'portrait',
            strokes: [
              {
                id: 's-welcome',
                tool: 'pen',
                color: '#4f46e5',
                size: 4,
                opacity: 1,
                points: [
                  { x: 140, y: 120, pressure: 0.7, time: Date.now() },
                  { x: 260, y: 120, pressure: 0.9, time: Date.now() + 10 },
                  { x: 200, y: 120, pressure: 0.8, time: Date.now() + 20 },
                  { x: 200, y: 190, pressure: 0.6, time: Date.now() + 30 }
                ]
              },
              {
                id: 's-highlight',
                tool: 'highlighter',
                color: '#f59e0b',
                size: 24,
                opacity: 0.4,
                points: [
                  { x: 120, y: 155, pressure: 1, time: Date.now() },
                  { x: 420, y: 155, pressure: 1, time: Date.now() + 20 }
                ]
              }
            ],
            textElements: [
              {
                id: 't-welcome',
                x: 120,
                y: 190,
                width: 480,
                height: 90,
                text: 'PadNote AI - Sổ tay số Tiếng Việt cho Tablet',
                fontFamily: "'Caveat', cursive",
                fontSize: 32,
                color: '#1e293b'
              },
              {
                id: 't-tip',
                x: 120,
                y: 280,
                width: 520,
                height: 150,
                text: '✦ Dùng bút Xiaomi Pen viết tay tự nhiên\n✦ Khoanh vùng (Lasso) để nhận diện Tiếng Việt có dấu\n✦ Ctrl+Z hoàn tác, Ctrl+F tìm kiếm mọi sổ tay\n✦ Chèn ảnh, import PDF và ghi âm đồng bộ nét vẽ',
                fontFamily: "'Patrick Hand', cursive",
                fontSize: 22,
                color: '#475569'
              }
            ],
            imageElements: [],
            audioNotes: []
          }
        ]
      },
      {
        id: 'nb-planner',
        title: 'Kế Hoạch & Mục Tiêu Tuần',
        category: 'Công Việc',
        coverColor: 'from-emerald-600 to-teal-700',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now(),
        defaultPaperSize: 'a4',
        defaultOrientation: 'portrait',
        pages: [
          {
            id: 'page-planner-1',
            pageIndex: 0,
            template: 'cornell',
            paperSize: 'a4',
            orientation: 'portrait',
            strokes: [],
            textElements: [
              {
                id: 't-planner-header',
                x: 200,
                y: 60,
                width: 400,
                height: 50,
                text: 'Cornell Notes: Mục tiêu tuần mới',
                fontFamily: "'Dancing Script', cursive",
                fontSize: 28,
                color: '#0f172a'
              }
            ],
            imageElements: [],
            audioNotes: []
          }
        ]
      },
      {
        id: 'nb-dark-ideas',
        title: 'Ý Tưởng Sáng Tạo - Dark Neon',
        category: 'Thiết Kế',
        coverColor: 'from-purple-600 to-pink-700',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        defaultPaperSize: 'tablet',
        defaultOrientation: 'landscape',
        pages: [
          {
            id: 'page-dark-1',
            pageIndex: 0,
            template: 'dark-neon',
            paperSize: 'tablet',
            orientation: 'landscape',
            strokes: [
              {
                id: 's-neon-1',
                tool: 'highlighter',
                color: '#10b981',
                size: 28,
                opacity: 0.5,
                points: [
                  { x: 150, y: 150, pressure: 1, time: Date.now() },
                  { x: 450, y: 150, pressure: 1, time: Date.now() + 10 }
                ]
              }
            ],
            textElements: [
              {
                id: 't-neon',
                x: 160,
                y: 135,
                width: 400,
                height: 60,
                text: 'Nét bút Dạ Quang Neon trên nền tối',
                fontFamily: "'Caveat', cursive",
                fontSize: 30,
                color: '#34d399'
              }
            ],
            imageElements: [],
            audioNotes: []
          }
        ]
      }
    ];
  }
}
