import { json, error } from '../../shared/types.ts';
import { verifyPassword, hashPassword } from '../../shared/crypto.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';

// @ts-ignore - KV 是 EdgeOne Pages 全局变量
declare const KV: any;

// EdgeOne 文件路由入口
export async function onRequest(context: any): Promise<Response> {
  const request: Request = context.request;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  const slugMatch = path.match(/^\/api\/shares\/([^/]+)$/);
  if (slugMatch) {
    const slug = decodeURIComponent(slugMatch[1]);
    if (method === 'GET') return handleCheck(request, slug);
    if (method === 'POST') return handleGet(request, slug);
    // PUT/DELETE 需要认证
    if (method === 'PUT' || method === 'DELETE') {
      const authError = await authMiddleware(request);
      if (authError) return authError;
      if (method === 'PUT') return handleUpdate(request, slug);
      if (method === 'DELETE') return handleDelete(request, slug);
    }
  }

  return error(404, 'Not Found');
}

const SHARE_MAX_ATTEMPTS = 5;
const SHARE_LOCKOUT_DURATION = 15 * 60; // 15分钟

// 检查分享信息（不返回内容，用于前端判断是否需要密码）
export async function handleCheck(request: Request, slug: string): Promise<Response> {
  try {
    const share = await KV.get(`share:${slug}`, { type: 'json' });
    if (!share) return error(404, '分享不存在或已过期');
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return error(404, '分享已过期');
    }

    return json({
      slug: share.slug,
      isPublic: share.isPublic,
      requiresPassword: !share.isPublic && !!share.password,
      allowSuggestion: !!share.allowSuggestion,
    });
  } catch (err) {
    console.error('Check share error:', err);
    return error(500, '检查分享失败');
  }
}

// 获取分享笔记（POST 传密码，GET 用于公开分享）
export async function handleGet(request: Request, slug: string): Promise<Response> {
  try {
    const share = await KV.get(`share:${slug}`, { type: 'json' });
    if (!share) return error(404, '分享不存在或已过期');
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return error(404, '分享已过期');
    }

    // 密码验证
    if (!share.isPublic && share.password) {
      // 从 POST body 或 URL 参数获取密码（兼容旧前端）
      let password: string | null = null;
      if (request.method === 'POST') {
        const body = await request.json();
        password = body.password || null;
      } else {
        const url = new URL(request.url);
        password = url.searchParams.get('password');
      }

      if (!password) {
        return error(401, '此分享需要密码访问');
      }

      // 频率限制
      const limitKey = `share:limit:${slug}`;
      const attempts = await KV.get(limitKey, { type: 'json' }) || { count: 0, lastAttempt: 0 };
      const now = Date.now() / 1000;
      if (attempts.count >= SHARE_MAX_ATTEMPTS) {
        const elapsed = now - attempts.lastAttempt;
        if (elapsed < SHARE_LOCKOUT_DURATION) {
          return error(429, `尝试次数过多，请 ${Math.ceil(SHARE_LOCKOUT_DURATION - elapsed)} 秒后重试`);
        }
        await KV.put(limitKey, JSON.stringify({ count: 0, lastAttempt: 0 }), { expirationTtl: SHARE_LOCKOUT_DURATION });
      }

      const isValid = await verifyPassword(password, share.password);
      if (!isValid) {
        await KV.put(limitKey, JSON.stringify({ count: attempts.count + 1, lastAttempt: now }), { expirationTtl: SHARE_LOCKOUT_DURATION });
        return error(403, '密码错误');
      }

      // 验证成功，重置限制
      await KV.delete(limitKey);

      // 无条件重哈希，确保升级到当前格式（10000轮迭代 SHA-256）
      share.password = await hashPassword(password);
      await KV.put(`share:${slug}`, JSON.stringify(share));
    }

    const note = await KV.get(`note:${share.noteId}`, { type: 'json' });
    if (!note || note.isDeleted) return error(404, '笔记不存在');

    share.visitCount = (share.visitCount || 0) + 1;
    await KV.put(`share:${slug}`, JSON.stringify(share));

    return json({
      id: note.id,
      title: note.title,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    });
  } catch (err) {
    console.error('Get share error:', err);
    return error(500, '获取分享失败');
  }
}

const SHARE_INDEX_KEY = 'share:index';

// EdgeOne KV.delete 对不存在的 key 会抛错，需安全包装
async function kvDel(key: string) { try { await KV.delete(key); } catch {} }

// 删除分享
async function handleDelete(request: Request, slug: string): Promise<Response> {
  try {
    const share = await KV.get(`share:${slug}`, { type: 'json' });
    await kvDel(`share:${slug}`);

    // 清理关联的建议数据
    if (share?.noteId) {
      const sugIndexKey = `suggestion:index:${share.noteId}`;
      const sugIndex: any[] = (await KV.get(sugIndexKey, { type: 'json' })) || [];
      const toDelete = sugIndex.filter((s: any) => s.slug === slug);
      const remaining = sugIndex.filter((s: any) => s.slug !== slug);
      for (const s of toDelete) await kvDel(`suggestion:${s.id}`);
      if (toDelete.length > 0) {
        remaining.length > 0
          ? await KV.put(sugIndexKey, JSON.stringify(remaining))
          : await kvDel(sugIndexKey);
      }
    }

    // 同步索引
    const index: any[] = (await KV.get(SHARE_INDEX_KEY, { type: 'json' })) || [];
    const filtered = index.filter((i: any) => i.slug !== slug);
    if (filtered.length !== index.length) await KV.put(SHARE_INDEX_KEY, JSON.stringify(filtered));

    return json({ success: true });
  } catch (err) {
    console.error('Delete share error:', err);
    return error(500, '删除分享失败');
  }
}

// 更新分享
async function handleUpdate(request: Request, slug: string): Promise<Response> {
  try {
    const { expiresInDays, isPublic, password, allowSuggestion } = await request.json();
    const existing = await KV.get(`share:${slug}`, { type: 'json' });
    if (!existing) return error(404, '分享不存在');

    let expiresAt: string | undefined = existing.expiresAt;
    if (expiresInDays !== undefined) {
      if (expiresInDays > 0) {
        const expires = new Date();
        expires.setDate(expires.getDate() + expiresInDays);
        expiresAt = expires.toISOString();
      } else {
        expiresAt = undefined;
      }
    }

    let hashedPassword = existing.password;
    if (isPublic === false && password) {
      hashedPassword = await hashPassword(password);
    } else if (isPublic === true) {
      hashedPassword = undefined;
    }

    const updated = {
      ...existing, expiresAt,
      isPublic: isPublic ?? existing.isPublic,
      password: hashedPassword,
      allowSuggestion: allowSuggestion ?? existing.allowSuggestion,
    };
    await KV.put(`share:${slug}`, JSON.stringify(updated));

    // 同步索引
    const index: any[] = (await KV.get(SHARE_INDEX_KEY, { type: 'json' })) || [];
    const idx = index.findIndex((i: any) => i.slug === slug);
    if (idx >= 0) {
      index[idx] = { slug, noteId: existing.noteId, isPublic: updated.isPublic, expiresAt, createdAt: existing.createdAt };
      await KV.put(SHARE_INDEX_KEY, JSON.stringify(index));
    }

    return json({ success: true });
  } catch (err) {
    console.error('Update share error:', err);
    return error(500, '更新分享失败');
  }
}
