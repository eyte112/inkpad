import { json, error, NoteListItem } from '../../shared/types.ts';
import { getIndex, updateIndex, removeFromIndex, rebuildIndex } from '../../shared/note-index.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';
import { saveHistory, deleteNoteHistory, getHistoryIndex, getHistoryEntry } from '../../shared/history.ts';

// @ts-ignore - KV 是 EdgeOne Pages 全局变量
declare const KV: any;

// EdgeOne 文件路由入口
export async function onRequest(context: any): Promise<Response> {
  const request: Request = context.request;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 所有 notes 路由需要登录
  const authError = await authMiddleware(request);
  if (authError) return authError;

  if (path === '/api/notes' && method === 'GET') return handleList(request);
  if (path === '/api/notes' && method === 'POST') return handleCreate(request);

  // /api/notes/:id/patch
  const patchMatch = path.match(/^\/api\/notes\/([^/]+)\/patch$/);
  if (patchMatch && method === 'POST') return handlePatch(request, decodeURIComponent(patchMatch[1]));

  // /api/notes/:id/history/:version
  const histDetailMatch = path.match(/^\/api\/notes\/([^/]+)\/history\/([^/]+)$/);
  if (histDetailMatch && method === 'GET') {
    const noteId = decodeURIComponent(histDetailMatch[1]);
    const ver = decodeURIComponent(histDetailMatch[2]);
    try {
      const entry = await getHistoryEntry(noteId, ver);
      if (!entry) return error(404, '历史版本不存在');
      return json(entry);
    } catch (err) {
      console.error('Get history detail error:', err);
      return error(500, '获取历史版本详情失败');
    }
  }

  // /api/notes/:id/history
  const histMatch = path.match(/^\/api\/notes\/([^/]+)\/history$/);
  if (histMatch && method === 'GET') {
    const noteId = decodeURIComponent(histMatch[1]);
    try {
      const index = await getHistoryIndex(noteId);
      return json(index);
    } catch (err) {
      console.error('List history error:', err);
      return error(500, '获取历史版本列表失败');
    }
  }

  // /api/notes/:id/rollback
  const rollbackMatch = path.match(/^\/api\/notes\/([^/]+)\/rollback$/);
  if (rollbackMatch && method === 'POST') {
    const noteId = decodeURIComponent(rollbackMatch[1]);
    try {
      const { version, currentVersion } = await request.json();
      const existing = await KV.get(`note:${noteId}`, { type: 'json' });
      if (!existing || existing.isDeleted) return error(404, '笔记不存在');
      if (existing.version !== currentVersion) return error(409, '版本冲突，请刷新后重试');
      const snapshot = await getHistoryEntry(noteId, String(version));
      if (!snapshot) return error(404, '目标历史版本不存在');
      await saveHistory(noteId, existing.version, existing.title, existing.content, 'rollback');
      const updated = { ...existing, title: snapshot.title, content: snapshot.content, version: existing.version + 1, updatedAt: new Date().toISOString() };
      await KV.put(`note:${noteId}`, JSON.stringify(updated));
      await updateIndex(updated);
      return json(updated);
    } catch (err) {
      console.error('Rollback error:', err);
      return error(500, '回滚失败');
    }
  }

  // /api/notes/:id/suggestions
  const sugMatch = path.match(/^\/api\/notes\/([^/]+)\/suggestions$/);
  if (sugMatch && method === 'GET') {
    const noteId = decodeURIComponent(sugMatch[1]);
    try {
      const status = url.searchParams.get('status');
      let sugIndex: any[] = (await KV.get(`suggestion:index:${noteId}`, { type: 'json' })) || [];
      if (status) sugIndex = sugIndex.filter((s: any) => s.status === status);
      return json(sugIndex);
    } catch (err) {
      console.error('List suggestions error:', err);
      return error(500, '获取建议列表失败');
    }
  }

  // /api/notes/:id
  const idMatch = path.match(/^\/api\/notes\/([^/]+)$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1]);
    if (method === 'GET') return handleGet(request, id);
    if (method === 'PUT') return handleUpdate(request, id);
    if (method === 'DELETE') return handleDelete(request, id);
  }

  return new Response(JSON.stringify({ code: 404, message: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
}

// 获取笔记列表（从索引读取，1 次 KV）
export async function handleList(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const tag = url.searchParams.get('tag');
    const search = url.searchParams.get('search');

    let notes = await getIndex();

    // 索引为空时自动检测：如果 KV 中存在笔记数据则重建索引
    if (notes.length === 0) {
      const probe = await KV.list({ prefix: 'note:', limit: 2 });
      const keys = probe?.keys || [];
      const hasNoteData = keys.some((k: any) => {
        const name = typeof k === 'string' ? k : (k.key || k.name);
        return name && name !== 'note:index';
      });
      if (hasNoteData) {
        await rebuildIndex();
        notes = await getIndex();
      }
    }

    // 过滤
    if (tag) {
      notes = notes.filter((n) => n.tags?.includes(tag));
    }
    if (search) {
      const s = search.toLowerCase();
      notes = notes.filter(
        (n) => n.title?.toLowerCase().includes(s) || n.preview?.toLowerCase().includes(s)
      );
    }

    // 排序 + 分页
    notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const start = (page - 1) * limit;
    const paginatedNotes = notes.slice(start, start + limit);

    return json({ notes: paginatedNotes, total: notes.length, page, limit });
  } catch (err) {
    console.error('List notes error:', err);
    return error(500, '获取笔记列表失败');
  }
}

// 获取单篇笔记
export async function handleGet(request: Request, id: string): Promise<Response> {
  try {
    const data = await KV.get(`note:${id}`, { type: 'json' });
    if (!data || data.isDeleted) {
      return error(404, '笔记不存在');
    }
    return json(data);
  } catch (err) {
    console.error('Get note error:', err);
    return error(500, '获取笔记失败');
  }
}

// 创建笔记
export async function handleCreate(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { title, content, tags = [] } = body;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const note = {
      id,
      title: title || '',
      content: content || '',
      tags,
      version: 1,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    await KV.put(`note:${id}`, JSON.stringify(note));
    await updateIndex(note);
    return json(note);
  } catch (err) {
    console.error('Create note error:', err);
    return error(500, '创建笔记失败');
  }
}

// 更新笔记
export async function handleUpdate(request: Request, id: string): Promise<Response> {
  try {
    const body = await request.json();
    const { title, content, tags, version, createSnapshot } = body;

    const existing = await KV.get(`note:${id}`, { type: 'json' });
    if (!existing || existing.isDeleted) {
      return error(404, '笔记不存在');
    }

    if (existing.version !== version) {
      return error(409, '版本冲突，请刷新后重试');
    }

    if (createSnapshot) {
      await saveHistory(id, existing.version, existing.title, existing.content, 'edit');
    }

    const updated = {
      ...existing,
      title: title ?? existing.title,
      content: content ?? existing.content,
      tags: tags ?? existing.tags,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    await KV.put(`note:${id}`, JSON.stringify(updated));
    await updateIndex(updated);
    return json(updated);
  } catch (err) {
    console.error('Update note error:', err);
    return error(500, '更新笔记失败');
  }
}

// 增量更新笔记
export async function handlePatch(request: Request, id: string): Promise<Response> {
  try {
    const body = await request.json();
    const { patch, version, createSnapshot } = body;

    const existing = await KV.get(`note:${id}`, { type: 'json' });
    if (!existing || existing.isDeleted) {
      return error(404, '笔记不存在');
    }

    if (existing.version !== version) {
      return error(409, '版本冲突，请刷新后重试');
    }

    if (createSnapshot) {
      await saveHistory(id, existing.version, existing.title, existing.content, 'edit');
    }

    // 应用 JSON Patch
    let updated = { ...existing };
    for (const op of patch) {
      if (op.op === 'replace' && op.path === '/content') {
        updated.content = op.value;
      }
    }

    updated.version = existing.version + 1;
    updated.updatedAt = new Date().toISOString();

    await KV.put(`note:${id}`, JSON.stringify(updated));
    await updateIndex(updated);
    return json(updated);
  } catch (err) {
    console.error('Patch note error:', err);
    return error(500, '增量更新笔记失败');
  }
}

// 删除笔记（硬删除）
export async function handleDelete(request: Request, id: string): Promise<Response> {
  try {
    const existing = await KV.get(`note:${id}`, { type: 'json' });
    if (!existing) {
      return error(404, '笔记不存在');
    }

    await KV.delete(`note:${id}`);
    await removeFromIndex(id);

    // 清理历史版本
    await deleteNoteHistory(id);

    // 清理建议数据
    const sugIndex: any[] =
      (await KV.get(`suggestion:index:${id}`, { type: 'json' })) || [];
    for (const item of sugIndex) {
      await KV.delete(`suggestion:${item.id}`);
    }
    await KV.delete(`suggestion:index:${id}`);

    return json({ success: true });
  } catch (err) {
    console.error('Delete note error:', err);
    return error(500, '删除笔记失败');
  }
}
