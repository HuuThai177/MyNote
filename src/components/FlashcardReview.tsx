import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw, Trash2, GraduationCap, PartyPopper } from 'lucide-react';
import { Flashcard, FlashcardEngine, ReviewGrade } from '../engine/FlashcardEngine';

interface FlashcardReviewProps {
  isOpen: boolean;
  cards: Flashcard[];
  onGrade: (cardId: string, grade: ReviewGrade) => void;
  onDelete: (cardId: string) => void;
  onJumpToSource: (notebookId: string, pageIndex: number) => void;
  onClose: () => void;
}

const GRADES: { value: ReviewGrade; label: string; className: string }[] = [
  { value: 'forgot', label: 'Quên', className: 'bg-rose-600 hover:bg-rose-500' },
  { value: 'hard', label: 'Khó', className: 'bg-amber-600 hover:bg-amber-500' },
  { value: 'good', label: 'Được', className: 'bg-indigo-600 hover:bg-indigo-500' },
  { value: 'easy', label: 'Dễ', className: 'bg-emerald-600 hover:bg-emerald-500' }
];

/**
 * Màn hình ôn tập: mặt trước là chính nét chữ bạn đã viết, mặt sau là đáp án.
 *
 * Tự chấm sau khi lật thẻ. Mỗi nút hiện luôn khoảng cách tới lần ôn tiếp theo
 * để bạn thấy được hệ quả của lựa chọn, thay vì chấm mò.
 */
export const FlashcardReview: React.FC<FlashcardReviewProps> = ({
  isOpen,
  cards,
  onGrade,
  onDelete,
  onJumpToSource,
  onClose
}) => {
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const dueCards = useMemo(() => FlashcardEngine.getDue(cards), [cards]);
  const card = dueCards[0] ?? null;

  useEffect(() => {
    if (isOpen) setReviewedCount(0);
  }, [isOpen]);

  useEffect(() => {
    setFlipped(false);
  }, [card?.id]);

  if (!isOpen) return null;

  const handleGrade = (grade: ReviewGrade) => {
    if (!card) return;
    onGrade(card.id, grade);
    setReviewedCount(n => n + 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg chrome-bar chrome-bar-float rounded-2xl border overflow-hidden animate-pop"
        onClick={e => e.stopPropagation()}
      >
        {/* Đầu hộp */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-slate-900">Ôn tập</span>
            {dueCards.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                còn {dueCards.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="chrome-btn w-8 h-8">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!card ? (
          /* Hết thẻ đến hạn */
          <div className="px-6 py-12 text-center space-y-3">
            <PartyPopper className="w-12 h-12 text-emerald-500 mx-auto" />
            <p className="text-base font-bold text-slate-900">
              {reviewedCount > 0 ? `Xong ${reviewedCount} thẻ hôm nay!` : 'Chưa có thẻ nào tới hạn'}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              {cards.length === 0
                ? 'Khoanh vùng nét chữ trên trang rồi chọn "Tạo thẻ ôn tập" để bắt đầu.'
                : 'Quay lại sau — lịch ôn được giãn ra theo mức độ bạn nhớ.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mặt thẻ */}
            <div className="p-4 space-y-3">
              <button
                onClick={() => setFlipped(f => !f)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 overflow-hidden transition hover:border-indigo-300"
              >
                {/* Mặt trước: chính nét chữ đã viết */}
                <div className="bg-white p-3">
                  {card.frontUrl ? (
                    <img
                      src={card.frontUrl}
                      alt="Mặt trước thẻ"
                      className="w-full max-h-52 object-contain"
                      draggable={false}
                    />
                  ) : (
                    <p className="text-xs text-slate-400 py-8 text-center">
                      Không tải được ảnh mặt trước
                    </p>
                  )}
                </div>

                {/* Mặt sau */}
                <div className="border-t border-slate-200 px-4 py-4 min-h-[76px] flex items-center justify-center">
                  {flipped ? (
                    <p className="text-base font-semibold text-slate-900 text-center whitespace-pre-wrap">
                      {card.backText || '(chưa có đáp án)'}
                    </p>
                  ) : (
                    <span className="text-xs font-bold text-indigo-600">Chạm để xem đáp án</span>
                  )}
                </div>
              </button>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <button
                  onClick={() => {
                    onJumpToSource(card.notebookId, card.pageIndex);
                    onClose();
                  }}
                  className="hover:text-indigo-600 font-semibold truncate max-w-[70%] text-left transition"
                  title="Mở trang gốc của thẻ này"
                >
                  {card.notebookTitle} · trang {card.pageIndex + 1}
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <span>{card.reviews > 0 ? `đã ôn ${card.reviews} lần` : 'thẻ mới'}</span>
                  <button
                    onClick={() => onDelete(card.id)}
                    className="chrome-btn w-7 h-7 hover:bg-rose-50 hover:text-rose-600"
                    title="Xoá thẻ này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Tự chấm */}
            <div className="px-4 pb-4">
              {flipped ? (
                <div className="grid grid-cols-4 gap-2">
                  {GRADES.map(({ value, label, className }) => (
                    <button
                      key={value}
                      onClick={() => handleGrade(value)}
                      className={`py-2.5 rounded-xl text-white text-xs font-bold transition ${className}`}
                    >
                      <span className="block">{label}</span>
                      <span className="block text-[10px] font-semibold opacity-80 mt-0.5">
                        {FlashcardEngine.describeNext(card, value)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => setFlipped(true)}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Lật thẻ
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
