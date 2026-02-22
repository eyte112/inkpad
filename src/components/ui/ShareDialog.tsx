import { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { useShares, useCreateShare, useDeleteShare, useUpdateShare } from '@/hooks/useShares';
import { toast } from '@/stores/toastStore';
import { Copy, Check, Globe, Lock, Trash2, RefreshCw } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface ShareDialogProps {
  noteId: string;
  noteTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ noteId, noteTitle, open, onOpenChange }: ShareDialogProps) {
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [allowSuggestion, setAllowSuggestion] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const { data: sharesData } = useShares();
  const createShare = useCreateShare();
  const deleteShare = useDeleteShare();
  const updateShare = useUpdateShare();

  // 查找该笔记已有的分享
  const existingShare = sharesData?.shares?.find(s => s.noteId === noteId);
  const shareUrl = existingShare ? `${window.location.origin}/s/${existingShare.slug}` : '';

  const handleCreate = async () => {
    try {
      await createShare.mutateAsync({
        noteId,
        isPublic,
        password: isPublic ? undefined : password || undefined,
        allowSuggestion,
      });
      setIsCreating(false);
      setPassword('');
      toast.success('分享链接已生成');
    } catch (err) {
      toast.error('创建分享失败', err instanceof Error ? err.message : '请稍后重试');
    }
  };

  const handleDelete = async () => {
    if (!existingShare) return;
    try {
      await deleteShare.mutateAsync(existingShare.slug);
      toast.success('分享已删除');
    } catch (err) {
      toast.error('删除分享失败', err instanceof Error ? err.message : '请稍后重试');
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('链接已复制');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setPassword('');
    setIsPublic(true);
    setAllowSuggestion(false);
    setCopied(false);
    setIsCreating(false);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title="分享笔记"
      description={noteTitle || '无标题笔记'}
      size="sm"
    >
      {!existingShare || isCreating ? (
        <div className="space-y-4">
          {/* 公开/私密切换 */}
          <div className="flex gap-2">
            <button
              onClick={() => setIsPublic(true)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-colors',
                isPublic
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'border-border hover:border-on-surface-muted'
              )}
            >
              <Globe className="w-4 h-4" />
              <span>公开</span>
            </button>
            <button
              onClick={() => setIsPublic(false)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-colors',
                !isPublic
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'border-border hover:border-on-surface-muted'
              )}
            >
              <Lock className="w-4 h-4" />
              <span>私密</span>
            </button>
          </div>

          {/* 密码输入 */}
          {!isPublic && (
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="设置访问密码（可选）"
              className={cn(
                'w-full px-4 py-2 rounded-lg',
                'border border-border',
                'bg-surface-card text-on-surface',
                'placeholder:text-on-surface-muted',
                'focus:outline-none focus:ring-2 focus:ring-primary-500/30'
              )}
            />
          )}

          {/* 允许建议开关 */}
          <label className="flex items-center gap-2 cursor-pointer text-sm text-on-surface">
            <input
              type="checkbox"
              checked={allowSuggestion}
              onChange={(e) => setAllowSuggestion(e.target.checked)}
              className="rounded"
            />
            允许访客提交修改建议
          </label>

          <div className="flex gap-2">
            {isCreating && (
              <Button
                onClick={() => setIsCreating(false)}
                variant="ghost"
                className="flex-1"
              >
                取消
              </Button>
            )}
            <Button
              onClick={handleCreate}
              disabled={createShare.isPending}
              className="flex-1"
            >
              {createShare.isPending ? '生成中...' : '生成分享链接'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 分享链接 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className={cn(
                'flex-1 px-4 py-2 rounded-lg',
                'border border-border',
                'bg-surface-card text-on-surface',
                'text-sm'
              )}
            />
            <Button onClick={handleCopy} variant="ghost">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-on-surface-muted">
            {existingShare.isPublic ? (
              <>
                <Globe className="w-4 h-4" />
                <span>公开分享 - 任何人都可以访问</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>私密分享 - 需要密码访问</span>
              </>
            )}
          </div>

          {/* 允许建议开关 */}
          <label className="flex items-center gap-2 cursor-pointer text-sm text-on-surface">
            <input
              type="checkbox"
              checked={!!existingShare.allowSuggestion}
              onChange={(e) => {
                updateShare.mutate({
                  slug: existingShare.slug,
                  data: { allowSuggestion: e.target.checked },
                });
              }}
              disabled={updateShare.isPending}
              className="rounded"
            />
            允许访客提交修改建议
          </label>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button
              onClick={handleDelete}
              variant="ghost"
              disabled={deleteShare.isPending}
              className="flex-1 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {deleteShare.isPending ? '删除中...' : '删除分享'}
            </Button>
            <Button
              onClick={() => setIsCreating(true)}
              variant="ghost"
              className="flex-1"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              重新生成
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
