import { json, error, encodeBase62, Share } from '../../shared/types.ts';
import { hashPassword } from '../../shared/crypto.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';

// @ts-ignore - KV 是 EdgeOne Pages 全局变量
declare const KV: any;

// EdgeOne 文件路由入口
export async function onRequest(context: any): Promise<Response> {
  const request: Request = context.request;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  const authError = await authMiddleware(request);
  if (authError) return authError;

  if (path === '/api/shares' && method === 'GET') return handleList(request);
  if (path === '/api/shares' && method === 'POST') return handleCreate(request);

  const statsMatch = path.match(/^\/api\/shares\/([^/]+)\/stats$/);
  if (statsMatch && method === 'GET')
    return handleStats(request, decodeURIComponent(statsMatch[1]));

  const slugMatch = path.match(/^\/api\/shares\/([^/]+)$/);
  if (slugMatch) {
    const slug = decodeURIComponent(slugMatch[1]);
    if (method === 'PUT') return handleUpdate(request, slug);
    if (method === 'DELETE') return handleDelete(request, slug);
  }

  return error(404, 'Not Found');
}

const SHARE_INDEX_KEY = 'share:index';

interface ShareIndexItem {
  slug: string;
  noteId: string;
  isPublic: boolean;
  expiresAt?: string;
  createdAt: string;
}

async function getShareIndex(): Promise<ShareIndexItem[]> {
  const data = await KV.get(SHARE_INDEX_KEY, { type: 'json' });
  return Array.isArray(data) ? data : [];
}

async function saveShareIndex(index: ShareIndexItem[]): Promise<void> {
  await KV.put(SHARE_INDEX_KEY, JSON.stringify(index));
}

// 获取分享列表（从索引读取，1 次 KV）
export async function handleList(request: Request): Promise<Response> {
  try {
    let index = await getShareIndex();

    // 过滤过期项
    const now = new Date();
    index = index.filter((i) => !i.expiresAt || new Date(i.expiresAt) >= now);

    index.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 批量读取完整数据
    const shares: Share[] = [];
    for (const item of index) {
      const data = await KV.get(`share:${item.slug}`, { type: 'json' });
      if (data) shares.push(data);
    }

    return json({ shares, total: shares.length });
  } catch (err) {
    console.error('List shares error:', err);
    return error(500, '获取分享列表失败');
  }
}

// 创建分享
export async function handleCreate(request: Request): Promise<Response> {
  try {
    const { noteId, customAlias, expiresInDays, isPublic = true, password, allowSuggestion } = await request.json();
    const note = await KV.get(`note:${noteId}`, { type: 'json' });
    if (!note) return error(404, '笔记不存在');

    const shareList = await KV.list({ prefix: 'share:', limit: 100 });
    const shareKeys = shareList?.keys || [];
    if (shareKeys.length >= 50) return error(400, '分享数量已达上限');

    const slug = customAlias || encodeBase62(Date.now() + Math.floor(Math.random() * 10000));

    // M2: 检查 slug 唯一性
    const existing = await KV.get(`share:${slug}`);
    if (existing) return error(409, '该分享别名已存在');

    let expiresAt: string | undefined;
    if (expiresInDays && expiresInDays > 0) {
      const expires = new Date();
      expires.setDate(expires.getDate() + expiresInDays);
      expiresAt = expires.toISOString();
    }

    // 密码哈希处理
    let hashedPassword: string | undefined;
    if (!isPublic && password) {
      hashedPassword = await hashPassword(password);
    }

    const share = {
      slug,
      noteId,
      customAlias,
      isPublic,
      password: hashedPassword,
      expiresAt,
      allowSuggestion: !!allowSuggestion,
      visitCount: 0,
      createdAt: new Date().toISOString(),
    };
    await KV.put(`share:${slug}`, JSON.stringify(share));

    // 同步索引
    const index = await getShareIndex();
    index.push({ slug, noteId, isPublic, expiresAt, createdAt: share.createdAt });
    await saveShareIndex(index);

    const baseUrl = new URL(request.url).origin;
    return json({ slug, url: `${baseUrl}/s/${slug}`, expiresAt, isPublic });
  } catch (err) {
    console.error('Create share error:', err);
    return error(500, '创建分享失败');
  }
}

// EdgeOne KV.delete 对不存在的 key 会抛错，需安全包装
async function kvDel(key: string) { try { await KV.delete(key); } catch {} }

// 删除分享
export async function handleDelete(request: Request, slug: string): Promise<Response> {
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
    const index = await getShareIndex();
    const filtered = index.filter((i) => i.slug !== slug);
    if (filtered.length !== index.length) {
      await saveShareIndex(filtered);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Delete share error:', err);
    return error(500, '删除分享失败');
  }
}

// 更新分享
export async function handleUpdate(request: Request, slug: string): Promise<Response> {
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

    // 更新密码
    let hashedPassword = existing.password;
    if (isPublic === false && password) {
      hashedPassword = await hashPassword(password);
    } else if (isPublic === true) {
      hashedPassword = undefined;
    }

    const updated = {
      ...existing,
      expiresAt,
      isPublic: isPublic ?? existing.isPublic,
      password: hashedPassword,
      allowSuggestion: allowSuggestion ?? existing.allowSuggestion,
    };
    await KV.put(`share:${slug}`, JSON.stringify(updated));

    // 同步索引
    const index = await getShareIndex();
    const idx = index.findIndex((i) => i.slug === slug);
    if (idx >= 0) {
      index[idx] = {
        slug, noteId: existing.noteId, isPublic: updated.isPublic,
        expiresAt, createdAt: existing.createdAt,
      };
      await saveShareIndex(index);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Update share error:', err);
    return error(500, '更新分享失败');
  }
}

// 获取分享统计
export async function handleStats(request: Request, slug: string): Promise<Response> {
  try {
    const share = await KV.get(`share:${slug}`, { type: 'json' });
    if (!share) return error(404, '分享不存在');

    return json({
      visitCount: share.visitCount || 0,
      createdAt: share.createdAt,
    });
  } catch (err) {
    console.error('Get share stats error:', err);
    return error(500, '获取分享统计失败');
  }
}
