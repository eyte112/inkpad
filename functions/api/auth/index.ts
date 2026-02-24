import {
  json,
  jsonWithCookie,
  error,
  createAuthCookie,
  clearAuthCookie,
  isSecureRequest,
} from '../../shared/types.ts';
import { hashPassword, verifyPassword, isLegacyHash } from '../../shared/crypto.ts';
import { authMiddleware, getTokenFromCookie } from '../../shared/auth-middleware.ts';
// passkey-handlers 静态导入会导致 auth worker 崩溃，passkey 路由由 [[path]].ts 处理
// import { handleAuthOptions, handleAuthVerify, handleRegisterOptions, handleRegisterVerify } from '../../shared/passkey-handlers.ts';

// 重新导出，供其他模块使用
export { authMiddleware, getTokenFromCookie };

// @ts-ignore - KV 是 EdgeOne Pages 的全局变量
declare const KV: any;

// EdgeOne 文件路由兼容 — 处理 /api/auth/* 请求
export async function onRequest(context: any): Promise<Response> {
  try {
    const request: Request = context.request;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // passkey 简单路由 — 内联处理，避免导入 @simplewebauthn 破坏 bundle
    if (path === '/api/auth/passkey/check' && method === 'GET') {
      const creds = await KV.get('passkey:credentials', { type: 'json' });
      return json({ hasPasskey: Array.isArray(creds) && creds.length > 0 });
    }
    // passkey 复杂路由 — 委托给 [[path]].ts 处理
    if (path === '/api/auth/passkey/auth-options' && method === 'POST') {
      return error(404, 'Handled by catch-all');
    }
    if (path === '/api/auth/passkey/auth-verify' && method === 'POST') {
      return error(404, 'Handled by catch-all');
    }

    // 无需登录的路由
    if (path === '/api/auth/setup' && method === 'POST') return handleSetup(request);
    if (path === '/api/auth/login' && method === 'POST') return handleLogin(request);
    if (path === '/api/auth/verify' && method === 'POST') return handleVerify(request);
    if (path === '/api/auth/logout' && method === 'POST') return handleLogout(request);
    if (path === '/api/auth/check-setup' && method === 'GET') return handleCheckSetup();

    // 需要登录的路由
    const authError = await authMiddleware(request);
    if (authError) return authError;

    if (path === '/api/auth/change-password' && method === 'POST')
      return handleChangePassword(request);
    if (path === '/api/auth/reset-request' && method === 'POST') return handleResetRequest(request);
    if (path === '/api/auth/reset-confirm' && method === 'POST') return handleResetConfirm(request);

    // passkey 需登录的复杂路由 — 委托给 [[path]].ts 处理
    if (path === '/api/auth/passkey/register-options' && method === 'POST') {
      return error(404, 'Handled by catch-all');
    }
    if (path === '/api/auth/passkey/register-verify' && method === 'POST') {
      return error(404, 'Handled by catch-all');
    }
    // passkey 需登录的简单路由
    if (path === '/api/auth/passkey/list' && method === 'GET') {
      const creds = await KV.get('passkey:credentials', { type: 'json' }) || [];
      return json(
        creds.map((c: any) => ({ id: c.id, deviceName: c.deviceName, createdAt: c.createdAt }))
      );
    }
    if (path === '/api/auth/passkey/delete' && method === 'DELETE') {
      const { id } = await request.json() as { id: string };
      if (!id) return error(400, '缺少凭证 ID');
      const creds = await KV.get('passkey:credentials', { type: 'json' }) || [];
      const filtered = creds.filter((c: any) => c.id !== id);
      if (filtered.length === creds.length) return error(404, '凭证不存在');
      await KV.put('passkey:credentials', JSON.stringify(filtered));
      return json({ success: true });
    }

    return error(404, 'Not Found');
  } catch (err) {
    console.error('Auth error:', err);
    return error(500, '服务器内部错误');
  }
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60; // 15分钟

// 检查登录限制
async function checkLoginLimit(): Promise<{ blocked: boolean; remaining?: number }> {
  const attempts =
    (await KV.get('auth:login_attempts', { type: 'json' })) || { count: 0, lastAttempt: 0 };
  const now = Date.now() / 1000;

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    const elapsed = now - attempts.lastAttempt;
    if (elapsed < LOCKOUT_DURATION) {
      return { blocked: true, remaining: Math.ceil(LOCKOUT_DURATION - elapsed) };
    }
    // 锁定时间已过，重置
    await KV.put('auth:login_attempts', JSON.stringify({ count: 0, lastAttempt: 0 }));
  }

  return { blocked: false };
}

// 记录登录失败
async function recordLoginFailure(): Promise<void> {
  const attempts =
    (await KV.get('auth:login_attempts', { type: 'json' })) || { count: 0, lastAttempt: 0 };
  await KV.put('auth:login_attempts', JSON.stringify({
    count: attempts.count + 1,
    lastAttempt: Date.now() / 1000,
  }));
}

// 重置登录限制
async function resetLoginLimit(): Promise<void> {
  await KV.put('auth:login_attempts', JSON.stringify({ count: 0, lastAttempt: 0 }));
}

// 首次设置密码
export async function handleSetup(request: Request): Promise<Response> {
  try {
    if (typeof KV === 'undefined') {
      return error(500, 'KV 存储未配置');
    }

    const { password } = await request.json();

    if (!password || password.length < 8) {
      return error(400, '密码长度至少 8 位');
    }

    const hasSetup = await KV.get('config:hasSetup');
    if (hasSetup) {
      return error(400, '密码已设置，请直接登录');
    }

    const hashed = await hashPassword(password);
    await KV.put('config:password', hashed);
    await KV.put('config:hasSetup', 'true');

    return json({ success: true });
  } catch (err: any) {
    console.error('Setup error:', err);
    return error(500, '操作失败: ' + (err.message || String(err)));
  }
}

// 登录
export async function handleLogin(request: Request): Promise<Response> {
  try {
    // 检查登录限制
    const limit = await checkLoginLimit();
    if (limit.blocked) {
      return error(429, `登录失败次数过多，请 ${limit.remaining} 秒后重试`);
    }

    const { password, duration = '7days' } = await request.json();

    const hasSetup = await KV.get('config:hasSetup');
    if (!hasSetup) {
      return error(401, '请先设置密码');
    }

    const storedHash = await KV.get('config:password');
    const isValid = await verifyPassword(password, storedHash);

    if (!isValid) {
      await recordLoginFailure();
      return error(401, '密码错误');
    }

    // 登录成功，重置限制
    await resetLoginLimit();

    // 登录成功后一律重新哈希，确保升级到当前格式（10000轮迭代 SHA-256）
    await KV.put('config:password', await hashPassword(password));

    // 生成 session token 存入 KV
    const durationMap: Record<string, number> = {
      session: 86400, '7days': 604800, '30days': 2592000,
    };
    const maxAge = durationMap[duration] || 604800;
    const now = Math.floor(Date.now() / 1000);
    const token = crypto.randomUUID();
    await KV.put(`session:${token}`, JSON.stringify({
      sub: 'user', iat: now, exp: now + maxAge, duration,
    }), { expirationTtl: maxAge });
    const secure = isSecureRequest(request);
    const cookie = createAuthCookie(token, maxAge, secure);

    return jsonWithCookie({ success: true }, cookie);
  } catch (err) {
    console.error('Login error:', err);
    return error(500, '登录失败');
  }
}

// 登出
export async function handleLogout(request?: Request): Promise<Response> {
  // 尝试删除 KV 中的 session
  if (request) {
    const token = getTokenFromCookie(request);
    if (token) {
      try { await KV.delete(`session:${token}`); } catch {}
    }
  }
  const secure = request ? isSecureRequest(request) : true;
  const cookie = clearAuthCookie(secure);
  return jsonWithCookie({ success: true }, cookie);
}

// 验证会话
export async function handleVerify(request: Request): Promise<Response> {
  const authResult = await authMiddleware(request);
  if (authResult) {
    return json({ valid: false });
  }
  return json({ valid: true });
}

// 检查是否已设置密码
export async function handleCheckSetup(): Promise<Response> {
  try {
    if (typeof KV === 'undefined') {
      return error(500, 'KV 存储未配置');
    }

    const hasSetup = await KV.get('config:hasSetup');
    // 禁止缓存，确保每次都从 KV 读取最新状态
    const body = JSON.stringify({ code: 0, message: 'success', data: { hasSetup: !!hasSetup } });
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    console.error('Check setup error:', err);
    return error(500, '检查设置状态失败');
  }
}

// 修改密码
export async function handleChangePassword(request: Request): Promise<Response> {
  try {
    // 验证登录状态
    const authResult = await authMiddleware(request);
    if (authResult) {
      return authResult;
    }

    const { oldPassword, newPassword } = await request.json();

    if (!newPassword || newPassword.length < 8) {
      return error(400, '新密码长度至少 8 位');
    }

    // 验证旧密码
    const storedHash = await KV.get('config:password');
    const isValid = await verifyPassword(oldPassword, storedHash);

    if (!isValid) {
      return error(401, '旧密码错误');
    }

    // 设置新密码（始终使用新格式）
    const newHash = await hashPassword(newPassword);
    await KV.put('config:password', newHash);

    return json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    return error(500, '修改密码失败');
  }
}

// 重置系统 - 删除所有 KV 数据
// 第一步：验证密码，生成一次性重置 token
export async function handleResetRequest(request: Request): Promise<Response> {
  try {
    const authResult = await authMiddleware(request);
    if (authResult) return authResult;

    const { password } = await request.json();
    const storedHash = await KV.get('config:password');
    const isValid = await verifyPassword(password, storedHash);

    if (!isValid) {
      return error(401, '密码错误');
    }

    // 生成一次性 token，60 秒过期
    const token = crypto.randomUUID();
    await KV.put(`reset:token:${token}`, '1', { expirationTtl: 60 });

    return json({ token });
  } catch (err) {
    console.error('Reset request error:', err);
    return error(500, '重置失败');
  }
}

// 第二步：携带 token 执行重置
export async function handleResetConfirm(request: Request): Promise<Response> {
  try {
    const authResult = await authMiddleware(request);
    if (authResult) return authResult;

    const { token } = await request.json();
    if (!token) return error(400, '缺少 token');

    // 验证并消费 token
    const valid = await KV.get(`reset:token:${token}`);
    if (!valid) return error(403, 'token 无效或已过期');
    await KV.delete(`reset:token:${token}`);

    // 先收集所有 key，再统一删除（避免边删除边分页导致 cursor 失效）
    const allKeys: string[] = [];
    let cursor: string | undefined;

    do {
      const listOptions: { limit: number; cursor?: string } = { limit: 256 };
      if (cursor) listOptions.cursor = cursor;

      const result = await KV.list(listOptions);
      const keys = result?.keys || [];

      for (const key of keys) {
        const keyName = typeof key === 'string' ? key : (key.key || key.name);
        if (keyName) allKeys.push(keyName);
      }

      cursor = result?.cursor;
    } while (cursor);

    for (const keyName of allKeys) {
      await KV.delete(keyName);
    }
    const deletedCount = allKeys.length;

    const cookie = clearAuthCookie(isSecureRequest(request));
    return jsonWithCookie({ success: true, deleted: deletedCount }, cookie);
  } catch (err) {
    console.error('Reset confirm error:', err);
    return error(500, '重置失败');
  }
}
