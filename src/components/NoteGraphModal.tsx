import React, { useMemo } from 'react';
import { X, Network, ArrowRight, CornerDownRight } from 'lucide-react';
import { Notebook } from '../types/notebook';
import { PageLinks } from '../engine/PageLinks';

interface NoteGraphModalProps {
  isOpen: boolean;
  notebooks: Notebook[];
  onJump: (notebookId: string, pageIndex: number) => void;
  onClose: () => void;
}

const SIZE = 340;
const RADIUS = 128;
const NODE_R = 7;

/**
 * Bản đồ liên kết giữa các trang.
 *
 * Xếp các nút đều nhau trên một vòng tròn thay vì mô phỏng lực đẩy: bố cục ổn
 * định, không nhảy loạn mỗi lần mở, và đọc được ngay với vài chục trang. Dưới
 * vòng tròn là danh sách chi tiết để bấm chuyển trang.
 */
export const NoteGraphModal: React.FC<NoteGraphModalProps> = ({
  isOpen,
  notebooks,
  onJump,
  onClose
}) => {
  const nodes = useMemo(() => (isOpen ? PageLinks.buildGraph(notebooks) : []), [isOpen, notebooks]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    nodes.forEach((node, index) => {
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
      map.set(`${node.notebookId}#${node.pageIndex}`, {
        x: SIZE / 2 + Math.cos(angle) * RADIUS,
        y: SIZE / 2 + Math.sin(angle) * RADIUS
      });
    });
    return map;
  }, [nodes]);

  if (!isOpen) return null;

  const totalLinks = nodes.reduce((n, node) => n + node.outgoing.length, 0);

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
            <Network className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-slate-900">Bản đồ ghi chú</span>
            {nodes.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                {nodes.length} trang · {totalLinks} liên kết
              </span>
            )}
          </div>
          <button onClick={onClose} className="chrome-btn w-8 h-8">
            <X className="w-4 h-4" />
          </button>
        </div>

        {nodes.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-3">
            <Network className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Chưa có liên kết nào</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Gõ <code className="px-1.5 py-0.5 rounded bg-slate-100 font-bold">[[Tên trang]]</code> trong
              một khung chữ để nối sang trang khác. Đặt tên cho trang ở tab Trang trong Sổ Tay.
            </p>
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            {/* Vòng tròn liên kết */}
            <div className="flex justify-center py-3">
              <svg width={SIZE} height={SIZE}>
                {/* Cạnh vẽ trước để nằm dưới nút */}
                {nodes.map(node =>
                  node.outgoing.map(link => {
                    const from = positions.get(`${node.notebookId}#${node.pageIndex}`);
                    const to = positions.get(`${link.notebookId}#${link.pageIndex}`);
                    if (!from || !to) return null;
                    return (
                      <line
                        key={`${node.pageId}-${link.notebookId}-${link.pageIndex}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="#c7d2fe"
                        strokeWidth={1.5}
                      />
                    );
                  })
                )}

                {nodes.map(node => {
                  const pos = positions.get(`${node.notebookId}#${node.pageIndex}`);
                  if (!pos) return null;
                  const weight = node.incoming.length + node.outgoing.length;
                  const isHub = weight >= 3;

                  return (
                    <g
                      key={`${node.notebookId}#${node.pageIndex}`}
                      onClick={() => {
                        onJump(node.notebookId, node.pageIndex);
                        onClose();
                      }}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={NODE_R + Math.min(4, weight)}
                        fill={isHub ? '#4f46e5' : '#818cf8'}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                      <text
                        x={pos.x}
                        y={pos.y - NODE_R - 8}
                        fontSize="10"
                        fontWeight="700"
                        fill="#334155"
                        textAnchor="middle"
                      >
                        {node.label.length > 16 ? node.label.slice(0, 15) + '…' : node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Danh sách chi tiết */}
            <div className="px-3 pb-3 space-y-2">
              {nodes.map(node => (
                <div
                  key={`list-${node.notebookId}#${node.pageIndex}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-2.5"
                >
                  <button
                    onClick={() => {
                      onJump(node.notebookId, node.pageIndex);
                      onClose();
                    }}
                    className="text-xs font-bold text-slate-800 hover:text-indigo-700 transition text-left"
                  >
                    {node.label}
                  </button>

                  {node.outgoing.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                      {node.outgoing.map(link => (
                        <button
                          key={`o-${link.notebookId}-${link.pageIndex}`}
                          onClick={() => {
                            onJump(link.notebookId, link.pageIndex);
                            onClose();
                          }}
                          className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold hover:bg-indigo-100 transition"
                        >
                          {link.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {node.incoming.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <CornerDownRight className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-[10px] font-bold text-slate-400">được nhắc bởi</span>
                      {node.incoming.map(link => (
                        <button
                          key={`i-${link.notebookId}-${link.pageIndex}`}
                          onClick={() => {
                            onJump(link.notebookId, link.pageIndex);
                            onClose();
                          }}
                          className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 text-[11px] font-semibold hover:border-indigo-300 transition"
                        >
                          {link.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
