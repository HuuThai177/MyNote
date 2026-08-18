import React from 'react';
import { AlertTriangle, RotateCcw, ShieldCheck } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Lưới an toàn cho toàn ứng dụng.
 *
 * Không có nó, một lỗi render duy nhất sẽ làm React gỡ sạch cây component và
 * để lại màn hình trắng — người dùng tưởng mất hết ghi chú, trong khi dữ liệu
 * vẫn nguyên vẹn trong IndexedDB. Màn hình này nói rõ điều đó.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Lỗi render không bắt được:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="w-full h-full flex items-center justify-center p-6 bg-slate-100">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-rose-600">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h1 className="text-base font-bold">Ứng dụng gặp lỗi hiển thị</h1>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-emerald-900 leading-relaxed">
              Ghi chú của bạn vẫn an toàn. Dữ liệu nằm trong bộ nhớ thiết bị, lỗi này chỉ
              xảy ra ở phần hiển thị. Tải lại là dùng tiếp được.
            </p>
          </div>

          <details className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <summary className="text-xs font-bold text-slate-600 cursor-pointer">
              Chi tiết kỹ thuật
            </summary>
            <pre className="mt-2 text-[11px] text-slate-500 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          </details>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold transition"
            >
              Thử hiển thị lại
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Tải lại ứng dụng</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
