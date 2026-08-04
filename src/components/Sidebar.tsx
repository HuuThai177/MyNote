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
  Sparkles,
  Palette
} from 'lucide-react';
import { Notebook, PaperTemplate } from '../types/notebook';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  notebooks: Notebook[];
  activeNotebookId: string;
  onSelectNotebook: (id: string) => void;
  onCreateNotebook: (title: string, category: string, template: PaperTemplate) => void;
  onDeleteNotebook: (id: string) => void;
  currentPageIndex: number;
  onSelectPage: (index: number) => void;
  onChangePageTemplate: (template: PaperTemplate) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
}

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
  onDeletePage
}) => {
  const [activeTab, setActiveTab] = useState<'notebooks' | 'pages' | 'templates'>('notebooks');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Học Tập');
  const [newTemplate, setNewTemplate] = useState<PaperTemplate>('grid');

  const currentNotebook = notebooks.find(n => n.id === activeNotebookId);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreateNotebook(newTitle.trim(), newCategory, newTemplate);
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
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
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
                    <div className={`w-full h-32 rounded-lg border border-slate-600 overflow-hidden flex items-center justify-center ${pg.template === 'dark-neon' ? 'paper-dark-neon' : 'bg-white text-slate-800'}`}>
                      <span className="text-xs font-semibold text-slate-400">Trang {index + 1}</span>
                    </div>
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

          {/* TAB 3: PAPER TEMPLATES */}
          {activeTab === 'templates' && (
            <div className="space-y-3">
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
