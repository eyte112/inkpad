import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, ImageOff } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { getImageFallbackUrl, isProxyUrl, IMAGE_CONFIG, getImageBedConfig, proxyToJsdelivr } from '@/utils/image';

interface SmartImageProps {
  src: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

export function SmartImage({
  src,
  alt = '',
  className,
  containerClassName
}: SmartImageProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [currentSrc, setCurrentSrc] = useState(src);
  const [retryCount, setRetryCount] = useState(0);
  const [usedFallback, setUsedFallback] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);
  const retryTimeoutRef = useRef<number | undefined>(undefined);

  // src 变化时重置，proxy URL 自动转 jsDelivr
  useEffect(() => {
    setState('loading');
    setCurrentSrc(isProxyUrl(src) ? proxyToJsdelivr(src) : src);
    setRetryCount(0);
    setUsedFallback(false);
  }, [src]);

  // 预加载图床配置，就绪后将 proxy URL 转为 jsDelivr
  useEffect(() => {
    if (isProxyUrl(src)) {
      getImageBedConfig().then(() => {
        setCurrentSrc(prev => isProxyUrl(prev) ? proxyToJsdelivr(src) : prev);
      });
    }
  }, [src]);

  // 处理加载成功
  const handleLoad = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setState('loaded');
  }, []);

  // 处理加载失败/超时
  const handleError = useCallback(() => {
    clearTimeout(timeoutRef.current);

    // 还有重试次数
    if (retryCount < IMAGE_CONFIG.maxRetries) {
      const delay = IMAGE_CONFIG.retryDelays[retryCount] || 4000;
      setRetryCount(prev => prev + 1);
      setState('loading');
      // 通过修改 src 触发重新加载
      retryTimeoutRef.current = window.setTimeout(() => {
        setCurrentSrc(prev => prev + (prev.includes('?') ? '&' : '?') + `_retry=${Date.now()}`);
      }, delay);
      return;
    }

    // 尝试备用源（jsDelivr ↔ proxy 互为备用）
    if (!usedFallback) {
      const fallbackUrl = getImageFallbackUrl(currentSrc);
      if (fallbackUrl) {
        setUsedFallback(true);
        setRetryCount(0);
        setCurrentSrc(fallbackUrl);
        return;
      }
    }

    // 最终失败
    setState('error');
  }, [retryCount, usedFallback, currentSrc]);

  // 手动重试
  const handleRetry = useCallback(() => {
    setState('loading');
    setCurrentSrc(isProxyUrl(src) ? proxyToJsdelivr(src) : src);
    setRetryCount(0);
    setUsedFallback(false);
  }, [src]);

  // 设置超时检测
  useEffect(() => {
    if (state === 'loading') {
      timeoutRef.current = window.setTimeout(() => {
        handleError();
      }, IMAGE_CONFIG.timeout);
    }
    return () => {
      clearTimeout(timeoutRef.current);
      clearTimeout(retryTimeoutRef.current);
    };
  }, [state, currentSrc, handleError]);

  return (
    <span
      className={cn(
        'inline-block relative overflow-hidden rounded',
        state !== 'loaded' && 'bg-surface-card',
        containerClassName
      )}
      style={state !== 'loaded' ? { minWidth: '100px', minHeight: '60px' } : undefined}
    >
      {/* 加载中骨架屏 */}
      {state === 'loading' && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="absolute inset-0 bg-border animate-pulse" />
          <RefreshCw className="w-6 h-6 text-on-surface-muted animate-spin relative z-10" />
        </span>
      )}

      {/* 图片 */}
      <img
        src={currentSrc}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          'transition-opacity duration-300',
          state === 'loaded' ? 'opacity-100' : 'opacity-0',
          className
        )}
        style={{ display: state === 'error' ? 'none' : 'block' }}
      />

      {/* 错误状态 */}
      {state === 'error' && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
          <ImageOff className="w-8 h-8 text-on-surface-muted" />
          <span className="text-xs text-on-surface-muted text-center">图片加载失败</span>
          <button
            onClick={handleRetry}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-surface-card hover:bg-surface-menu rounded-full transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            重试
          </button>
        </span>
      )}
    </span>
  );
}
