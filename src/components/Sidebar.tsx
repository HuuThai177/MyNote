import React, { useState } from 'react';
import { 
  X, 
  Plus, 
  BookOpen, 
  Trash2, 
  Layers, 
  FileText, 
  Check, 
  Grid, 
  FileUp,
  FolderPlus,
  Ruler,
  RectangleHorizontal,
  RectangleVertical,
  Layers2,
  ShieldCheck,
  ShieldAlert,
  CloudUpload,
  CloudDownload,
  Loader2
} from 'lucide-react';
import {
  Notebook,
  PaperTemplate,
  PaperSizeId,
  PaperOrientation,
  PAPER_SIZES,
  DEFAULT_PAPER_SIZE,
  DEFAULT_ORIENTATION
} from '../types/notebook';
import { PageThumbnail } from './PageThumbnail';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  notebooks: Notebook[];
  activeNotebookId: string;
  onSelectNotebook: (id: string) => void;
  onCreateNotebook: (
    title: string,
    category: string,
    template: PaperTemplate,
    paperSize: PaperSizeId,
    orientation: PaperOrientation
  ) => void;
  onDeleteNotebook: (id: string) => void;
  currentPageIndex: number;
  onSelectPage: (index: number) => void;
  onChangePageTemplate: (template: PaperTemplate) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  // Khổ giấy
  currentPaperSize: PaperSizeId;
  currentOrientation: PaperOrientation;
  onChangePageSize: (paperSize: PaperSizeId, orientation: PaperOrientation) => void;
  onApplyPageSizeToNotebook: (paperSize: PaperSizeId, orientation: PaperOrientation) => void;
  // Sao lưu toàn bộ thư viện
  onCreateBackup: () => void;
  onRestoreBackup: () => void;
  isBackupBusy: boolean;
  /** Mốc sao lưu gần nhất; null = chưa bao giờ sao lưu */
  lastBackupAt: number | null;
}

/** Sao lưu thủ công thì cái chết người là quên — nên phải nói rõ đã bao lâu */
const describeBackupAge = (
  timestamp: number | null
): { text: string; level: 'never' | 'fresh' | 'stale' | 'old' } => {
  if (!timestamp) return { text: 'Chưa sao lưu lần nào', level: 'never' };

  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days <= 0) return { text: 'Đã sao lưu hôm nay', level: 'fresh' };
  if (days === 1) return { text: 'Sao lưu lần cuối: hôm qua', level: 'fresh' };
  if (days < 7) return { text: `Sao lưu lần cuối: ${days} ngày trước`, level: 'fresh' };
  if (days < 30) return { text: `Sao lưu lần cuối: ${days} ngày trước`, level: 'stale' };
  return { text: `Sao lưu lần cuối: ${Math.floor(days / 30)} tháng trước`, level: 'old' };
};

const TEMPLATES: { id: PaperTemplate; name: string; previewClass: string }[] = [
  { id: 'ruled', name: 'Giấy Kẻ Ngang', previewClass: 'paper-ruled' },
  { id: 'grid', name: 'Giấy Ô Vuông (Graph)', previewClass: 'paper-grid' },
  { id: 'dot', name: 'Giấy Chấm (Dot Grid)', previewClass: 'paper-dot' },
  { id: 'blank', name: 'Giấy Trắng (Blank)', previewClass: 'paper-blank' },
  { id: 'cornell', name: 'Cornell Notes', previewClass: 'paper-cornell' },
  { id: 'dark-neon', name: 'Dark Mode Neon', previewClass: 'paper-dark-neon' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  notebooks,
  activeNotebookId,
  onSelectNotebook,
  onCreateNotebook,
  onDeleteNotebook,
  currentPageIndex,
  onSelectPage,
  onChangePageTemplate,
  onAddPage,
  onDeletePage,
  currentPaperSize,
  currentOrientation,
  onChangePageSize,
  onApplyPageSizeToNotebook,
  onCreateBackup,
  onRestoreBackup,
  isBackupBusy,
  lastBackupAt
}) => {
  const backupAge = describeBackupAge(lastBackupAt);
  const [activeTab, setActiveTab] = useState<'notebooks' | 'pages' | 'templates'>('notebooks');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Học Tập');
  const [newTemplate, setNewTemplate] = useState<PaperTemplate>('grid');
  const [newPaperSize, setNewPaperSize] = useState<PaperSizeId>(DEFAULT_PAPER_SIZE);
  const [newOrientation, setNewOrientation] = useState<PaperOrientation>(DEFAULT_ORIENTATION);

  const currentNotebook = notebooks.find(n => n.id === activeNotebookId);
  const activeSpec = PAPER_SIZES.find(s => s.id === currentPaperSize);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreateNotebook(newTitle.trim(), newCategory, newTemplate, newPaperSize, newOrientation);
    setNewTitle('');
    setShowCreateModal(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Drawer Container */}
      <div className="relative w-80 sm:w-96 h-full glass-panel border-r border-slate-700/70 shadow-2xl flex flex-col z-10 animate-pop">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-400" />
            <span className="font-bold text-lg text-white">PadNote AI</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="p-2 m-3 bg-slate-900/80 rounded-xl border border-slate-800 flex gap-1">
          <button
            onClick={() => setActiveTab('notebooks')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'notebooks' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Sổ Tay ({notebooks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('pages')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'pages' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Trang ({currentNotebook?.pages.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'templates' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Mẫu Giấy</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {/* TAB 1: NOTEBOOKS */}
          {activeTab === 'notebooks' && (
            <div className="space-y-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition"
              >
                <FolderPlus className="w-5 h-5" />
                <span>Tạo Sổ Tay Mới</span>
              </button>

              <div className="space-y-2 mt-3">
                {notebooks.map((nb) => (
                  <div
                    key={nb.id}
                    onClick={() => {
                      onSelectNotebook(nb.id);
                      onClose();
                    }}
                    className={`group p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                      nb.id === activeNotebookId
                        ? 'bg-indigo-950/60 border-indigo-500/60 text-white shadow-md'
                        : 'glass-card text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-12 rounded-lg bg-gradient-to-br ${nb.coverColor || 'from-indigo-600 to-purple-600'} flex items-center justify-center shadow-md`}>
                        <BookOpen className="w-5 h-5 text-white/90" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm line-clamp-1">{nb.title}</h4>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span className="text-indigo-400 font-medium">{nb.category}</span>
                          <span>•</span>
                          <span>{nb.pages.length} trang</span>
                        </div>
                      </div>
                    </div>

                    {notebooks.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Bạn có chắc muốn xóa sổ tay "${nb.title}"?`)) {
                            onDeleteNotebook(nb.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                        title="Xóa sổ tay"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: PAGES THUMBNAILS */}
          {activeTab === 'pages' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {currentNotebook?.pages.map((pg, index) => (
                  <div
                    key={pg.id}
                    onClick={() => {
                      onSelectPage(index);
                      onClose();
                    }}
                    className={`relative rounded-xl border p-2 transition cursor-pointer flex flex-col items-center gap-2 ${
                      index === currentPageIndex
                        ? 'bg-indigo-950/80 border-indigo-500 ring-2 ring-indigo-500/40'
                        : 'glass-card border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <PageThumbnail page={pg} width={150} />
                    <div className="w-full flex items-center justify-between text-xs px-1 text-slate-300">
                      <span>Trang {index + 1}</span>
                      {currentNotebook.pages.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePage(index);
                          }}
                          className="text-slate-400 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={onAddPage}
                className="w-full py-3 rounded-xl border border-dashed border-indigo-500/50 hover:bg-indigo-600/10 text-indigo-300 font-semibold text-xs flex items-center justify-center gap-2 transition mt-2"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Trang Mới</span>
              </button>
            </div>
          )}

          {/* TAB 3: PAPER TEMPLATES & SIZE */}
          {activeTab === 'templates' && (
            <div className="space-y-3">
              {/* KHỔ GIẤY */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Ruler className="w-4 h-4 text-emerald-400" />
                  <span>Kích cỡ trang giấy</span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {PAPER_SIZES.map((spec) => {
                    const isActive = currentPaperSize === spec.id;
                    const orientationForSpec = spec.supportsOrientation ? currentOrientation : 'portrait';
                    const isWide =
                      spec.supportsOrientation && orientationForSpec === 'landscape';
                    const displayWidth = isWide ? spec.height : spec.width;
                    const displayHeight = isWide ? spec.width : spec.height;
                    const previewScale = 34 / Math.max(displayWidth, displayHeight);

                    return (
                      <button
                        key={spec.id}
                        onClick={() => onChangePageSize(spec.id, orientationForSpec)}
                        className={`p-3 rounded-xl border transition flex items-center gap-3 text-left ${
                          isActive
                            ? 'bg-emerald-600/25 border-emerald-500 text-white'
                            : 'glass-card border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {/* Ô xem trước đúng tỉ lệ khổ giấy */}
                        <div className="w-10 h-10 flex items-center justify-center shrink-0">
                          <div
                            className={`border-2 rounded-sm ${
                              isActive ? 'border-emerald-400 bg-emerald-400/20' : 'border-slate-500 bg-slate-700/40'
                            }`}
                            style={{
                              width: `${Math.max(8, displayWidth * previewScale)}px`,
                              height: `${Math.max(8, displayHeight * previewScale)}px`
                            }}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold truncate">{spec.name}</h4>
                          <p className="text-[11px] text-slate-400 truncate">{spec.description}</p>
                        </div>

                        {isActive && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* HƯỚNG GIẤY */}
                {activeSpec?.supportsOrientation && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => onChangePageSize(currentPaperSize, 'portrait')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                        currentOrientation === 'portrait'
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <RectangleVertical className="w-4 h-4" />
                      <span>Khổ Dọc</span>
                    </button>
                    <button
                      onClick={() => onChangePageSize(currentPaperSize, 'landscape')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                        currentOrientation === 'landscape'
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <RectangleHorizontal className="w-4 h-4" />
                      <span>Khổ Ngang</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (confirm(`Áp khổ giấy này cho toàn bộ ${currentNotebook?.pages.length || 0} trang của sổ tay?`)) {
                      onApplyPageSizeToNotebook(currentPaperSize, currentOrientation);
                    }
                  }}
                  className="w-full py-2.5 rounded-xl border border-dashed border-emerald-500/50 hover:bg-emerald-600/10 text-emerald-300 font-semibold text-xs flex items-center justify-center gap-2 transition"
                >
                  <Layers2 className="w-4 h-4" />
                  <span>Áp cho toàn bộ sổ tay</span>
                </button>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Chuyển sang khổ nhỏ hơn có thể che phần nội dung nằm ngoài trang mới — dùng Ctrl+Z để hoàn tác nếu cần.
                </p>
              </div>

              <div className="h-px bg-slate-800 my-3" />

              <p className="text-xs text-slate-400 mb-2">Chọn mẫu giấy nền cho trang hiện tại:</p>
              <div className="grid grid-cols-1 gap-2.5">
                {TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => {
                      onChangePageTemplate(tmpl.id);
                      onClose();
                    }}
                    className={`p-3 rounded-xl border transition flex items-center gap-3 text-left ${
                      currentNotebook?.pages[currentPageIndex]?.template === tmpl.id
                        ? 'bg-indigo-600/30 border-indigo-500 text-white font-bold'
                        : 'glass-card border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg border border-slate-500 ${tmpl.previewClass}`} />
                    <span className="text-sm font-medium flex-1">{tmpl.name}</span>
                    {currentNotebook?.pages[currentPageIndex]?.template === tmpl.id && (
                      <Check className="w-5 h-5 text-indigo-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CHÂN: SAO LƯU & KHÔI PHỤC — luôn hiện ở mọi tab vì đây là thao tác
            cấp toàn bộ thư viện, không thuộc riêng sổ tay hay trang nào */}
        <div className="shrink-0 border-t border-slate-800 p-3 space-y-2">
          <div
            className={`flex items-center gap-1.5 text-[11px] font-bold px-0.5 ${
              backupAge.level === 'fresh'
                ? 'text-emerald-400'
                : backupAge.level === 'stale'
                  ? 'text-amber-400'
                  : 'text-rose-400'
            }`}
          >
            {backupAge.level === 'fresh' ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5" />
            )}
            <span>{backupAge.text}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onCreateBackup}
              disabled={isBackupBusy}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition"
              title="Đóng gói mọi sổ tay, ảnh và ghi âm thành một file zip rồi chia sẻ (chọn Google Drive để cất giữ)"
            >
              {isBackupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              <span>Sao lưu</span>
            </button>

            <button
              onClick={onRestoreBackup}
              disabled={isBackupBusy}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs disabled:opacity-50 transition"
              title="Chọn file .zip sao lưu để khôi phục lại sổ tay"
            >
              <CloudDownload className="w-4 h-4 text-indigo-400" />
              <span>Khôi phục</span>
            </button>
          </div>

          <p className="text-[10px] text-slate-500 leading-relaxed">
            Dữ liệu chỉ nằm trong bộ nhớ ứng dụng — gỡ app là mất. Hãy sao lưu định kỳ và
            chọn Google Drive ở khay chia sẻ.
          </p>
        </div>
      </div>

      {/* CREATE NOTEBOOK MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <form onSubmit={handleCreate} className="glass-panel w-full max-w-md rounded-2xl p-6 border border-slate-700 shadow-2xl animate-pop space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-indigo-400" />
              <span>Tạo Sổ Tay Mới</span>
            </h3>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Tên sổ tay</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ví dụ: Ghi Chú Học Tập Xiaomi Pad..."
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Danh mục</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 text-sm"
              >
                <option value="Học Tập">Học Tập</option>
                <option value="Công Việc">Công Việc</option>
                <option value="Thiết Kế">Thiết Kế</option>
                <option value="Lập Kế Hoạch">Lập Kế Hoạch</option>
                <option value="Cá Nhân">Cá Nhân</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Mẫu giấy ban đầu</label>
              <select
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value as PaperTemplate)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 text-sm"
              >
                {TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Kích cỡ trang</label>
                <select
                  value={newPaperSize}
                  onChange={(e) => setNewPaperSize(e.target.value as PaperSizeId)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 text-sm"
                >
                  {PAPER_SIZES.map(s => (
                    <option key={s.id} value={s.id}>{s.name.split(' (')[0]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Hướng giấy</label>
                <select
                  value={newOrientation}
                  onChange={(e) => setNewOrientation(e.target.value as PaperOrientation)}
                  disabled={!PAPER_SIZES.find(s => s.id === newPaperSize)?.supportsOrientation}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 text-sm disabled:opacity-50"
                >
                  <option value="portrait">Dọc</option>
                  <option value="landscape">Ngang</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition"
              >
                Tạo Sổ Tay
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
