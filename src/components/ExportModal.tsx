import React from 'react';
import { Download, FileText, FileCode, X, CheckCircle2 } from 'lucide-react';
import { NotebookPage, Notebook } from '../types/notebook';

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
  if (!isOpen || !page) return null;

  const title = notebook?.title || 'Ghi_Chu';
  const pageNum = currentPageIndex + 1;

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

    const mdContent = textLines.join('\n');
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}_Trang_${pageNum}.md`;
    link.click();
    URL.revokeObjectURL(url);
    onClose();
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
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}_Trang_${pageNum}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  // 3. Export as PDF
  const handleExportPdf = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      alert('Không thể tạo file PDF từ trang hiện tại.');
      return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    const windowContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - Trang ${pageNum}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; text-align: center; }
            img { max-width: 100%; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { margin-bottom: 16px; text-align: left; }
            .text-list { text-align: left; margin-top: 20px; font-size: 14px; color: #1F2937; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${title} (Trang ${pageNum})</h2>
            <p><strong>Ngày xuất:</strong> ${new Date().toLocaleString('vi-VN')}</p>
          </div>
          <img src="${dataUrl}" />
          <div class="text-list">
            <h3>Văn bản Tiếng Việt đã nhận diện:</h3>
            <ul>
              ${page.textElements.map(t => `<li>${t.text}</li>`).join('')}
            </ul>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(windowContent);
      printWindow.document.close();
    }
    onClose();
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
            className="w-full p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] hover:bg-indigo-50 hover:border-indigo-300 transition flex items-center justify-between text-left group"
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
        <div className="pt-2 border-t border-[#E5E7EB] flex justify-end">
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
