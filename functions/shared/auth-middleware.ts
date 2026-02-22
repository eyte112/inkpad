import { error } from './types.ts';

// @ts-ignore - KV 是 EdgeOne Pages 的全局变量
declare const KV: any;

// 从 Cookie 中获取 token
export function getTokenFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith('auth_token=')) {
      return cookie.substring(11);
    }
  }
  return null;
}

// 认证中间件 — 基于 KV session token
export async function authMiddleware(request: Request): Promise<Response | null> {
  const token = getTokenFromCookie(request);

  if (!token) {
    return error(401, '未登录');
  }

  try {
    const session = await KV.get(`session:${token}`, { type: 'json' });
    if (!session) {
      return error(401, '登录已过期');
    }
    // 检查过期时间
    if (session.exp && session.exp < Date.now() / 1000) {
      await KV.delete(`session:${token}`);
      return error(401, '登录已过期');
    }
  } catch {
    return error(401, '验证失败');
  }

  return null;
}
