import React, { useEffect, useRef, useState } from 'react';
import { NotebookPage } from '../types/notebook';
import { getPageDimensions } from '../engine/PageGeometry';
import { PageRenderer } from '../engine/PageRenderer';

interface PageThumbnailProps {
  page: NotebookPage;
  /** Chiều rộng ảnh xem trước tính bằng px */
  width?: number;
}

/**
 * Ảnh xem trước thật của một trang trong sidebar.
 *
 * Bản trước chỉ in chữ "Trang N" nên không phân biệt được trang nào với trang
 * nào. Ở đây dùng lại đúng PageRenderer của chức năng xuất file, chỉ hạ tỉ lệ
 * xuống — nhờ vậy xem trước và file xuất ra không bao giờ lệch nhau.
 */
export const PageThumbnail: React.FC<PageThumbnailProps> = ({ page, width = 150 }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const previousUrlRef = useRef<string | null>(null);

  const dimensions = getPageDimensions(page);
  const aspect = dimensions.height / dimensions.width;

  useEffect(() => {
    let cancelled = false;

    // Hoãn một nhịp để mở sidebar không bị khựng khi sổ tay có nhiều trang
    const timer = setTimeout(async () => {
      try {
        const scale = width / dimensions.width;
        const canvas = await PageRenderer.renderPage(page, dimensions.width, dimensions.height, scale);
        const blob = await new Promise<Blob | null>(resolve =>
          canvas.toBlob(resolve, 'image/jpeg', 0.7)
        );
        if (cancelled || !blob) return;

        const url = URL.createObjectURL(blob);
        if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current);
        previousUrlRef.current = url;
        setPreviewUrl(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Vẽ lại khi nội dung trang đổi
  }, [page, width, dimensions.width, dimensions.height]);

  useEffect(() => {
    return () => {
      if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current);
    };
  }, []);

  return (
    <div
      className="w-full rounded-lg border border-slate-600 overflow-hidden bg-white relative"
      style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Xem trước trang"
          draggable={false}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[10px] font-semibold text-slate-400">
            {failed ? 'Không xem trước được' : '…'}
          </span>
        </div>
      )}

      {/* Nhãn tỉ lệ khổ giấy ở góc */}
      <span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-slate-400 bg-white/80 px-1 rounded">
        {aspect > 1 ? 'Dọc' : aspect < 1 ? 'Ngang' : 'Vuông'}
      </span>
    </div>
  );
};
