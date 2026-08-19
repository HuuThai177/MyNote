import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface FloatingPanelProps {
  /** Phần tử neo panel vào, thường là nút vừa bấm */
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  width: number;
  /** Canh mép trái hay mép phải của panel theo nút neo */
  align?: 'left' | 'right';
  children: React.ReactNode;
}

const VIEWPORT_MARGIN = 8;
const GAP_FROM_ANCHOR = 8;

/**
 * Panel nổi neo theo một nút, render qua portal ra thẳng `document.body`.
 *
 * Bắt buộc phải dùng portal chứ không thể đặt `position: absolute` bên trong
 * thanh công cụ: khối chứa các tuỳ chọn có `overflow-x-auto`, mà theo chuẩn CSS
 * khi `overflow-x` là `auto` còn `overflow-y` là `visible` thì `overflow-y` bị
 * tính thành `auto` — tức là khối CẮT luôn theo chiều dọc. Panel thả xuống nằm
 * trong đó sẽ bị cắt cụt ở mép dưới thanh công cụ, tăng z-index bao nhiêu cũng
 * không cứu được.
 */
export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  anchor,
  open,
  onClose,
  width,
  align = 'left',
  children
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Tính vị trí sau khi panel đã vào DOM để biết chiều cao thật của nó
  useLayoutEffect(() => {
    if (!open || !anchor) {
      setPosition(null);
      return;
    }

    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight ?? 0;

      let left = align === 'right' ? rect.right - width : rect.left;
      left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN)
      );

      // Mặc định mở xuống dưới; không đủ chỗ thì lật lên trên nút
      let top = rect.bottom + GAP_FROM_ANCHOR;
      if (panelHeight > 0 && top + panelHeight > window.innerHeight - VIEWPORT_MARGIN) {
        const above = rect.top - GAP_FROM_ANCHOR - panelHeight;
        top = above >= VIEWPORT_MARGIN ? above : Math.max(VIEWPORT_MARGIN, window.innerHeight - panelHeight - VIEWPORT_MARGIN);
      }

      setPosition({ left, top });
    };

    place();

    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, width, align, children]);

  // Bấm ra ngoài hoặc Esc để đóng
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="chrome-bar chrome-bar-float fixed rounded-2xl border animate-pop"
      style={{
        width: `${width}px`,
        left: position ? `${position.left}px` : '-9999px',
        top: position ? `${position.top}px` : '-9999px',
        // Cao hơn mọi thanh công cụ (header z-40) nhưng dưới các modal toàn màn hình
        zIndex: 45
      }}
    >
      {children}
    </div>,
    document.body
  );
};
