import { error, SETTINGS_KEY } from '../../shared/types.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';

// @ts-ignore - KV 是 EdgeOne Pages 的全局变量
declare const KV: any;

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// EdgeOne 文件路由兼容
export async function onRequest(context: any): Promise<Response> {
  const authError = await authMiddleware(context.request);
  if (authError) return authError;
  return handleProxy(context.request);
}

// GET /api/images/proxy?path=xxx - 代理 GitHub 图片
export async function handleProxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get('path');

  if (!path) {
    return error(400, '缺少 path 参数');
  }

  // 路径安全校验：先解码再检查，防止 %2e%2e 绕过
  const decoded = decodeURIComponent(path);
  if (decoded.includes('..') || decoded.startsWith('/') || decoded.includes('\\')) {
    return error(400, '非法路径');
  }

  // 限制文件扩展名
  const ext = '.' + decoded.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    return error(400, '不支持的文件类型');
  }

  try {
    const settings = await KV.get(SETTINGS_KEY, 'json');
    const provider = settings?.provider || 'github';

    if (provider !== 'github' || !settings?.github) {
      return error(400, '代理仅支持 GitHub 图床');
    }

    const { repo, branch } = settings.github;

    // M4: 校验 repo 和 branch 格式
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return error(400, '无效的 repo 格式');
    }
    if (!branch || !/^[\w./-]+$/.test(branch)) {
      return error(400, '无效的 branch 格式');
    }

    const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${decoded}`;

    // S10: 校验最终 URL 域名白名单，防止 SSRF
    try {
      const parsedUrl = new URL(rawUrl);
      if (parsedUrl.hostname !== 'raw.githubusercontent.com') {
        return error(400, '非法的代理目标');
      }
    } catch {
      return error(400, '非法的代理 URL');
    }

    const res = await fetch(rawUrl, {
      headers: { 'User-Agent': 'InkPad/1.0' },
    });

    if (!res.ok) {
      return error(404, '图片不存在');
    }

    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return error(500, '加载图片失败');
  }
}
