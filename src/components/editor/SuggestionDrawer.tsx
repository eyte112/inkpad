import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { suggestionsApi } from '@/services/suggestions';
import { formatRelativeTime } from '@/utils/date';
import { cn } from '@/utils/helpers';
import { toast } from '@/stores/toastStore';
import { MessageSquare, Check, X, User, GitCompare } from 'lucide-react';
import { applyPatches } from '@/utils/diff';
import type { Suggestion } from '@/types/share';

interface SuggestionDrawerProps {
  noteId: string;
  noteContent: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved: () => void;
  onCompare?: (newContent: string) => void;
}

export function SuggestionDrawer({ noteId, noteContent, open, onOpenChange, onApproved, onCompare }: SuggestionDrawerProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const { data: list = [] } = useQuery({
    queryKey: ['suggestions', noteId, 'pending'],
    queryFn: () => suggestionsApi.list(noteId, 'pending'),
    enabled: open,
  });

  const { data: detail } = useQuery({
    queryKey: ['suggestion-detail', selectedId],
    queryFn: () => suggestionsApi.get(selectedId!),
    enabled: !!selectedId,
  });

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!selectedId) return;
    setReviewing(true);
    try {
      await suggestionsApi.review(selectedId, action);
      queryClient.invalidateQueries({ queryKey: ['suggestions', noteId] });
      if (action === 'approve') {
        queryClient.invalidateQueries({ queryKey: ['note', noteId] });
        onApproved();
      }
      toast.success(action === 'approve' ? '已采纳建议' : '已拒绝建议');
      setSelectedId(null);
    } catch (err) {
      toast.error('操作失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setReviewing(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={() => onOpenChange(false)} />
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[400px] max-w-full',
        'bg-surface-card border-l border-border',
        'flex flex-col shadow-xl animate-slide-in-right'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-13 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-on-surface font-medium">
            <MessageSquare className="w-4 h-4" />
            修改建议
          </div>
          <button onClick={() => onOpenChange(false)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List or Detail */}
        <div className="flex-1 overflow-y-auto">
          {!selectedId ? (
            list.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-on-surface-muted text-sm">
                <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
                暂无待审核建议
              </div>
            ) : (
              <div className="divide-y divide-border">
                {list.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className="w-full px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-3.5 h-3.5 text-on-surface-muted" />
                      <span className="text-sm font-medium text-on-surface">{item.nickname}</span>
                      <span className="text-xs text-on-surface-muted ml-auto">{formatRelativeTime(item.createdAt)}</span>
                    </div>
                    <div className="text-xs text-on-surface-muted">{item.contact}</div>
                  </button>
                ))}
              </div>
            )
          ) : detail ? (
            <DetailView detail={detail} onBack={() => setSelectedId(null)} noteContent={noteContent} onCompare={onCompare} />
          ) : null}
        </div>

        {/* Review buttons */}
        {selectedId && detail && (
          <div className="px-4 py-3 border-t border-border shrink-0 flex gap-2">
            <button
              onClick={() => handleReview('reject')}
              disabled={reviewing}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium',
                'border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400',
                'hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 cursor-pointer'
              )}
            >
              <X className="w-4 h-4" /> 拒绝
            </button>
            <button
              onClick={() => handleReview('approve')}
              disabled={reviewing}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium',
                'bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 cursor-pointer'
              )}
            >
              <Check className="w-4 h-4" /> 采纳
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function DetailView({ detail, onBack, noteContent, onCompare }: { detail: Suggestion; onBack: () => void; noteContent: string; onCompare?: (newContent: string) => void }) {
  const newContent = detail.patches?.length ? applyPatches(noteContent, detail.patches) : noteContent;
  return (
    <div className="p-4 space-y-3">
      <button onClick={onBack} className="text-sm text-primary-500 hover:underline cursor-pointer">&larr; 返回列表</button>
      <div className="space-y-1 text-sm">
        <div><span className="text-on-surface-muted">昵称：</span><span className="text-on-surface">{detail.nickname}</span></div>
        <div><span className="text-on-surface-muted">联系：</span><span className="text-on-surface">{detail.contact}</span></div>
      </div>
      {detail.newTitle && <div className="text-sm font-medium text-on-surface">建议标题：{detail.newTitle}</div>}
      <button
        onClick={() => onCompare?.(newContent)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border text-on-surface hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
      >
        <GitCompare className="w-4 h-4" /> 查看对比
      </button>
    </div>
  );
}
