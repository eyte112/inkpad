import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { historyApi } from '@/services/history';
import { formatRelativeTime } from '@/utils/date';
import { cn } from '@/utils/helpers';
import { toast } from '@/stores/toastStore';
import { History, RotateCcw, X, Clock, AlertCircle, RefreshCw, GitCompare } from 'lucide-react';
import type { HistoryIndexItem } from '@/types/note';

interface HistoryDrawerProps {
  noteId: string;
  currentVersion: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRollback: () => void;
  onCompare?: (historyContent: string) => void;
}

const sourceLabels = {
  edit: { text: '编辑', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  merge: { text: '合并', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  rollback: { text: '回滚', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
};

const sourceFilters = ['all', 'edit', 'merge', 'rollback'] as const;
const sourceFilterLabels: Record<string, string> = { all: '全部', edit: '编辑', merge: '合并', rollback: '回滚' };

function formatSize(bytes?: number) {
  if (bytes == null) return '';
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function HistoryDrawer({ noteId, currentVersion, open, onOpenChange, onRollback, onCompare }: HistoryDrawerProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<typeof sourceFilters[number]>('all');

  // reset selectedId when drawer closes
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setShowRollbackConfirm(false);
      setSourceFilter('all');
    }
  }, [open]);

  const { data: list = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['history', noteId],
    queryFn: () => historyApi.list(noteId),
    enabled: open,
  });

  const { data: detail } = useQuery({
    queryKey: ['history-detail', noteId, selectedId],
    queryFn: () => historyApi.get(noteId, selectedId!),
    enabled: !!selectedId,
  });

  const filteredList = sourceFilter === 'all' ? list : list.filter((i: HistoryIndexItem) => i.source === sourceFilter);

  const handleRollback = async () => {
    if (!selectedId) return;
    setShowRollbackConfirm(false);
    setRolling(true);
    try {
      await historyApi.rollback(noteId, Number(selectedId), currentVersion);
      queryClient.invalidateQueries({ queryKey: ['note', noteId] });
      queryClient.invalidateQueries({ queryKey: ['history', noteId] });
      toast.success('已回滚到历史版本');
      onRollback();
      onOpenChange(false);
    } catch (err) {
      toast.error('回滚失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setRolling(false);
    }
  };

  if (!open) return null;

  const selectedItem = list.find((i: HistoryIndexItem) => i.id === selectedId);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={() => onOpenChange(false)} />
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[400px] max-w-full',
        'bg-surface-card border-l border-border',
        'flex flex-col shadow-xl',
        'animate-slide-in-right'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-13 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-on-surface font-medium">
            <History className="w-4 h-4" />
            历史版本
          </div>
          <button onClick={() => onOpenChange(false)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source filter */}
        {list.length > 0 && (
          <div className="flex gap-1 px-4 py-2 border-b border-border shrink-0">
            {sourceFilters.map((f) => (
              <button
                key={f}
                onClick={() => setSourceFilter(f)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-full transition-colors cursor-pointer',
                  sourceFilter === f
                    ? 'bg-primary-500 text-white'
                    : 'bg-black/5 dark:bg-white/10 text-on-surface-muted hover:bg-black/10 dark:hover:bg-white/20'
                )}
              >
                {sourceFilterLabels[f]}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-full text-on-surface-muted text-sm gap-2">
              <AlertCircle className="w-8 h-8 opacity-40" />
              <span>加载失败</span>
              <button onClick={() => refetch()} className="flex items-center gap-1 text-primary-500 hover:underline cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" /> 重试
              </button>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-on-surface-muted text-sm">
              <Clock className="w-8 h-8 mb-2 opacity-40" />
              暂无历史版本
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredList.map((item: HistoryIndexItem) => {
                const label = sourceLabels[item.source];
                const active = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(active ? null : item.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors cursor-pointer',
                      active ? 'bg-primary-500/10' : 'hover:bg-black/5 dark:hover:bg-white/10'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-on-surface truncate flex-1">
                        {item.title || '无标题'}
                      </span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded', label.cls)}>
                        {label.text}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-on-surface-muted">
                      <span>{formatRelativeTime(item.createdAt)}</span>
                      {item.contentLength != null && (
                        <span>{formatSize(item.contentLength)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        {selectedId && detail && (
          <div className="border-t border-border shrink-0 px-4 py-3 flex gap-2">
            <button
              onClick={() => onCompare?.(detail.content)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border text-on-surface hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              <GitCompare className="w-4 h-4" /> 查看对比
            </button>
            <button
              onClick={() => setShowRollbackConfirm(true)}
              disabled={rolling}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium',
                'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 cursor-pointer'
              )}
            >
              <RotateCcw className="w-4 h-4" />
              {rolling ? '回滚中...' : '回滚到此版本'}
            </button>
          </div>
        )}
      </div>

      {/* Rollback confirm dialog */}
      {showRollbackConfirm && selectedItem && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowRollbackConfirm(false)} />
          <div className="fixed z-[70] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-surface-card rounded-xl shadow-2xl border border-border p-5">
            <h3 className="text-sm font-semibold text-on-surface mb-2">确认回滚</h3>
            <p className="text-xs text-on-surface-muted mb-4">
              将回滚到 <span className="font-medium text-on-surface">{formatRelativeTime(selectedItem.createdAt)}</span> 的
              <span className={cn('inline-block mx-1 px-1.5 py-0.5 rounded text-xs', sourceLabels[selectedItem.source].cls)}>
                {sourceLabels[selectedItem.source].text}
              </span>
              版本，当前内容将被替换。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRollbackConfirm(false)}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-border text-on-surface hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleRollback}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 cursor-pointer"
              >
                确认回滚
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
