import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Plus,
  Mic,
  Square,
  FileUp,
  Download,
  Undo2,
  Redo2,
  Search,
  ImagePlus,
  AudioLines,
  Loader2
} from 'lucide-react';
import { Notebook } from '../types/notebook';

interface HeaderBarProps {
  notebook: Notebook | null;
  currentPageIndex: number;
  totalPages: number;
  paperSizeLabel: string;
  isRecording: boolean;
  recordingTime: number;
  onToggleRecording: () => void;
  onImportPdf: () => void;
  onExportPage: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onAddPage: () => void;
  onOpenSidebar: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSearch: () => void;
  onInsertImage: () => void;
  isImportingPdf: boolean;
  audioNoteCount: number;
  audioBarOpen: boolean;
  onToggleAudioBar: () => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const HeaderBar: React.FC<HeaderBarProps> = ({
  notebook,
  currentPageIndex,
  totalPages,
  paperSizeLabel,
  isRecording,
  recordingTime,
  onToggleRecording,
  onImportPdf,
  onExportPage,
  onPrevPage,
  onNextPage,
  onAddPage,
  onOpenSidebar,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenSearch,
  onInsertImage,
  isImportingPdf,
  audioNoteCount,
  audioBarOpen,
  onToggleAudioBar
}) => {
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const insertMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showInsertMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!insertMenuRef.current?.contains(event.target as Node)) setShowInsertMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showInsertMenu]);

  return (
    <header className="chrome-bar chrome-bar-top h-14 w-full border-b px-3 flex items-center justify-between gap-3 z-30 select-none shrink-0">
      {/* ---------- Trái: điều hướng & tiêu đề ---------- */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onOpenSidebar}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition shrink-0"
          title="Danh sách sổ tay & quản lý trang"
        >
          <BookOpen className="w-[18px] h-[18px] text-indigo-600" />
          <span className="font-bold text-xs hidden sm:inline">Sổ Tay</span>
        </button>

        <button
          onClick={onOpenSearch}
          className="chrome-btn w-9 h-9 border border-slate-200 shrink-0"
          title="Tìm kiếm mọi sổ tay (Ctrl + F)"
        >
          <Search className="w-[18px] h-[18px]" />
        </button>

        <div className="min-w-0 pl-1">
          <h1 className="text-sm font-bold text-slate-900 truncate max-w-[150px] lg:max-w-[280px] leading-tight">
            {notebook ? notebook.title : 'Chưa chọn sổ tay'}
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 leading-tight">
            <span className="text-indigo-600 font-semibold truncate">{notebook?.category || 'Chung'}</span>
            <span className="text-slate-300">·</span>
            <span className="font-medium">{paperSizeLabel}</span>
          </div>
        </div>
      </div>

      {/* ---------- Giữa: hoàn tác & trang ---------- */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="chrome-group flex items-center p-1">
          <button onClick={onUndo} disabled={!canUndo} className="chrome-btn w-8 h-8" title="Hoàn tác (Ctrl + Z)">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={onRedo} disabled={!canRedo} className="chrome-btn w-8 h-8" title="Làm lại (Ctrl + Shift + Z)">
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="chrome-group flex items-center p-1">
          <button
            onClick={onPrevPage}
            disabled={currentPageIndex === 0}
            className="chrome-btn w-8 h-8"
            title="Trang trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-1.5 text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap">
            {currentPageIndex + 1}<span className="text-slate-400 font-semibold"> / {totalPages}</span>
          </span>
          <button
            onClick={onNextPage}
            disabled={currentPageIndex >= totalPages - 1}
            className="chrome-btn w-8 h-8"
            title="Trang sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onAddPage}
            className="w-8 h-8 ml-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition shadow-sm"
            title="Thêm trang mới"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ---------- Phải: ghi âm, chèn, xuất ---------- */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Bản ghi âm của trang */}
        {audioNoteCount > 0 && (
          <button
            onClick={onToggleAudioBar}
            className={`relative w-9 h-9 rounded-xl border flex items-center justify-center transition ${
              audioBarOpen
                ? 'bg-rose-50 text-rose-600 border-rose-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title={`Trang này có ${audioNoteCount} bản ghi âm — bấm để nghe lại`}
          >
            <AudioLines className="w-[18px] h-[18px] text-rose-500" />
            <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
              {audioNoteCount}
            </span>
          </button>
        )}

        {/* Ghi âm đồng bộ nét vẽ */}
        <button
          onClick={onToggleRecording}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
            isRecording
              ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-200'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
          title="Ghi âm đồng bộ nét vẽ"
        >
          {isRecording ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="tabular-nums">{formatTime(recordingTime)}</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 text-rose-500" />
              <span className="hidden xl:inline">Ghi âm</span>
            </>
          )}
        </button>

        {/* Menu chèn nội dung — gom ảnh + PDF vào một chỗ */}
        <div className="relative" ref={insertMenuRef}>
          <button
            onClick={() => setShowInsertMenu(!showInsertMenu)}
            disabled={isImportingPdf}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
              showInsertMenu
                ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            } disabled:opacity-60`}
            title="Chèn ảnh hoặc tài liệu PDF"
          >
            {isImportingPdf ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <Plus className="w-4 h-4 text-indigo-600" />}
            <span className="hidden lg:inline">Chèn</span>
          </button>

          {showInsertMenu && (
            <div className="chrome-bar chrome-bar-float absolute top-12 right-0 w-60 rounded-2xl p-1.5 z-40 border animate-pop">
              <button
                onClick={() => {
                  setShowInsertMenu(false);
                  onInsertImage();
                }}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-slate-50 transition text-left"
              >
                <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700 shrink-0">
                  <ImagePlus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800">Chèn ảnh</p>
                  <p className="text-[11px] text-slate-500">Từ thư viện hoặc camera</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowInsertMenu(false);
                  onImportPdf();
                }}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-slate-50 transition text-left"
              >
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                  <FileUp className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800">Import PDF</p>
                  <p className="text-[11px] text-slate-500">Mỗi trang PDF thành một trang ghi chú</p>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Xuất trang */}
        <button
          onClick={onExportPage}
          className="chrome-btn w-9 h-9 border border-slate-200"
          title="Xuất trang (PDF / PNG / Markdown / TXT)"
        >
          <Download className="w-[18px] h-[18px] text-emerald-600" />
        </button>
      </div>
    </header>
  );
};
