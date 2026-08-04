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
  Code2,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { Notebook } from '../types/notebook';

interface HeaderBarProps {
  notebook: Notebook | null;
  currentPageIndex: number;
  totalPages: number;
  palmRejectionActive: boolean;
  onTogglePalmRejection: () => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
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
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
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
    <header className="h-16 w-full glass-panel px-4 flex items-center justify-between z-30 select-none border-b border-slate-800 shrink-0">
      {/* Left: Sidebar Toggle & Notebook Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition shadow-sm"
          title="Danh sách Sổ tay & Quản lý Trang"
        >
          <BookOpen className="w-5 h-5 text-indigo-400" />
          <span className="font-bold text-xs sm:text-sm">Sổ Tay</span>
        </button>

        <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block" />

        <div className="flex flex-col">
          <h1 className="text-sm sm:text-base font-bold text-white truncate max-w-[160px] sm:max-w-[240px]">
            {notebook ? notebook.title : 'Chưa chọn sổ tay'}
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="text-indigo-400 font-semibold">{notebook?.category || 'General'}</span>
            <span>•</span>
            <span>Trang {currentPageIndex + 1} / {totalPages}</span>
          </div>
        </div>
      </div>

      {/* Center: Page Controls, Zoom Controls & Status Badges */}
      <div className="flex items-center gap-2.5">
        {/* Palm Rejection Status Indicator */}
        <button
          onClick={onTogglePalmRejection}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
            palmRejectionActive
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="Chống tì tay (CHỈ nhận bút Stylus khi bật ON, loại bỏ hoàn toàn chạm tay)"
        >
          <ShieldCheck className={`w-4 h-4 ${palmRejectionActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
          <span className="hidden md:inline">
            {palmRejectionActive ? 'Stylus Only: ON' : 'Touch + Stylus'}
          </span>
        </button>

        {/* Canvas Page Zoom Controller */}
        <div className="flex items-center bg-slate-900/90 rounded-2xl border border-slate-800 p-1 shadow-inner text-xs">
          <button
            onClick={onZoomOut}
            className="p-1.5 rounded-xl text-slate-300 hover:bg-slate-800 transition"
            title="Thu nhỏ trang giấy"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetZoom}
            className="px-2 font-bold text-indigo-400 hover:text-indigo-300 transition"
            title="Đặt lại tỉ lệ 100%"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button
            onClick={onZoomIn}
            className="p-1.5 rounded-xl text-slate-300 hover:bg-slate-800 transition"
            title="Phóng to trang giấy"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Page Switcher Pill */}
        <div className="flex items-center bg-slate-900/90 rounded-2xl border border-slate-800 p-1 shadow-inner">
          <button
            onClick={onPrevPage}
            disabled={currentPageIndex === 0}
            className="p-1.5 rounded-xl text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="Trang trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-extrabold text-slate-200">
            {currentPageIndex + 1}
          </span>
          <button
            onClick={onNextPage}
            disabled={currentPageIndex >= totalPages - 1}
            className="p-1.5 rounded-xl text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="Trang sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onAddPage}
            className="p-1.5 ml-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-md shadow-indigo-600/30"
            title="Thêm trang mới"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Audio Recording Sync */}
        <button
          onClick={onToggleRecording}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border ${
            isRecording
              ? 'bg-rose-600 text-white border-rose-400 animate-pulse shadow-lg shadow-rose-600/40'
              : 'bg-slate-800/90 text-slate-200 border-slate-700 hover:bg-slate-700'
          }`}
          title="Ghi âm đồng bộ nét vẽ"
        >
          {isRecording ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-rose-400" />}
          <span className="hidden xl:inline">
            {isRecording ? formatTime(recordingTime) : 'Ghi Âm Sync'}
          </span>
        </button>

        {/* Import PDF */}
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
          title="Xuất trang (PDF / Markdown / TXT)"
        >
          <Download className="w-4 h-4 text-emerald-400" />
        </button>

        {/* Native Module Kotlin Guide */}
        <button
          onClick={onOpenNativeGuide}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs transition shadow-md shadow-indigo-600/30 border border-indigo-400/30"
          title="Xem Mã nguồn Kotlin Native Module cho Xiaomi Pad"
        >
          <Code2 className="w-4 h-4" />
          <span className="hidden xl:inline">Native ML Kit</span>
        </button>
      </div>
    </header>
  );
};
