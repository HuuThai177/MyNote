import { Notebook, PaperTemplate } from '../types/notebook';

const STORAGE_KEY = 'padnote_ai_notebooks_v1';

export class StorageEngine {
  public static loadNotebooks(): Notebook[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load notebooks from storage:', e);
    }
    return this.createInitialDefaultNotebooks();
  }

  public static saveNotebooks(notebooks: Notebook[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks));
    } catch (e) {
      console.error('Failed to save notebooks to storage:', e);
    }
  }

  public static createInitialDefaultNotebooks(): Notebook[] {
    const defaultNotebooks: Notebook[] = [
      {
        id: 'nb-xiaomi-pad',
        title: 'Hướng Dẫn Sử Dụng PadNote AI - Xiaomi Pad',
        category: 'Học Tập',
        coverColor: 'from-indigo-600 to-blue-700',
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now(),
        pages: [
          {
            id: 'page-1',
            pageIndex: 0,
            template: 'grid',
            strokes: [
              {
                id: 's-welcome',
                tool: 'pen',
                color: '#6366f1',
                size: 4,
                opacity: 1,
                points: [
                  { x: 140, y: 120, pressure: 0.7, time: Date.now() },
                  { x: 260, y: 120, pressure: 0.9, time: Date.now() + 10 },
                  { x: 200, y: 120, pressure: 0.8, time: Date.now() + 20 },
                  { x: 200, y: 190, pressure: 0.6, time: Date.now() + 30 },
                ]
              },
              {
                id: 's-highlight',
                tool: 'highlighter',
                color: '#f59e0b',
                size: 24,
                opacity: 0.4,
                points: [
                  { x: 120, y: 155, pressure: 1, time: Date.now() },
                  { x: 420, y: 155, pressure: 1, time: Date.now() + 20 }
                ]
              }
            ],
            textElements: [
              {
                id: 't-welcome',
                x: 120,
                y: 190,
                width: 480,
                height: 90,
                text: 'PadNote AI - Sổ tay số Tiếng Việt cho Tablet',
                fontFamily: "'Caveat', cursive",
                fontSize: 32,
                color: '#1e293b'
              },
              {
                id: 't-tip',
                x: 120,
                y: 280,
                width: 520,
                height: 120,
                text: '✦ Dùng bút Xiaomi Pen viết tay tự nhiên\n✦ Khoanh vùng (Lasso) để nhận diện Tiếng Việt có dấu\n✦ Chế độ Palm Rejection chống chạm lòng bàn tay',
                fontFamily: "'Patrick Hand', cursive",
                fontSize: 22,
                color: '#475569'
              }
            ],
            imageElements: [],
            audioNotes: []
          }
        ]
      },
      {
        id: 'nb-planner',
        title: 'Kế Hoạch & Mục Tiêu Tuần',
        category: 'Công Việc',
        coverColor: 'from-emerald-600 to-teal-700',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now(),
        pages: [
          {
            id: 'page-planner-1',
            pageIndex: 0,
            template: 'cornell',
            strokes: [],
            textElements: [
              {
                id: 't-planner-header',
                x: 200,
                y: 60,
                width: 400,
                height: 50,
                text: 'Cornell Notes: Mục tiêu tuần mới',
                fontFamily: "'Dancing Script', cursive",
                fontSize: 28,
                color: '#0f172a'
              }
            ],
            imageElements: [],
            audioNotes: []
          }
        ]
      },
      {
        id: 'nb-dark-ideas',
        title: 'Ý Tưởng Sáng Tạo - Dark Neon',
        category: 'Thiết Kế',
        coverColor: 'from-purple-600 to-pink-700',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pages: [
          {
            id: 'page-dark-1',
            pageIndex: 0,
            template: 'dark-neon',
            strokes: [
              {
                id: 's-neon-1',
                tool: 'highlighter',
                color: '#10b981',
                size: 28,
                opacity: 0.5,
                points: [
                  { x: 150, y: 150, pressure: 1, time: Date.now() },
                  { x: 450, y: 150, pressure: 1, time: Date.now() + 10 }
                ]
              }
            ],
            textElements: [
              {
                id: 't-neon',
                x: 160,
                y: 135,
                width: 400,
                height: 60,
                text: 'Nét bút Dạ Quang Neon trên nền tối',
                fontFamily: "'Caveat', cursive",
                fontSize: 30,
                color: '#34d399'
              }
            ],
            imageElements: [],
            audioNotes: []
          }
        ]
      }
    ];

    this.saveNotebooks(defaultNotebooks);
    return defaultNotebooks;
  }
}
