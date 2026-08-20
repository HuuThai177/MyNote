import React, { useMemo } from 'react';
import { X, Flame, PenLine, FileStack, Mic, BookOpen } from 'lucide-react';
import { Notebook } from '../types/notebook';

interface StatsModalProps {
  isOpen: boolean;
  notebooks: Notebook[];
  onClose: () => void;
}

const DAY_MS = 86400000;
const WEEKS_SHOWN = 17;
const WEEKDAY_LABELS = ['T2', '', 'T4', '', 'T6', '', 'CN'];

const dayKey = (timestamp: number): string => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const startOfDay = (timestamp: number): number => {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Thống kê thói quen ghi chép.
 *
 * Không cần thêm trường dữ liệu nào: mỗi điểm của nét vẽ vốn đã mang `time` là
 * thời điểm đặt bút, nên lịch sử hoạt động suy ra được từ chính nét chữ.
 */
export const StatsModal: React.FC<StatsModalProps> = ({ isOpen, notebooks, onClose }) => {
  const stats = useMemo(() => {
    const strokesPerDay = new Map<string, number>();
    let totalStrokes = 0;
    let totalPages = 0;
    let pagesWithInk = 0;
    let audioSeconds = 0;
    let audioCount = 0;

    notebooks.forEach(nb =>
      nb.pages.forEach(page => {
        totalPages++;
        if ((page.strokes?.length ?? 0) > 0) pagesWithInk++;

        page.strokes?.forEach(stroke => {
          totalStrokes++;
          const time = stroke.points[0]?.time;
          if (!time) return;
          const key = dayKey(time);
          strokesPerDay.set(key, (strokesPerDay.get(key) ?? 0) + 1);
        });

        page.audioNotes?.forEach(note => {
          audioCount++;
          audioSeconds += note.duration || 0;
        });
      })
    );

    // Chuỗi ngày viết liên tiếp tính ngược từ hôm nay
    let streak = 0;
    const today = startOfDay(Date.now());
    for (let i = 0; i < 400; i++) {
      const day = today - i * DAY_MS;
      if (strokesPerDay.has(dayKey(day))) streak++;
      else if (i > 0) break; // hôm nay chưa viết thì vẫn tính chuỗi tới hôm qua
    }

    const activeDays = strokesPerDay.size;
    const busiest = Math.max(1, ...Array.from(strokesPerDay.values()));

    return {
      strokesPerDay,
      totalStrokes,
      totalPages,
      pagesWithInk,
      audioSeconds,
      audioCount,
      streak,
      activeDays,
      busiest,
      notebookCount: notebooks.length
    };
  }, [notebooks]);

  /** Lưới ô vuông theo tuần, giống lịch đóng góp trên GitHub */
  const grid = useMemo(() => {
    const today = startOfDay(Date.now());
    // Lùi về thứ Hai của tuần hiện tại
    const weekdayIndex = (new Date(today).getDay() + 6) % 7;
    const thisMonday = today - weekdayIndex * DAY_MS;
    const firstMonday = thisMonday - (WEEKS_SHOWN - 1) * 7 * DAY_MS;

    const weeks: { time: number; count: number; future: boolean }[][] = [];
    for (let w = 0; w < WEEKS_SHOWN; w++) {
      const week: { time: number; count: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const time = firstMonday + (w * 7 + d) * DAY_MS;
        week.push({
          time,
          count: stats.strokesPerDay.get(dayKey(time)) ?? 0,
          future: time > today
        });
      }
      weeks.push(week);
    }
    return weeks;
  }, [stats.strokesPerDay]);

  if (!isOpen) return null;

  const intensity = (count: number): string => {
    if (count === 0) return 'bg-slate-100';
    const ratio = count / stats.busiest;
    if (ratio > 0.66) return 'bg-indigo-600';
    if (ratio > 0.33) return 'bg-indigo-400';
    return 'bg-indigo-200';
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)} giây`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} phút`;
    return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
  };

  const cards = [
    { icon: Flame, label: 'Chuỗi ngày viết', value: `${stats.streak}`, unit: 'ngày', accent: 'text-orange-600' },
    { icon: PenLine, label: 'Tổng nét viết', value: stats.totalStrokes.toLocaleString('vi-VN'), unit: 'nét', accent: 'text-indigo-600' },
    { icon: FileStack, label: 'Trang có nội dung', value: `${stats.pagesWithInk}`, unit: `/ ${stats.totalPages} trang`, accent: 'text-emerald-600' },
    { icon: Mic, label: 'Đã ghi âm', value: formatDuration(stats.audioSeconds), unit: `${stats.audioCount} bản`, accent: 'text-rose-600' }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg chrome-bar chrome-bar-float rounded-2xl border overflow-hidden animate-pop"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-slate-900">Thói quen ghi chép</span>
          </div>
          <button onClick={onClose} className="chrome-btn w-8 h-8">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Bốn con số chính */}
          <div className="grid grid-cols-2 gap-2.5">
            {cards.map(({ icon: Icon, label, value, unit, accent }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${accent}`} />
                  <span className="text-[10px] font-bold text-slate-500">{label}</span>
                </div>
                <p className="text-lg font-bold text-slate-900 leading-none">
                  {value}
                  <span className="text-[11px] font-semibold text-slate-400 ml-1">{unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* Lịch nhiệt */}
          <div>
            <p className="text-[11px] font-bold text-slate-500 mb-2">
              {WEEKS_SHOWN} tuần gần đây · {stats.activeDays} ngày có ghi chép
            </p>
            <div className="flex gap-1.5">
              <div className="flex flex-col gap-[3px] pt-[1px]">
                {WEEKDAY_LABELS.map((label, i) => (
                  <span key={i} className="h-[13px] text-[8px] font-bold text-slate-400 leading-[13px] w-4">
                    {label}
                  </span>
                ))}
              </div>

              <div className="flex gap-[3px] overflow-x-auto">
                {grid.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {week.map(day => (
                      <div
                        key={day.time}
                        className={`w-[13px] h-[13px] rounded-[3px] ${
                          day.future ? 'bg-transparent' : intensity(day.count)
                        }`}
                        title={
                          day.future
                            ? ''
                            : `${new Date(day.time).toLocaleDateString('vi-VN')} — ${day.count} nét`
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-slate-400">
              <span>Ít</span>
              {['bg-slate-100', 'bg-indigo-200', 'bg-indigo-400', 'bg-indigo-600'].map(c => (
                <span key={c} className={`w-[11px] h-[11px] rounded-[3px] ${c}`} />
              ))}
              <span>Nhiều</span>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            Thống kê suy ra từ mốc thời gian của chính nét bút, không thu thập gì thêm.
          </p>
        </div>
      </div>
    </div>
  );
};
