import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, BookOpen, FileText, PenLine, Image as ImageIcon, AudioLines, CornerDownLeft } from 'lucide-react';
import { Notebook } from '../types/notebook';

interface SearchModalProps {
  isOpen: boolean;
  notebooks: Notebook[];
  onJump: (notebookId: string, pageIndex: number) => void;
  onClose: () => void;
}

interface SearchHit {
  notebookId: string;
  notebookTitle: string;
  category: string;
  pageIndex: number;
  snippet: string;
  matchedIn: 'title' | 'text';
  strokeCount: number;
  imageCount: number;
  audioCount: number;
}

/**
 * Chuẩn hoá tiếng Việt để tìm kiếm không phụ thuộc dấu:
 * "hoc tap" vẫn khớp "Học Tập". Chữ đ/Đ không tách được bằng NFD nên xử lý riêng.
 */
const normalizeVi = (input: string): string =>
  input
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Cắt đoạn văn bản quanh vị trí khớp để hiển thị ngữ cảnh. */
const buildSnippet = (text: string, normalizedQuery: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  const position = normalizeVi(flat).indexOf(normalizedQuery);
  if (position < 0) return flat.slice(0, 90);

  const start = Math.max(0, position - 30);
  const end = Math.min(flat.length, position + normalizedQuery.length + 60);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
};

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, notebooks, onJump, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      // Chờ modal vào DOM rồi mới focus
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [isOpen]);

  const hits = useMemo<SearchHit[]>(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) return [];

    const needle = normalizeVi(trimmed);
    const results: SearchHit[] = [];

    notebooks.forEach(nb => {
      const titleMatches =
        normalizeVi(nb.title).includes(needle) || normalizeVi(nb.category || '').includes(needle);

      nb.pages.forEach((page, pageIndex) => {
        const matchingTexts = page.textElements.filter(t => normalizeVi(t.text || '').includes(needle));

        const base = {
          notebookId: nb.id,
          notebookTitle: nb.title,
          category: nb.category,
          pageIndex,
          strokeCount: page.strokes.length,
          imageCount: page.imageElements?.length || 0,
          audioCount: page.audioNotes?.length || 0
        };

        if (matchingTexts.length > 0) {
          matchingTexts.forEach(t => {
            results.push({ ...base, matchedIn: 'text', snippet: buildSnippet(t.text, needle) });
          });
        } else if (titleMatches && pageIndex === 0) {
          // Khớp tên sổ tay: chỉ trả về một kết quả đại diện ở trang đầu
          results.push({
            ...base,
            matchedIn: 'title',
            snippet: page.textElements[0]?.text
              ? buildSnippet(page.textElements[0].text, needle)
              : 'Trang chưa có văn bản nhận diện'
          });
        }
      });
    });

    return results.slice(0, 60);
  }, [query, notebooks]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 bg-slate-950/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl glass-panel rounded-2xl border border-slate-700 shadow-2xl animate-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ô nhập từ khoá */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && hits.length > 0) {
                onJump(hits[0].notebookId, hits[0].pageIndex);
                onClose();
              }
            }}
            placeholder="Tìm trong mọi sổ tay… (không cần dấu: hoc tap, ke hoach)"
            className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-500 text-sm font-medium"
          />
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Kết quả */}
        <div className="max-h-[55vh] overflow-y-auto">
          {query.trim().length === 0 && (
            <div className="px-5 py-8 text-center text-slate-500 text-xs space-y-2">
              <p className="font-semibold text-slate-400">Tìm theo tên sổ tay, danh mục hoặc nội dung chữ đã nhận diện</p>
              <p>Chữ viết tay chưa chuyển thành text sẽ không tìm được — hãy dùng Lasso → Đổi Font Chữ trước.</p>
            </div>
          )}

          {query.trim().length > 0 && hits.length === 0 && (
            <div className="px-5 py-8 text-center text-slate-500 text-sm">
              Không tìm thấy kết quả cho “<span className="text-slate-300 font-semibold">{query}</span>”
            </div>
          )}

          {hits.map((hit, index) => (
            <button
              key={`${hit.notebookId}-${hit.pageIndex}-${index}`}
              onClick={() => {
                onJump(hit.notebookId, hit.pageIndex);
                onClose();
              }}
              className="w-full text-left px-4 py-3 border-b border-slate-800/70 hover:bg-indigo-600/15 transition group flex items-start gap-3"
            >
              <div className="p-2 rounded-lg bg-slate-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition shrink-0 mt-0.5">
                {hit.matchedIn === 'title' ? <BookOpen className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-white truncate max-w-[240px]">{hit.notebookTitle}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-indigo-400 font-semibold">{hit.category}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400 shrink-0">Trang {hit.pageIndex + 1}</span>
                </div>

                <p className="text-sm text-slate-300 mt-1 line-clamp-2">{hit.snippet}</p>

                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><PenLine className="w-3 h-3" />{hit.strokeCount} nét</span>
                  {hit.imageCount > 0 && (
                    <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" />{hit.imageCount} ảnh</span>
                  )}
                  {hit.audioCount > 0 && (
                    <span className="flex items-center gap-1 text-rose-400"><AudioLines className="w-3 h-3" />{hit.audioCount} bản ghi</span>
                  )}
                </div>
              </div>

              <CornerDownLeft className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition shrink-0 mt-1" />
            </button>
          ))}
        </div>

        {/* Chân modal */}
        <div className="px-4 py-2.5 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span>{hits.length > 0 ? `${hits.length} kết quả` : 'Ctrl + F để mở nhanh'}</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">Enter</kbd>
            <span>mở kết quả đầu</span>
            <kbd className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">Esc</kbd>
            <span>đóng</span>
          </span>
        </div>
      </div>
    </div>
  );
};
