import { useState, useRef, useCallback } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { imagesApi } from '@/services/images';
import { toast } from '@/stores/toastStore';

interface ImageUploaderProps {
  onUpload: (url: string) => void;
  onClose: () => void;
}

export function ImageUploader({ onUpload, onClose }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('不支持的图片格式', '请上传 JPG/PNG/GIF/WebP 格式');
      return;
    }

    // 验证文件大小
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片太大', '请上传 5MB 以内的图片');
      return;
    }

    setIsUploading(true);
    setProgress(30);

    try {
      setProgress(60);
      const { url } = await imagesApi.upload(file);
      setProgress(100);
      onUpload(url);
      toast.success('上传成功');
    } catch (err) {
      toast.error('上传失败', err instanceof Error ? err.message : '请重试');
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // 重置 input，允许再次选择同一文件
    e.target.value = '';
  };

  // 继续渲染部分...

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4">
        <div className="bg-surface-menu backdrop-blur-xl rounded-xl shadow-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-on-surface">
              上传图片
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-surface-card rounded">
              <X className="w-5 h-5 text-on-surface-muted" />
            </button>
          </div>

          <div
            onClick={isUploading ? undefined : handleClick}
            onDrop={isUploading ? undefined : handleDrop}
            onDragOver={isUploading ? undefined : handleDragOver}
            onDragLeave={isUploading ? undefined : handleDragLeave}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
              isUploading
                ? 'border-border cursor-not-allowed'
                : isDragging
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 cursor-pointer'
                  : 'border-border hover:border-primary-400 cursor-pointer'
            )}
          >
            {isUploading ? (
              <div className="space-y-3">
                <Loader2 className="w-10 h-10 mx-auto text-primary-500 animate-spin" />
                <p className="text-sm text-on-surface-muted">上传中... {progress}%</p>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 mx-auto text-on-surface-muted mb-3" />
                <p className="text-sm text-on-surface-muted">
                  点击或拖拽图片到此处
                </p>
                <p className="text-xs text-on-surface-muted mt-1">
                  支持 JPG/PNG/GIF/WebP，最大 5MB
                </p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}
