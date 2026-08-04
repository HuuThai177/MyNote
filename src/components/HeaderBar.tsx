import React from 'react';
import { 
  BookOpen, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Mic, 
  MicOff, 
  FileUp, 
  Download, 
  Smartphone, 
  ShieldCheck, 
  Layers,
  Sparkles,
  Code2
} from 'lucide-react';
import { Notebook } from '../types/notebook';

interface HeaderBarProps {
  notebook: Notebook | null;
  currentPageIndex: number;
  totalPages: number;
  palmRejectionActive: boolean;
  onTogglePalmRejection: () => void;
  isRecording: boolean;
  recordingTime: number;
  onToggleRecording: () => void;
  onImportPdf: () => void;
  onExportPage: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onAddPage: () => void;
  onOpenSidebar: () => void;
  onOpenNativeGuide: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  notebook,
  currentPageIndex,
  totalPages,
  palmRejectionActive,
  onTogglePalmRejection,
  isRecording,
  recordingTime,
  onToggleRecording,
  onImportPdf,
  onExportPage,
  onPrevPage,
  onNextPage,
  onAddPage,
  onOpenSidebar,
  onOpenNativeGuide
}) => {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <header className="h-16 w-full glass-toolbar px-4 flex items-center justify-between z-30 select-none border-b border-slate-700/50">
      {/* Left: Sidebar Toggle & Notebook Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          title="Danh sách Sổ tay & Quản lý Trang"
        >
          <BookOpen className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold text-sm hidden sm:inline">Sổ Tay</span>
        </button>

        <div className="h-6 w-px bg-slate-700/80 mx-1 hidden sm:block" />

        <div className="flex flex-col">
          <h1 className="text-sm sm:text-base font-bold text-white truncate max-w-[200px] sm:max-w-[280px]">
            {notebook ? notebook.title : 'Chưa chọn sổ tay'}
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="text-indigo-400 font-medium">{notebook?.category || 'General'}</span>
            <span>•</span>
            <span>Trang {currentPageIndex + 1} / {totalPages}</span>
          </div>
        </div>
      </div>

      {/* Center: Page Controls & Status Badges */}
      <div className="flex items-center gap-2">
        {/* Palm Rejection Status Indicator */}
        <button
          onClick={onTogglePalmRejection}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
            palmRejectionActive
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="Chống chạm lòng bàn tay (Stylus Pointer Only)"
        >
          <ShieldCheck className={`w-4 h-4 ${palmRejectionActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
          <span className="hidden md:inline">
            {palmRejectionActive ? 'Palm Rejection: ON' : 'Palm Rejection: OFF'}
          </span>
        </button>

        {/* Xiaomi Smart Pen Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
          <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
          <span>Xiaomi Pen Ready</span>
        </div>

        {/* Page Switcher */}
        <div className="flex items-center bg-slate-800/90 rounded-xl border border-slate-700/80 p-1">
          <button
            onClick={onPrevPage}
            disabled={currentPageIndex === 0}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="Trang trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-bold text-slate-200">
            {currentPageIndex + 1}
          </span>
          <button
            onClick={onNextPage}
            disabled={currentPageIndex >= totalPages - 1}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="Trang sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onAddPage}
            className="p-1.5 ml-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
            title="Thêm trang mới"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right: Actions (Audio Sync, PDF Import, Native Module Guide, Export) */}
      <div className="flex items-center gap-2">
        {/* Audio Recording Button */}
        <button
          onClick={onToggleRecording}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition border ${
            isRecording
              ? 'bg-rose-500 text-white border-rose-400 animate-pulse shadow-lg shadow-rose-500/30'
              : 'bg-slate-800/90 text-slate-200 border-slate-700 hover:bg-slate-700'
          }`}
          title="Ghi âm đồng bộ nét vẽ"
        >
          {isRecording ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-rose-400" />}
          <span className="hidden sm:inline">
            {isRecording ? formatTime(recordingTime) : 'Ghi Âm Ink-Sync'}
          </span>
        </button>

        {/* PDF Import */}
        <button
          onClick={onImportPdf}
          className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          title="Import tài liệu PDF"
        >
          <FileUp className="w-4 h-4 text-blue-400" />
        </button>

        {/* Export Page */}
        <button
          onClick={onExportPage}
          className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          title="Xuất trang thành hình ảnh PNG"
        >
          <Download className="w-4 h-4 text-emerald-400" />
        </button>

        {/* Native Module Kotlin Guide */}
        <button
          onClick={onOpenNativeGuide}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs transition shadow-md shadow-indigo-500/20 border border-indigo-400/30"
          title="Xem Mã nguồn Kotlin Native Module cho Xiaomi Pad"
        >
          <Code2 className="w-4 h-4" />
          <span className="hidden xl:inline">Native ML Kit</span>
        </button>
      </div>
    </header>
  );
};
