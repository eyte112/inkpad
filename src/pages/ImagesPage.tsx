import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Copy, Trash2, Link, X, ImageIcon, Loader2, CheckSquare, Square } from 'lucide-react';
import { useImages, useDeleteImage, useBatchDeleteImages } from '@/hooks/useImages';
import { cn, copyToClipboard, formatFileSize } from '@/utils/helpers';
import { formatRelativeTime } from '@/utils/date';
import { toast } from '@/stores/toastStore';
import { Button } from '@/components/ui';
import type { ImageMeta } from '@/types/image';

export function ImagesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [previewImage, setPreviewImage] = useState<ImageMeta | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ImageMeta | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useImages({
    search: debouncedSearch,
  });
  const deleteMutation = useDeleteImage();
  const batchDeleteMutation = useBatchDeleteImages();

  const images = data?.pages.flatMap(p => p.images) || [];
  const total = data?.pages[0]?.total || 0;

  // 搜索防抖
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  const handleCopyUrl = async (url: string) => {
    await copyToClipboard(url);
    toast.success('已复制链接');
  };

  const handleCopyMarkdown = async (image: ImageMeta) => {
    await copyToClipboard(`![${image.filename}](${image.url})`);
    toast.success('已复制 Markdown');
  };

  const handleDelete = async (image: ImageMeta) => {
    try {
      await deleteMutation.mutateAsync({ path: image.url, id: image.id });
      toast.success('已删除');
      setDeleteConfirm(null);
    } catch (err) {
      toast.error('删除失败', err instanceof Error ? err.message : '请重试');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(images.map(i => i.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    try {
      const { results } = await batchDeleteMutation.mutateAsync(ids);
      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        toast.success(`已删除 ${results.length} 张图片`);
      } else {
        toast.warning(`${results.length - failed.length} 张成功，${failed.length} 张失败`);
      }
      setBatchDeleteConfirm(false);
      exitSelectionMode();
    } catch (err) {
      toast.error('批量删除失败', err instanceof Error ? err.message : '请重试');
    }
  };

  return (
    <div className="min-h-screen">
      {/* 头部 */}
      <header className="sticky top-0 z-10 bg-surface-header backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-1.5 hover:bg-surface-card rounded-xl cursor-pointer transition-colors">
            <ArrowLeft className="w-5 h-5 text-on-surface-muted" />
          </button>
          <h1 className="text-lg font-semibold text-on-surface">图片库</h1>
          <span className="text-sm text-on-surface-muted">{total} 张</span>
          <div className="flex-1" />
          {selectionMode ? (
            <div className="flex items-center gap-2">
              <button onClick={toggleSelectAll} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                {selectedIds.size === images.length ? '取消全选' : '全选'}
              </button>
              <Button
                variant="danger"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setBatchDeleteConfirm(true)}
              >
                删除 ({selectedIds.size})
              </Button>
              <Button variant="ghost" size="sm" onClick={exitSelectionMode}>取消</Button>
            </div>
          ) : (
            <>
              {images.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelectionMode(true)}>选择</Button>
              )}
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="搜索文件名..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-xl border border-border bg-surface-card text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>
            </>
          )}
        </div>
      </header>

      {/* 内容区 */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500/10 to-primary-600/10 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-primary-500/50" />
            </div>
            <p className="text-on-surface-muted">
              {debouncedSearch ? '没有找到匹配的图片' : '还没有上传过图片'}
            </p>
            <p className="text-sm text-on-surface-muted mt-1">仅显示功能上线后上传的图片</p>
          </div>
        ) : (
          <>
            {/* 图片网格 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {images.map(image => (
                <ImageCard
                  key={image.id}
                  image={image}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(image.id)}
                  onToggleSelect={() => toggleSelect(image.id)}
                  onPreview={() => setPreviewImage(image)}
                  onCopyUrl={() => handleCopyUrl(image.url)}
                  onCopyMarkdown={() => handleCopyMarkdown(image)}
                  onDelete={() => setDeleteConfirm(image)}
                />
              ))}
            </div>

            {/* 加载更多 */}
            {hasNextPage && (
              <div className="flex justify-center mt-8">
                <Button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  variant="ghost"
                >
                  {isFetchingNextPage ? '加载中...' : '加载更多'}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* 预览遮罩 */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 cursor-pointer transition-colors" onClick={() => setPreviewImage(null)}>
            <X className="w-6 h-6" />
          </button>
          <img
            src={previewImage.url}
            alt={previewImage.filename}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-surface-menu backdrop-blur-xl rounded-2xl p-6 max-w-sm mx-4 shadow-2xl border border-border" onClick={e => e.stopPropagation()}>
            <p className="text-on-surface font-medium mb-2">确认删除？</p>
            <p className="text-sm text-on-surface-muted mb-4 break-all">{deleteConfirm.filename}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>取消</Button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(deleteConfirm)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? '删除中...' : '删除'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 批量删除确认 */}
      {batchDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center" onClick={() => setBatchDeleteConfirm(false)}>
          <div className="bg-surface-menu backdrop-blur-xl rounded-2xl p-6 max-w-sm mx-4 shadow-2xl border border-border" onClick={e => e.stopPropagation()}>
            <p className="text-on-surface font-medium mb-2">确认批量删除？</p>
            <p className="text-sm text-on-surface-muted mb-4">将删除选中的 {selectedIds.size} 张图片，此操作不可撤销。</p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setBatchDeleteConfirm(false)}>取消</Button>
              <Button variant="danger" size="sm" onClick={handleBatchDelete} disabled={batchDeleteMutation.isPending}>
                {batchDeleteMutation.isPending ? '删除中...' : `删除 ${selectedIds.size} 张`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 图片卡片组件
function ImageCard({ image, selectionMode, selected, onToggleSelect, onPreview, onCopyUrl, onCopyMarkdown, onDelete }: {
  image: ImageMeta;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  onCopyUrl: () => void;
  onCopyMarkdown: () => void;
  onDelete: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const providerLabel = { github: 'GitHub', r2: 'R2', smms: 'S.EE', imgur: 'Imgur' }[image.provider];

  return (
    <div className={cn(
      'group relative bg-surface-card backdrop-blur-xl rounded-2xl border overflow-hidden transition-all',
      selected ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-border hover:shadow-lg hover:shadow-primary-500/10'
    )}>
      {/* 缩略图 */}
      <div className="aspect-square cursor-pointer" onClick={selectionMode ? onToggleSelect : onPreview}>
        {imgError ? (
          <div className="w-full h-full flex items-center justify-center bg-surface-card">
            <ImageIcon className="w-8 h-8 text-on-surface-muted" />
          </div>
        ) : (
          <img
            src={image.url}
            alt={image.filename}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* 选择模式 checkbox */}
      {selectionMode && (
        <button
          onClick={onToggleSelect}
          className="absolute top-2 left-2 z-10"
        >
          {selected
            ? <CheckSquare className="w-5 h-5 text-primary-500" />
            : <Square className="w-5 h-5 text-white drop-shadow" />
          }
        </button>
      )}

      {/* hover 操作层（选择模式下隐藏） */}
      <div className={cn(
        'absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100',
        selectionMode && 'hidden'
      )}>
        <button onClick={onCopyUrl} className="p-2 bg-surface-card backdrop-blur-sm rounded-xl hover:bg-surface-menu cursor-pointer transition-colors" title="复制链接">
          <Link className="w-4 h-4 text-on-surface" />
        </button>
        <button onClick={onCopyMarkdown} className="p-2 bg-surface-card backdrop-blur-sm rounded-xl hover:bg-surface-menu cursor-pointer transition-colors" title="复制 Markdown">
          <Copy className="w-4 h-4 text-on-surface" />
        </button>
        <button onClick={onDelete} className="p-2 bg-red-50 dark:bg-red-900/30 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 cursor-pointer transition-colors" title="删除">
          <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
        </button>
      </div>

      {/* 信息栏 */}
      <div className="p-2">
        <p className="text-xs text-on-surface truncate" title={image.filename}>
          {image.filename}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-on-surface-muted">{formatFileSize(image.size)}</span>
          <span className="text-[10px] text-on-surface-muted">{providerLabel}</span>
        </div>
        <p className="text-[10px] text-on-surface-muted mt-0.5">{formatRelativeTime(image.uploadedAt)}</p>
      </div>
    </div>
  );
}
