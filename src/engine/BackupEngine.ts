import { zip, unzip, strToU8, strFromU8, Zippable, Unzipped } from 'fflate';
import { Notebook } from '../types/notebook';
import { StorageEngine, StoredAsset } from './StorageEngine';

const BACKUP_FORMAT = 'padnote-backup';
const BACKUP_VERSION = 2;
const MANIFEST_NAME = 'manifest.json';
const ASSET_DIR = 'assets/';

interface AssetEntry {
  id: string;
  kind: StoredAsset['kind'];
  mime: string;
}

interface BackupManifest {
  format: string;
  version: number;
  createdAt: number;
  notebookCount: number;
  notebooks: Notebook[];
  assets: AssetEntry[];
}

export interface BackupSummary {
  notebooks: number;
  assets: number;
  bytes: number;
}

export interface RestoreResult {
  notebooks: Notebook[];
  assetsRestored: number;
}

export class BackupRestoreError extends Error {}

/**
 * Sao lưu / khôi phục toàn bộ thư viện thành MỘT file .zip.
 *
 * Chọn ZIP thay vì một file JSON khổng lồ vì ảnh, ghi âm và ảnh nền PDF được
 * lưu nguyên dạng nhị phân. Nhét chúng vào JSON phải mã hoá base64, làm phình
 * thêm ~33% và ngốn RAM khi thư viện lớn.
 *
 * Các tệp nhị phân vốn đã nén sẵn (JPEG/PNG/webm) nên ZIP dùng mức nén 0 cho
 * chúng — nén lại chỉ tốn thời gian mà gần như không giảm được byte nào.
 */
export class BackupEngine {
  private static readonly EXTENSION_BY_MIME: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg'
  };

  /** Bỏ Object URL khỏi bản sao lưu — chúng chỉ có nghĩa trong phiên đã tạo ra */
  private static stripRuntime(notebook: Notebook): Notebook {
    return {
      ...notebook,
      pages: notebook.pages.map(page => ({
        ...page,
        pdfDataUrl: page.pdfAssetId ? undefined : page.pdfDataUrl,
        imageElements: page.imageElements.map(img => (img.assetId ? { ...img, src: '' } : img)),
        audioNotes: page.audioNotes.map(note => (note.assetId ? { ...note, url: undefined } : note))
      }))
    };
  }

  private static collectAssetIds(notebooks: Notebook[]): string[] {
    const ids = new Set<string>();
    notebooks.forEach(nb =>
      nb.pages.forEach(page => {
        if (page.pdfAssetId) ids.add(page.pdfAssetId);
        page.imageElements.forEach(img => img.assetId && ids.add(img.assetId));
        page.audioNotes.forEach(note => note.assetId && ids.add(note.assetId));
      })
    );
    return Array.from(ids);
  }

  public static async createBackup(
    notebooks: Notebook[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ blob: Blob; summary: BackupSummary }> {
    const assetIds = this.collectAssetIds(notebooks);
    const entries: AssetEntry[] = [];
    const files: Zippable = {};

    for (let i = 0; i < assetIds.length; i++) {
      onProgress?.(i, assetIds.length);
      const asset = await StorageEngine.getAsset(assetIds[i]);
      if (!asset?.blob) continue;

      const bytes = new Uint8Array(await asset.blob.arrayBuffer());
      const mime = asset.blob.type || 'application/octet-stream';

      entries.push({ id: asset.id, kind: asset.kind, mime });
      // level 0 = chỉ đóng gói, không nén lại dữ liệu vốn đã nén
      files[`${ASSET_DIR}${asset.id}`] = [bytes, { level: 0 }];
    }

    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      notebookCount: notebooks.length,
      notebooks: notebooks.map(nb => this.stripRuntime(nb)),
      assets: entries
    };

    files[MANIFEST_NAME] = [strToU8(JSON.stringify(manifest)), { level: 6 }];

    const zipped = await new Promise<Uint8Array>((resolve, reject) => {
      zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)));
    });

    onProgress?.(assetIds.length, assetIds.length);
    const blob = new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });

    return {
      blob,
      summary: { notebooks: notebooks.length, assets: entries.length, bytes: blob.size }
    };
  }

  public static suggestFileName(): string {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    return `PadNote-SaoLuu-${stamp}.zip`;
  }

  private static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.slice(result.indexOf(',') + 1)); // bỏ tiền tố data:...;base64,
      };
      reader.onerror = () => reject(new Error('Không đọc được dữ liệu sao lưu'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Đưa file sao lưu ra ngoài ứng dụng.
   *
   * QUAN TRỌNG: trên bản đóng gói Android, trang chạy trong Android WebView chứ
   * không phải trình duyệt Chrome. WebView KHÔNG có Web Share API, và thẻ
   * `<a download>` cũng không được nối với trình quản lý tải xuống — cả hai đều
   * lặng lẽ không làm gì. Vì vậy khi chạy native phải đi qua plugin Capacitor:
   * ghi file thật bằng Filesystem rồi mở khay chia sẻ hệ thống bằng Share.
   *
   * Trên trình duyệt desktop thì ngược lại, dùng đường web bình thường.
   */
  public static async deliverBackup(
    blob: Blob,
    fileName: string
  ): Promise<'shared' | 'downloaded' | 'saved'> {
    const { Capacitor } = await import('@capacitor/core');

    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      const data = await this.blobToBase64(blob);
      const written = await Filesystem.writeFile({
        path: fileName,
        data,
        directory: Directory.Cache
      });

      try {
        await Share.share({
          title: 'Sao lưu PadNote AI',
          text: 'Bản sao lưu toàn bộ sổ tay PadNote AI',
          url: written.uri,
          dialogTitle: 'Lưu bản sao lưu vào…'
        });
        return 'shared';
      } catch (e: any) {
        // Người dùng đóng khay chia sẻ: file vẫn đã được ghi ra
        if (String(e?.message ?? '').toLowerCase().includes('cancel')) return 'saved';
        throw e;
      }
    }

    // --- Đường web (desktop) ---
    const file = new File([blob], fileName, { type: 'application/zip' });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try {
        await navigator.share({ files: [file], title: 'Sao lưu PadNote AI' });
        return 'shared';
      } catch (e: any) {
        if (e?.name === 'AbortError') return 'shared';
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  }

  public static pickBackupFile(): Promise<File | null> {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,application/zip';
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  /**
   * Đọc file sao lưu, ghi asset trở lại IndexedDB và trả về danh sách sổ tay
   * đã dựng lại Object URL, sẵn sàng đưa vào state.
   */
  public static async restoreBackup(file: File): Promise<RestoreResult> {
    const bytes = new Uint8Array(await file.arrayBuffer());

    const unzipped = await new Promise<Unzipped>((resolve, reject) => {
      unzip(bytes, (err, data) => (err ? reject(new BackupRestoreError('File không phải định dạng ZIP hợp lệ')) : resolve(data)));
    });

    const manifestRaw = unzipped[MANIFEST_NAME];
    if (!manifestRaw) {
      throw new BackupRestoreError('Không tìm thấy manifest — đây không phải file sao lưu của PadNote AI.');
    }

    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(strFromU8(manifestRaw));
    } catch {
      throw new BackupRestoreError('Manifest trong file sao lưu bị hỏng.');
    }

    if (manifest.format !== BACKUP_FORMAT) {
      throw new BackupRestoreError('File này không phải bản sao lưu của PadNote AI.');
    }
    if (manifest.version > BACKUP_VERSION) {
      throw new BackupRestoreError(
        `Bản sao lưu tạo bởi phiên bản mới hơn (v${manifest.version}). Hãy cập nhật ứng dụng rồi thử lại.`
      );
    }
    if (!Array.isArray(manifest.notebooks) || manifest.notebooks.length === 0) {
      throw new BackupRestoreError('Bản sao lưu không chứa sổ tay nào.');
    }

    // Ghi asset trước, để khi dựng sổ tay là đã có sẵn Blob
    const urlByAssetId = new Map<string, string>();
    let assetsRestored = 0;

    for (const entry of manifest.assets ?? []) {
      const raw = unzipped[`${ASSET_DIR}${entry.id}`];
      if (!raw) continue;

      const blob = new Blob([raw as unknown as BlobPart], { type: entry.mime });
      const url = await StorageEngine.putAsset(entry.id, blob, entry.kind);
      urlByAssetId.set(entry.id, url);
      assetsRestored++;
    }

    const notebooks: Notebook[] = manifest.notebooks.map(nb => ({
      ...nb,
      pages: nb.pages.map(page => ({
        ...page,
        pdfDataUrl: page.pdfAssetId ? urlByAssetId.get(page.pdfAssetId) : page.pdfDataUrl,
        imageElements: page.imageElements.map(img =>
          img.assetId ? { ...img, src: urlByAssetId.get(img.assetId) ?? img.src } : img
        ),
        audioNotes: page.audioNotes.map(note =>
          note.assetId ? { ...note, url: urlByAssetId.get(note.assetId) } : note
        )
      }))
    }));

    return { notebooks, assetsRestored };
  }

  public static formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
