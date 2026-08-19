import { ToolType } from '../types/notebook';

export interface PenPreset {
  id: string;
  tool: ToolType;
  color: string;
  size: number;
}

const PRESET_KEY = 'padnote_pen_presets';
const RECENT_COLOR_KEY = 'padnote_recent_colors';
const MAX_PRESETS = 8;
const MAX_RECENT_COLORS = 8;

const DEFAULT_PRESETS: PenPreset[] = [
  { id: 'p-ink', tool: 'pen', color: '#1e293b', size: 4 },
  { id: 'p-note', tool: 'pen', color: '#4f46e5', size: 4 },
  { id: 'p-fix', tool: 'pen', color: '#e11d48', size: 2 },
  { id: 'p-mark', tool: 'highlighter', color: '#f59e0b', size: 24 }
];

/**
 * Bút yêu thích và màu vừa dùng, giữ trong localStorage.
 *
 * Dữ liệu chỉ vài trăm byte và cần đọc được ngay lúc dựng giao diện, nên
 * localStorage hợp hơn IndexedDB (không phải chờ bất đồng bộ).
 */
export class PenPresets {
  private static read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private static write(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Không lưu được tuỳ chọn bút:', e);
    }
  }

  // ---- Bút yêu thích ----
  static load(): PenPreset[] {
    const stored = this.read<PenPreset[]>(PRESET_KEY, []);
    return stored.length > 0 ? stored : DEFAULT_PRESETS;
  }

  static add(presets: PenPreset[], preset: Omit<PenPreset, 'id'>): PenPreset[] {
    // Trùng hoàn toàn thì không thêm nữa
    const duplicate = presets.some(
      p => p.tool === preset.tool && p.color === preset.color && p.size === preset.size
    );
    if (duplicate) return presets;

    const next = [
      ...presets,
      { ...preset, id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}` }
    ].slice(-MAX_PRESETS);

    this.write(PRESET_KEY, next);
    return next;
  }

  static remove(presets: PenPreset[], id: string): PenPreset[] {
    const next = presets.filter(p => p.id !== id);
    this.write(PRESET_KEY, next);
    return next;
  }

  // ---- Màu vừa dùng ----
  static loadRecentColors(): string[] {
    return this.read<string[]>(RECENT_COLOR_KEY, []);
  }

  static pushRecentColor(colors: string[], color: string): string[] {
    const normalized = color.toLowerCase();
    const next = [normalized, ...colors.filter(c => c.toLowerCase() !== normalized)].slice(
      0,
      MAX_RECENT_COLORS
    );
    this.write(RECENT_COLOR_KEY, next);
    return next;
  }
}
