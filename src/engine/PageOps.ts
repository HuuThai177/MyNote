import {
  NotebookPage,
  Stroke,
  TextElement,
  ImageElement,
  AudioNote
} from '../types/notebook';

/** Nội dung có thể sao chép giữa các trang và các sổ tay */
export interface ClipboardPayload {
  strokes: Stroke[];
  textElements: TextElement[];
  imageElements: ImageElement[];
}

let idCounter = 0;

/**
 * Sinh id mới, đảm bảo không trùng kể cả khi nhân bản nhiều lần trong cùng
 * một mili-giây (Date.now() một mình không đủ khi dán liên tiếp).
 */
const freshId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

/**
 * Thao tác sao chép / nhân bản trang và đối tượng.
 *
 * Nguyên tắc quan trọng: MỌI id đều được sinh lại, nhưng `assetId` thì GIỮ
 * NGUYÊN. Ảnh và bản ghi âm dùng chung Blob trong store `assets`; nhân bản một
 * trang có ảnh 3MB không được phép tạo thêm 3MB nữa. Bộ dọn rác đếm theo tham
 * chiếu nên nhiều nơi trỏ vào cùng một asset là an toàn.
 */
export class PageOps {
  static cloneStrokes(strokes: Stroke[], dx = 0, dy = 0): Stroke[] {
    return strokes.map(stroke => ({
      ...stroke,
      id: freshId('s'),
      points: stroke.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }))
    }));
  }

  static cloneTexts(texts: TextElement[], dx = 0, dy = 0): TextElement[] {
    return texts.map(text => ({
      ...text,
      id: freshId('t'),
      x: text.x + dx,
      y: text.y + dy,
      // Nét gốc thuộc về khung chữ cũ, bản sao không sở hữu chúng
      originalStrokeIds: undefined
    }));
  }

  static cloneImages(images: ImageElement[], dx = 0, dy = 0): ImageElement[] {
    return images.map(image => ({
      ...image,
      id: freshId('img'),
      x: image.x + dx,
      y: image.y + dy
      // assetId và src giữ nguyên: dùng chung Blob đã lưu
    }));
  }

  static cloneAudioNotes(notes: AudioNote[]): AudioNote[] {
    return notes.map(note => ({ ...note, id: freshId('audio') }));
  }

  /** Bản sao đầy đủ của một trang, kể cả ghi âm và nền PDF */
  static duplicatePage(page: NotebookPage): NotebookPage {
    return {
      ...page,
      id: freshId('p'),
      strokes: this.cloneStrokes(page.strokes),
      textElements: this.cloneTexts(page.textElements),
      imageElements: this.cloneImages(page.imageElements),
      audioNotes: this.cloneAudioNotes(page.audioNotes)
    };
  }

  /** Trang trắng mới, kế thừa khổ giấy và mẫu giấy của trang tham chiếu */
  static blankPageLike(reference: NotebookPage | undefined): NotebookPage {
    return {
      id: freshId('p'),
      pageIndex: 0,
      template: reference?.template ?? 'grid',
      paperSize:
        reference?.paperSize && reference.paperSize !== 'custom' ? reference.paperSize : 'a4',
      orientation: reference?.orientation ?? 'portrait',
      strokes: [],
      textElements: [],
      imageElements: [],
      audioNotes: []
    };
  }

  /** Nội dung đang chọn -> khay nhớ tạm (đã tách khỏi trang gốc) */
  static toClipboard(
    strokes: Stroke[],
    texts: TextElement[],
    images: ImageElement[]
  ): ClipboardPayload {
    return {
      strokes: strokes.map(s => ({ ...s, points: s.points.map(p => ({ ...p })) })),
      textElements: texts.map(t => ({ ...t })),
      imageElements: images.map(i => ({ ...i }))
    };
  }

  /** Dán khay nhớ tạm vào trang, lệch đi một chút để thấy được bản mới */
  static pasteInto(
    page: NotebookPage,
    payload: ClipboardPayload,
    offset = 26
  ): { page: NotebookPage; newStrokeIds: string[]; newTextIds: string[]; newImageIds: string[] } {
    const strokes = this.cloneStrokes(payload.strokes, offset, offset);
    const texts = this.cloneTexts(payload.textElements, offset, offset);
    const images = this.cloneImages(payload.imageElements, offset, offset);

    return {
      page: {
        ...page,
        strokes: [...page.strokes, ...strokes],
        textElements: [...page.textElements, ...texts],
        imageElements: [...page.imageElements, ...images]
      },
      newStrokeIds: strokes.map(s => s.id),
      newTextIds: texts.map(t => t.id),
      newImageIds: images.map(i => i.id)
    };
  }

  static isClipboardEmpty(payload: ClipboardPayload | null): boolean {
    if (!payload) return true;
    return (
      payload.strokes.length === 0 &&
      payload.textElements.length === 0 &&
      payload.imageElements.length === 0
    );
  }

  /** Đánh lại pageIndex sau khi thêm / xoá / sắp xếp lại */
  static reindex(pages: NotebookPage[]): NotebookPage[] {
    return pages.map((page, index) => (page.pageIndex === index ? page : { ...page, pageIndex: index }));
  }

  /** Chuyển một trang từ vị trí này sang vị trí khác trong cùng sổ tay */
  static movePage(pages: NotebookPage[], from: number, to: number): NotebookPage[] {
    if (from === to || from < 0 || from >= pages.length) return pages;
    const next = [...pages];
    const [moved] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
    return this.reindex(next);
  }
}
