import { useState, useCallback, useRef } from 'react';
import { Search, X, ImageIcon, Loader2, Check } from 'lucide-react';
import { useImages } from '@/hooks/useImages';
import { formatFileSize } from '@/utils/helpers';
import type { ImageMeta } from '@/types/image';

interface ImagePickerProps {
  onSelect: (image: ImageMeta) => void;
  onClose: () => void;
}

export function ImagePicker({ onSelect, onClose }: ImagePickerProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<ImageMeta | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useImages({
    search: debouncedSearch,
    limit: 12,
  });

  const images = data?.pages.flatMap(p => p.images) || [];

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-menu backdrop-blur-xl rounded-xl shadow-xl border border-border w-[90vw] max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-base font-semibold text-on-surface">从图库选择</h3>
          <button onClick={onClose} className="p-1 hover:bg-surface-card rounded-lg">
            <X className="w-5 h-5 text-on-surface-muted" />
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="px-4 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-muted" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="搜索文件名..."
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-surface-card text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* 图片网格 */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 mx-auto text-on-surface-muted mb-3" />
              <p className="text-sm text-on-surface-muted">
                {debouncedSearch ? '没有找到匹配的图片' : '还没有上传过图片'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {images.map(image => (
                  <PickerItem
                    key={image.id}
                    image={image}
                    isSelected={selected?.id === image.id}
                    onSelect={() => setSelected(image)}
                  />
                ))}
              </div>
              {hasNextPage && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="px-4 py-1.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg"
                  >
                    {isFetchingNextPage ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-xs text-on-surface-muted truncate max-w-[60%]">
            {selected ? selected.filename : '请选择一张图片'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-lg border border-border text-on-surface hover:bg-surface-card"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="px-3 py-1.5 text-sm rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed btn-glow"
            >
              插入图片
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PickerItem({ image, isSelected, onSelect }: {
  image: ImageMeta;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      onClick={onSelect}
      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
        isSelected
          ? 'border-primary-500 ring-1 ring-primary-500'
          : 'border-transparent hover:border-on-surface-muted'
      }`}
    >
      <div className="aspect-square">
        {imgError ? (
          <div className="w-full h-full flex items-center justify-center bg-surface-card">
            <ImageIcon className="w-6 h-6 text-on-surface-muted" />
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
      {isSelected && (
        <div className="absolute top-1 right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1.5 py-1">
        <p className="text-[10px] text-white truncate">{image.filename}</p>
        <p className="text-[9px] text-white/70">{formatFileSize(image.size)}</p>
      </div>
    </div>
  );
}
