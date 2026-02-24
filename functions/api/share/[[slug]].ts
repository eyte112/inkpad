import { verifyPassword, hashPassword } from '../../shared/crypto.ts';

// @ts-ignore
declare const KV: any;
export async function handleShareAccess(context: any): Promise<Response> {
  try {
    const request: Request = context.request;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const segments = path.replace(/\/$/, '').split('/');
    const slug = decodeURIComponent(segments[3] || '');
    if (!slug) {
      return jsonRes({ error: '缺少分享标识' }, 400);
    }

    // /api/share/:slug/check
    if (segments[4] === 'check' && method === 'GET') {
      const share = await KV.get(`share:${slug}`, { type: 'json' });
      if (!share) return jsonRes({ error: '分享不存在或已过期' }, 404);
      if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        return jsonRes({ error: '分享已过期' }, 404);
      }
      return jsonRes({
        slug: share.slug,
        isPublic: share.isPublic,
        requiresPassword: !share.isPublic && !!share.password,
        allowSuggestion: !!share.allowSuggestion,
      });
    }

    // /api/share/:slug/suggest（必须在 GET/POST 之前匹配）
    if (segments[4] === 'suggest' && method === 'POST') {
      return handleSuggestInline(request, slug);
    }

    // /api/share/:slug (GET/POST)
    if (!segments[4] && (method === 'GET' || method === 'POST')) {
      const share = await KV.get(`share:${slug}`, { type: 'json' });
      if (!share) return jsonRes({ error: '分享不存在或已过期' }, 404);
      if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        return jsonRes({ error: '分享已过期' }, 404);
      }

      // 密码保护的分享
      if (!share.isPublic && share.password) {
        // 暴力破解保护：5次失败锁定15分钟
        const limitKey = `share:attempts:${slug}`;
        const attempts = await KV.get(limitKey, { type: 'json' }) || { count: 0, lastAttempt: 0 };
        const now = Date.now() / 1000;
        if (attempts.count >= 5) {
          if (now - attempts.lastAttempt < 900) {
            return jsonRes({ error: '尝试次数过多，请稍后再试' }, 429);
          }
          await KV.put(limitKey, JSON.stringify({ count: 0, lastAttempt: 0 }));
        }

        let password: string | null = null;
        if (method === 'POST') {
          const body = await request.json();
          password = body.password || null;
        }
        if (!password) return jsonRes({ error: '此分享需要密码访问' }, 401);

        const isValid = await verifyPassword(password, share.password);
        if (!isValid) {
          await KV.put(limitKey, JSON.stringify({ count: attempts.count + 1, lastAttempt: now }));
          return jsonRes({ error: '密码错误' }, 403);
        }

        // 验证成功，重置限制
        if (attempts.count > 0) await KV.delete(limitKey);

        // 无条件重哈希，确保升级到当前格式
        share.password = await hashPassword(password);
        await KV.put(`share:${slug}`, JSON.stringify(share));
      }

      const note = await KV.get(`note:${share.noteId}`, { type: 'json' });
      if (!note || note.isDeleted) return jsonRes({ error: '笔记不存在' }, 404);

      share.visitCount = (share.visitCount || 0) + 1;
      await KV.put(`share:${slug}`, JSON.stringify(share));

      return jsonRes({
        id: note.id,
        title: note.title,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      });
    }

    return jsonRes({ error: 'Method Not Allowed' }, 405);
  } catch (err) {
    console.error('Share access error:', err);
    return jsonRes({ error: '服务器内部错误' }, 500);
  }
}

function jsonRes(data: any, status = 200): Response {
  const body = status >= 400
    ? { code: status, message: data.error }
    : { code: 0, message: 'success', data };
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// 内联 suggest handler（保持自包含，不依赖外部模块）
// EdgeOne 文件路由需要 onRequest 导出
export { handleShareAccess as onRequest };

async function handleSuggestInline(request: Request, slug: string): Promise<Response> {
  try {
    const share = await KV.get(`share:${slug}`, { type: 'json' });
    if (!share) return jsonRes({ error: '分享不存在或已过期' }, 404);
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return jsonRes({ error: '分享已过期' }, 404);
    }
    if (!share.allowSuggestion) return jsonRes({ error: '该分享未开启建议功能' }, 403);

    const body = await request.json();

    // 密码保护验证
    if (!share.isPublic && share.password) {
      if (!body.password) return jsonRes({ error: '此分享需要密码访问' }, 401);
      const isValid = await verifyPassword(body.password, share.password);
      if (!isValid) return jsonRes({ error: '密码错误' }, 403);
      // 无条件重哈希，确保升级到当前格式
      share.password = await hashPassword(body.password);
      await KV.put(`share:${slug}`, JSON.stringify(share));
    }

    // 频率限制
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const rlKey = `suggestion:ratelimit:${slug}:${ip}`;
    const rlCount = (await KV.get(rlKey, { type: 'json' })) || 0;
    if (rlCount >= 3) return jsonRes({ error: '提交过于频繁，请稍后再试' }, 429);

    // 输入验证
    const { nickname, contact, newTitle, patches } = body;
    if (!nickname || nickname.length < 1 || nickname.length > 30)
      return jsonRes({ error: 'nickname 需 1-30 字符' }, 400);
    if (!contact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
      return jsonRes({ error: '请提供有效的邮箱地址' }, 400);
    if (newTitle && newTitle.length > 200) return jsonRes({ error: 'title 最大 200 字符' }, 400);
    if (!newTitle && (!patches || !Array.isArray(patches) || patches.length === 0))
      return jsonRes({ error: '请至少修改标题或内容' }, 400);

    // pending 数量限制
    const sugIndex: any[] =
      (await KV.get(`suggestion:index:${share.noteId}`, { type: 'json' })) || [];
    const pendingCount = sugIndex.filter((s: any) => s.status === 'pending').length;
    if (pendingCount >= 50) return jsonRes({ error: '待处理建议已达上限' }, 400);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const suggestion = {
      id,
      noteId: share.noteId,
      slug,
      nickname,
      contact,
      newTitle: newTitle || undefined,
      patches: patches || undefined,
      status: 'pending' as const,
      createdAt: now,
    };

    await KV.put(`suggestion:${id}`, JSON.stringify(suggestion));
    sugIndex.unshift({ id, slug, nickname, contact, status: 'pending', createdAt: now });
    await KV.put(`suggestion:index:${share.noteId}`, JSON.stringify(sugIndex));

    // 更新频率限制
    await KV.put(rlKey, JSON.stringify(rlCount + 1), { expirationTtl: 60 });

    return jsonRes({ id, createdAt: now });
  } catch (err) {
    console.error('Submit suggestion error:', err);
    return jsonRes({ error: '提交建议失败' }, 500);
  }
}
