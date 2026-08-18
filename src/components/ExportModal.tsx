import React, { useState } from 'react';
import { Download, FileText, FileCode, X, CheckCircle2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { NotebookPage, Notebook } from '../types/notebook';
import { PageRenderer } from '../engine/PageRenderer';
import { getPageDimensions } from '../engine/PageGeometry';

interface ExportModalProps {
  isOpen: boolean;
  notebook: Notebook | null;
  page: NotebookPage | null;
  currentPageIndex: number;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  notebook,
  page,
  currentPageIndex,
  onClose
}) => {
  const [isRendering, setIsRendering] = useState(false);

  if (!isOpen || !page) return null;

  const title = notebook?.title || 'Ghi_Chu';
  const pageNum = currentPageIndex + 1;

  /**
   * Làm phẳng trang thành một ảnh chứa ĐẦY ĐỦ nền PDF, ảnh chèn, nét mực và
   * khung chữ. Canvas trên giao diện chỉ chứa nét mực nên không dùng trực tiếp.
   */
  const renderFlattenedPage = async (): Promise<HTMLCanvasElement | null> => {
    // Xuất theo đúng khổ giấy của trang, không theo kích thước cửa sổ
    const dimensions = getPageDimensions(page);

    try {
      return await PageRenderer.renderPage(page, dimensions.width, dimensions.height);
    } catch (e) {
      console.error('Không làm phẳng được trang:', e);
      return null;
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 1. Export as Markdown (.md)
  const handleExportMarkdown = () => {
    const textLines: string[] = [];
    textLines.push(`# ${title} - Trang ${pageNum}`);
    textLines.push(`*Danh mục:* ${notebook?.category || 'Chung'}`);
    textLines.push(`*Thời gian xuất:* ${new Date().toLocaleString('vi-VN')}`);
    textLines.push('\n---');
    textLines.push('\n## Nội dung Chữ Tiếng Việt (AI Recognized):\n');

    if (page.textElements.length === 0) {
      textLines.push('_Chưa có văn bản nhận diện trên trang này._');
    } else {
      page.textElements.forEach((t, i) => {
        textLines.push(`### ${i + 1}. ${t.text}`);
      });
    }

    if (page.strokes.length > 0) {
      textLines.push(`\n\n*Trang ghi chú chứa ${page.strokes.length} nét vẽ tay vector.*`);
    }

    if (page.imageElements.length > 0) {
      textLines.push(`*Trang có ${page.imageElements.length} ảnh chèn (chỉ hiển thị trong bản PDF/PNG).*`);
    }
    if (page.audioNotes.length > 0) {
      textLines.push(`*Trang có ${page.audioNotes.length} bản ghi âm đồng bộ nét vẽ.*`);
    }

    const mdContent = textLines.join('\n');
    downloadBlob(new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' }), `${title}_Trang_${pageNum}.md`);
    onClose();
  };

  // Xuất ảnh PNG đầy đủ nội dung trang
  const handleExportPng = async () => {
    setIsRendering(true);
    try {
      const canvas = await renderFlattenedPage();
      if (!canvas) {
        alert('Không tạo được ảnh từ trang hiện tại.');
        return;
      }

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        alert('Không tạo được ảnh từ trang hiện tại.');
        return;
      }

      downloadBlob(blob, `${title}_Trang_${pageNum}.png`);
      onClose();
    } finally {
      setIsRendering(false);
    }
  };

  // 2. Export as Text (.txt)
  const handleExportTxt = () => {
    const textLines: string[] = [];
    textLines.push(`--- ${title} (Trang ${pageNum}) ---`);
    textLines.push(`Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}\n`);

    if (page.textElements.length === 0) {
      textLines.push('Không có văn bản nhận diện.');
    } else {
      page.textElements.forEach((t) => {
        textLines.push(t.text);
      });
    }

    const txtContent = textLines.join('\n');
    downloadBlob(new Blob([txtContent], { type: 'text/plain;charset=utf-8;' }), `${title}_Trang_${pageNum}.txt`);
    onClose();
  };

  // 3. Export as PDF (qua hộp thoại In của hệ thống)
  const handleExportPdf = async () => {
    setIsRendering(true);
    try {
      const canvas = await renderFlattenedPage();
      if (!canvas) {
        alert('Không thể tạo file PDF từ trang hiện tại.');
        return;
      }

      const dataUrl = canvas.toDataURL('image/png');
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Trình duyệt đã chặn cửa sổ in. Hãy cho phép pop-up rồi thử lại.');
        return;
      }

      // Trang in chỉ chứa đúng ảnh đã làm phẳng nên không mất ảnh hay khung chữ
      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="vi">
          <head>
            <meta charset="UTF-8" />
            <title>${title} - Trang ${pageNum}</title>
            <style>
              @page { size: auto ${canvas.width > canvas.height ? 'landscape' : 'portrait'}; margin: 12mm; }
              body { font-family: Arial, sans-serif; margin: 0; padding: 16px; }
              header { margin-bottom: 12px; }
              h2 { margin: 0 0 4px; font-size: 16px; color: #1F2937; }
              p { margin: 0; font-size: 12px; color: #6B7280; }
              img { display: block; width: 100%; height: auto; border: 1px solid #E5E7EB; border-radius: 8px; }
            </style>
          </head>
          <body>
            <header>
              <h2>${title} — Trang ${pageNum}</h2>
              <p>Danh mục: ${notebook?.category || 'Chung'} · Xuất ngày ${new Date().toLocaleString('vi-VN')}</p>
            </header>
            <img src="${dataUrl}" onload="window.focus(); window.print();" />
          </body>
        </html>
      `);
      printWindow.document.close();
      onClose();
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div 
        className="w-full max-w-md bg-white rounded-xl p-6 border border-[#E5E7EB] shadow-2xl animate-pop text-[#1F2937] space-y-5"
        style={{ borderRadius: '12px', backgroundColor: '#FFFFFF' }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-base">
            <Download className="w-5 h-5" />
            <span>Tùy Chọn Xuất File Linh Hoạt</span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Export Options */}
        <div className="space-y-3">
          {/* Export PDF Option */}
          <button
            onClick={handleExportPdf}
            disabled={isRendering}
            className="w-full p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] hover:bg-indigo-50 hover:border-indigo-300 transition flex items-center justify-between text-left group disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-[#1F2937]">Xuất File PDF (Chuẩn in & Ghi chú)</h4>
                <p className="text-xs text-gray-500">Giữ nguyên nét vẽ vector, hình ảnh & chữ Tiếng Việt</p>
              </div>
            </div>
            <CheckCircle2 className="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition" />
          </button>

          {/* Export PNG Option */}
          <button
            onClick={handleExportPng}
            disabled={isRendering}
            className="w-full p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] hover:bg-indigo-50 hover:border-indigo-300 transition flex items-center justify-between text-left group disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-purple-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white transition">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-[#1F2937]">Xuất Ảnh PNG (Chia sẻ nhanh)</h4>
                <p className="text-xs text-gray-500">Gộp nền PDF, ảnh chèn, nét mực & khung chữ vào một ảnh</p>
              </div>
            </div>
            <CheckCircle2 className="w-4 h-4 text-purple-500 opacity-0 group-hover:opacity-100 transition" />
          </button>

          {/* Export Markdown Option */}
          <button
            onClick={handleExportMarkdown}
            className="w-full p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] hover:bg-indigo-50 hover:border-indigo-300 transition flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-[#1F2937]">Xuất File Markdown (.md)</h4>
                <p className="text-xs text-gray-500">Chứa toàn bộ văn bản Tiếng Việt để dán vào Notion/Obsidian</p>
              </div>
            </div>
            <CheckCircle2 className="w-4 h-4 text-indigo-500 opacity-0 group-hover:opacity-100 transition" />
          </button>

          {/* Export Text Option */}
          <button
            onClick={handleExportTxt}
            className="w-full p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] hover:bg-indigo-50 hover:border-indigo-300 transition flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-[#1F2937]">Xuất File Text (.txt)</h4>
                <p className="text-xs text-gray-500">Văn bản thuần Tiếng Việt dán nhanh vào Email / Chat</p>
              </div>
            </div>
            <CheckCircle2 className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition" />
          </button>
        </div>

        {/* Modal Footer */}
        <div className="pt-2 border-t border-[#E5E7EB] flex justify-between items-center">
          {isRendering ? (
            <span className="flex items-center gap-2 text-xs font-semibold text-indigo-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Đang gộp nội dung trang…
            </span>
          ) : <span />}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 text-xs font-bold transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
