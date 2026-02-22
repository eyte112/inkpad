// 图片加载配置
export const IMAGE_CONFIG = {
  maxRetries: 3,
  retryDelays: [1000, 2000, 4000], // 指数退避
  timeout: 15000, // 15秒超时
};

// 图床配置类型
interface ImageBedConfig {
  configured: boolean;
  provider?: 'github' | 'r2' | 'smms' | 'imgur';
  repo?: string;
  branch?: string;
  path?: string;
  publicDomain?: string;
}

// 配置缓存（5分钟过期）
let configCache: ImageBedConfig | null = null;
let configCacheTime = 0;
let configPromise: Promise<ImageBedConfig> | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// 获取图床配置（带缓存，5分钟过期）
export async function getImageBedConfig(): Promise<ImageBedConfig> {
  if (configCache && Date.now() - configCacheTime < CACHE_TTL) {
    return configCache;
  }

  if (configPromise) return configPromise;

  configPromise = fetch('/api/images/config')
    .then(res => res.json())
    .then(data => {
      configCache = data.data || data;
      configCacheTime = Date.now();
      configPromise = null;
      return configCache!;
    })
    .catch(() => {
      configCache = { configured: false };
      configCacheTime = Date.now();
      configPromise = null;
      return configCache;
    });

  return configPromise;
}

// 判断是否为代理 URL
export function isProxyUrl(src: string): boolean {
  return src.includes('/api/images/proxy');
}

// 从代理 URL 提取 path
export function extractPathFromProxy(src: string): string | null {
  try {
    const url = new URL(src, window.location.origin);
    return url.searchParams.get('path');
  } catch {
    return null;
  }
}

// 将旧的 proxy URL 转为 jsDelivr CDN URL（已有图片兼容）
export function proxyToJsdelivr(src: string): string {
  if (!isProxyUrl(src) || !configCache?.configured) return src;
  if (configCache.provider !== 'github') return src;
  const path = extractPathFromProxy(src);
  if (!path || !configCache.repo || !configCache.branch) return src;
  return `https://cdn.jsdelivr.net/gh/${configCache.repo}@${configCache.branch}/${path}`;
}

// 生成备用 URL：jsDelivr 失败时回退到 proxy
export function getImageFallbackUrl(src: string): string | null {
  if (!configCache?.configured || configCache.provider !== 'github') return null;

  // 旧的 proxy URL → jsDelivr（不应走到这里，proxyToJsdelivr 已处理）
  if (isProxyUrl(src)) {
    const path = extractPathFromProxy(src);
    if (!path || !configCache.repo || !configCache.branch) return null;
    return `https://cdn.jsdelivr.net/gh/${configCache.repo}@${configCache.branch}/${path}`;
  }

  // jsDelivr URL → 回退到 proxy
  if (src.includes('cdn.jsdelivr.net/gh/')) {
    try {
      const url = new URL(src);
      // 从路径提取: /gh/{repo}@{branch}/{path}
      const match = url.pathname.match(/^\/gh\/[^@]+@[^/]+\/(.+)$/);
      if (match) return `/api/images/proxy?path=${encodeURIComponent(match[1])}`;
    } catch { /* ignore */ }
  }

  return null;
}
