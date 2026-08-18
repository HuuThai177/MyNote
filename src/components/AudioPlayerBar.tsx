import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Trash2,
  X,
  MousePointerClick,
  AudioLines,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { AudioNote } from '../types/notebook';

export interface SeekRequest {
  time: number;
  token: number; // Tăng mỗi lần yêu cầu để lặp lại cùng mốc thời gian vẫn nhảy
}

interface AudioPlayerBarProps {
  notes: AudioNote[];
  seekRequest: SeekRequest | null;
  seekMode: boolean;
  onToggleSeekMode: () => void;
  onDeleteNote: (id: string) => void;
  onPlaybackTimeChange: (time: number | null) => void;
  onClose: () => void;
}

const formatTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  notes,
  seekRequest,
  seekMode,
  onToggleSeekMode,
  onDeleteNote,
  onPlaybackTimeChange,
  onClose
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const safeIndex = Math.min(activeIndex, Math.max(0, notes.length - 1));
  const activeNote = notes[safeIndex] ?? null;
  const duration = activeNote?.duration ?? 0;

  // Đổi bản ghi -> phát lại từ đầu
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    onPlaybackTimeChange(null);
  }, [activeNote?.id]);

  // Nhận yêu cầu nhảy tới mốc thời gian khi người dùng chạm vào nét vẽ
  useEffect(() => {
    if (!seekRequest || !audioRef.current || !activeNote) return;

    const target = Math.max(0, Math.min(seekRequest.time, Math.max(0, duration - 0.05)));
    audioRef.current.currentTime = target;
    setCurrentTime(target);
    onPlaybackTimeChange(target);
    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [seekRequest?.token]);

  // Dừng phát và xoá vệt sáng khi đóng thanh phát
  useEffect(() => {
    return () => onPlaybackTimeChange(null);
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleScrub = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
    onPlaybackTimeChange(value);
  };

  if (notes.length === 0) return null;

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="chrome-bar chrome-bar-float absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(680px,calc(100%-2rem))] rounded-2xl px-4 py-3 border animate-pop">
      {activeNote?.url && (
        <audio
          ref={audioRef}
          src={activeNote.url}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            setCurrentTime(t);
            onPlaybackTimeChange(t);
          }}
          onEnded={() => {
            setIsPlaying(false);
            onPlaybackTimeChange(null);
          }}
        />
      )}

      <div className="flex items-center gap-3">
        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          disabled={!activeNote?.url}
          className="p-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white shadow-lg shadow-indigo-600/30 transition shrink-0"
          title={isPlaying ? 'Tạm dừng' : 'Phát bản ghi âm'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        {/* Scrubber */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 tabular-nums w-11 shrink-0">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.1}
              value={currentTime}
              onChange={(e) => handleScrub(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-indigo-500 cursor-pointer"
              style={{
                background: `linear-gradient(to right, #4f46e5 ${progressPercent}%, #e2e8f0 ${progressPercent}%)`,
                borderRadius: '9999px',
                appearance: 'none'
              }}
            />
            <span className="text-xs font-bold text-slate-400 tabular-nums w-11 shrink-0">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
            <AudioLines className="w-3 h-3 text-rose-500 shrink-0" />
            <span className="truncate">
              {activeNote?.title || `Bản ghi ${safeIndex + 1}`}
              {' · '}
              {new Date(activeNote?.createdAt || Date.now()).toLocaleString('vi-VN')}
            </span>
          </div>
        </div>

        {/* Chuyển giữa nhiều bản ghi trên cùng trang */}
        {notes.length > 1 && (
          <div className="chrome-group flex items-center p-0.5 shrink-0">
            <button
              onClick={() => setActiveIndex(Math.max(0, safeIndex - 1))}
              disabled={safeIndex === 0}
              className="chrome-btn w-7 h-7"
              title="Bản ghi trước"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 text-[11px] font-bold text-slate-600 tabular-nums">
              {safeIndex + 1}/{notes.length}
            </span>
            <button
              onClick={() => setActiveIndex(Math.min(notes.length - 1, safeIndex + 1))}
              disabled={safeIndex >= notes.length - 1}
              className="chrome-btn w-7 h-7"
              title="Bản ghi sau"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Bật chế độ chạm nét vẽ để nghe lại đúng đoạn */}
        <button
          onClick={onToggleSeekMode}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition shrink-0 ${
            seekMode
              ? 'bg-amber-50 text-amber-700 border-amber-300'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
          title="Bật để chạm vào một nét vẽ và nghe lại đúng đoạn âm thanh lúc viết nét đó"
        >
          <MousePointerClick className={`w-4 h-4 ${seekMode ? 'text-amber-600 animate-pulse' : 'text-indigo-500'}`} />
          <span className="hidden sm:inline">{seekMode ? 'Đang chờ chạm nét' : 'Chạm nét nghe lại'}</span>
        </button>

        {/* Xoá bản ghi */}
        <button
          onClick={() => {
            if (activeNote && confirm('Xoá bản ghi âm này khỏi trang?')) {
              onDeleteNote(activeNote.id);
              setActiveIndex(0);
            }
          }}
          className="chrome-btn w-9 h-9 hover:bg-rose-50 hover:text-rose-600 shrink-0"
          title="Xoá bản ghi âm"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          onClick={onClose}
          className="chrome-btn w-9 h-9 shrink-0"
          title="Đóng thanh phát"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
