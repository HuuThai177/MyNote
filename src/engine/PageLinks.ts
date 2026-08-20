import { Notebook } from '../types/notebook';

export interface LinkTarget {
  notebookId: string;
  pageIndex: number;
  label: string;
}

export interface ParsedSegment {
  type: 'text' | 'link';
  content: string;
  /** Chỉ có với đoạn là liên kết; null nghĩa là liên kết hỏng */
  target?: LinkTarget | null;
}

export interface PageNode {
  notebookId: string;
  notebookTitle: string;
  pageIndex: number;
  pageId: string;
  label: string;
  /** Trang này trỏ tới những trang nào */
  outgoing: LinkTarget[];
  /** Những trang trỏ tới trang này */
  incoming: LinkTarget[];
}

/** Cú pháp liên kết: [[Tên]] hoặc [[Tên#3]] để chỉ đích danh trang số 3 */
const LINK_PATTERN = /\[\[([^\][]+)\]\]/g;

const normalize = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Liên kết giữa các trang theo cú pháp [[Tên]].
 *
 * Thứ tự tìm đích: tên trang trước, rồi tới tên sổ tay. Nhờ vậy đặt tên trang
 * là đủ để trỏ chính xác, còn không đặt thì vẫn trỏ được tới sổ tay.
 */
export class PageLinks {
  /** Tách một đoạn chữ thành các mảnh: chữ thường và liên kết */
  static parse(text: string, notebooks: Notebook[]): ParsedSegment[] {
    const segments: ParsedSegment[] = [];
    let lastIndex = 0;

    // `exec` trong vòng lặp cần regex có cờ g và phải reset lastIndex
    const pattern = new RegExp(LINK_PATTERN.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      const raw = match[1];
      segments.push({ type: 'link', content: raw, target: this.resolve(raw, notebooks) });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      segments.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return segments;
  }

  static hasLink(text: string): boolean {
    return new RegExp(LINK_PATTERN.source).test(text);
  }

  /** Tìm trang đích cho một nhãn liên kết */
  static resolve(raw: string, notebooks: Notebook[]): LinkTarget | null {
    // Tách phần "#số trang" nếu có
    const hashIndex = raw.lastIndexOf('#');
    const explicitPage = hashIndex >= 0 ? parseInt(raw.slice(hashIndex + 1), 10) : NaN;
    const name = hashIndex >= 0 && !Number.isNaN(explicitPage) ? raw.slice(0, hashIndex) : raw;
    const needle = normalize(name);
    if (!needle) return null;

    // 1. Khớp tên trang
    for (const nb of notebooks) {
      for (let i = 0; i < nb.pages.length; i++) {
        const title = nb.pages[i].title;
        if (title && normalize(title) === needle) {
          return { notebookId: nb.id, pageIndex: i, label: title };
        }
      }
    }

    // 2. Khớp tên sổ tay
    for (const nb of notebooks) {
      if (normalize(nb.title) !== needle) continue;

      const index = Number.isNaN(explicitPage)
        ? 0
        : Math.max(0, Math.min(nb.pages.length - 1, explicitPage - 1));
      return { notebookId: nb.id, pageIndex: index, label: nb.title };
    }

    return null;
  }

  /** Nhãn hiển thị cho một trang trong bản đồ */
  static labelOf(notebook: Notebook, pageIndex: number): string {
    return notebook.pages[pageIndex]?.title || `${notebook.title} · tr.${pageIndex + 1}`;
  }

  /** Dựng đồ thị liên kết của toàn thư viện; chỉ giữ trang có liên kết */
  static buildGraph(notebooks: Notebook[]): PageNode[] {
    const nodes = new Map<string, PageNode>();

    const keyOf = (notebookId: string, pageIndex: number) => `${notebookId}#${pageIndex}`;

    const ensure = (notebook: Notebook, pageIndex: number): PageNode => {
      const key = keyOf(notebook.id, pageIndex);
      let node = nodes.get(key);
      if (!node) {
        node = {
          notebookId: notebook.id,
          notebookTitle: notebook.title,
          pageIndex,
          pageId: notebook.pages[pageIndex]?.id ?? '',
          label: this.labelOf(notebook, pageIndex),
          outgoing: [],
          incoming: []
        };
        nodes.set(key, node);
      }
      return node;
    };

    notebooks.forEach(nb =>
      nb.pages.forEach((page, pageIndex) => {
        page.textElements.forEach(element => {
          this.parse(element.text || '', notebooks).forEach(segment => {
            if (segment.type !== 'link' || !segment.target) return;

            const source = ensure(nb, pageIndex);
            const targetNotebook = notebooks.find(n => n.id === segment.target!.notebookId);
            if (!targetNotebook) return;

            const target = ensure(targetNotebook, segment.target.pageIndex);

            // Không nhân đôi cạnh khi một trang được nhắc nhiều lần
            const already = source.outgoing.some(
              o => o.notebookId === target.notebookId && o.pageIndex === target.pageIndex
            );
            if (already) return;

            source.outgoing.push({
              notebookId: target.notebookId,
              pageIndex: target.pageIndex,
              label: target.label
            });
            target.incoming.push({
              notebookId: source.notebookId,
              pageIndex: source.pageIndex,
              label: source.label
            });
          });
        });
      })
    );

    return Array.from(nodes.values());
  }

  /** Những trang đang trỏ tới trang đang mở */
  static backlinksFor(
    notebooks: Notebook[],
    notebookId: string,
    pageIndex: number
  ): LinkTarget[] {
    const graph = this.buildGraph(notebooks);
    const node = graph.find(n => n.notebookId === notebookId && n.pageIndex === pageIndex);
    return node?.incoming ?? [];
  }
}
