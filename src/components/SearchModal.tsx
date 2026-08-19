import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, BookOpen, FileText, PenLine, Image as ImageIcon, AudioLines, CornerDownLeft, Pencil, Info } from 'lucide-react';
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
  matchedIn: 'title' | 'text' | 'ink';
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

        // Chữ viết tay đã được nhận diện và lưu vào chỉ mục
        const inkText = page.inkIndex?.text || '';
        const inkMatches = inkText.length > 0 && normalizeVi(inkText).includes(needle);

        if (matchingTexts.length > 0) {
          matchingTexts.forEach(t => {
            results.push({ ...base, matchedIn: 'text', snippet: buildSnippet(t.text, needle) });
          });
          if (inkMatches) {
            results.push({ ...base, matchedIn: 'ink', snippet: buildSnippet(inkText, needle) });
          }
        } else if (inkMatches) {
          results.push({ ...base, matchedIn: 'ink', snippet: buildSnippet(inkText, needle) });
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

  // Trang có nét vẽ nhưng chưa đánh chỉ mục thì tìm kiếm không thấy được
  const pendingInkPages = notebooks.reduce(
    (count, nb) =>
      count +
      nb.pages.filter(p => (p.strokes?.length ?? 0) > 0 && !p.inkIndex).length,
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl chrome-bar chrome-bar-float rounded-2xl border border-slate-200 shadow-2xl animate-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ô nhập từ khoá */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200">
          <Search className="w-5 h-5 text-indigo-600 shrink-0" />
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
            className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400 text-sm font-medium"
          />
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Kết quả */}
        <div className="max-h-[55vh] overflow-y-auto">
          {query.trim().length === 0 && (
            <div className="px-5 py-8 text-center text-slate-400 text-xs space-y-2">
              <p className="font-semibold text-slate-400">
                Tìm theo tên sổ tay, danh mục, khung chữ và cả chữ viết tay
              </p>
              <p>Không cần gõ dấu: “hoc tap” vẫn khớp “Học Tập”.</p>
            </div>
          )}

          {query.trim().length > 0 && hits.length === 0 && (
            <div className="px-5 py-8 text-center text-slate-400 text-sm">
              Không tìm thấy kết quả cho “<span className="text-slate-700 font-semibold">{query}</span>”
            </div>
          )}

          {hits.map((hit, index) => (
            <button
              key={`${hit.notebookId}-${hit.pageIndex}-${index}`}
              onClick={() => {
                onJump(hit.notebookId, hit.pageIndex);
                onClose();
              }}
              className="w-full text-left px-4 py-3 border-b border-slate-200 hover:bg-indigo-50 transition group flex items-start gap-3"
            >
              <div className="p-2 rounded-lg bg-slate-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-slate-900 transition shrink-0 mt-0.5">
                {hit.matchedIn === 'title' ? (
                  <BookOpen className="w-4 h-4" />
                ) : hit.matchedIn === 'ink' ? (
                  <Pencil className="w-4 h-4" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-900 truncate max-w-[240px]">{hit.notebookTitle}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-indigo-600 font-semibold">{hit.category}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-400 shrink-0">Trang {hit.pageIndex + 1}</span>
                  {hit.matchedIn === 'ink' && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold shrink-0">
                      chữ viết tay
                    </span>
                  )}
                </div>

                <p className="text-sm text-slate-700 mt-1 line-clamp-2">{hit.snippet}</p>

                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><PenLine className="w-3 h-3" />{hit.strokeCount} nét</span>
                  {hit.imageCount > 0 && (
                    <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" />{hit.imageCount} ảnh</span>
                  )}
                  {hit.audioCount > 0 && (
                    <span className="flex items-center gap-1 text-rose-600"><AudioLines className="w-3 h-3" />{hit.audioCount} bản ghi</span>
                  )}
                </div>
              </div>

              <CornerDownLeft className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition shrink-0 mt-1" />
            </button>
          ))}
        </div>

        {/* Nhắc còn trang chưa đánh chỉ mục */}
        {pendingInkPages > 0 && query.trim().length > 0 && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 leading-snug">
              Còn <span className="font-bold">{pendingInkPages} trang</span> viết tay chưa đánh chỉ mục
              nên chưa tìm thấy được. Vào Sổ Tay → Chỉ mục tìm kiếm để đánh chỉ mục.
            </p>
          </div>
        )}

        {/* Chân modal */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
          <span>{hits.length > 0 ? `${hits.length} kết quả` : 'Ctrl + F để mở nhanh'}</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-400">Enter</kbd>
            <span>mở kết quả đầu</span>
            <kbd className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-400">Esc</kbd>
            <span>đóng</span>
          </span>
        </div>
      </div>
    </div>
  );
};
