import { json, error, Tag } from '../../shared/types.ts';
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

  if (path === '/api/tags' && method === 'GET') return handleList(request);
  if (path === '/api/tags' && method === 'POST') return handleCreate(request);
  if (path === '/api/tags/groups' && method === 'GET') return handleGroups(request);
  if (path === '/api/tags/groups' && method === 'POST') return handleCreateGroup(request);
  if (path === '/api/tags/move' && method === 'POST') return handleMove(request);
  if (path === '/api/tags/merge' && method === 'POST') return handleMerge(request);

  const groupMatch = path.match(/^\/api\/tags\/groups\/([^/]+)$/);
  if (groupMatch) {
    const id = decodeURIComponent(groupMatch[1]);
    if (method === 'PUT') return handleUpdateGroup(request, id);
    if (method === 'DELETE') return handleDeleteGroup(request, id);
  }

  const idMatch = path.match(/^\/api\/tags\/([^/]+)$/);
  if (idMatch && !path.includes('/groups') && path !== '/api/tags/move' && path !== '/api/tags/merge') {
    const id = decodeURIComponent(idMatch[1]);
    if (method === 'PUT') return handleUpdate(request, id);
    if (method === 'DELETE') return handleDelete(request, id);
  }

  return error(404, 'Not Found');
}

// 获取标签列表
export async function handleList(request: Request): Promise<Response> {
  try {
    const result = await KV.list({ prefix: 'tag:', limit: 100 });
    const tags: Tag[] = [];
    const keys = result?.keys || [];

    for (const key of keys) {
      const keyName = typeof key === 'string' ? key : (key.key || key.name);
      if (!keyName) continue;

      const data = await KV.get(keyName, { type: 'json' });
      if (data) tags.push(data);
    }
    tags.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return json(tags);
  } catch (err) {
    console.error('List tags error:', err);
    return error(500, '获取标签列表失败');
  }
}

// 获取标签分组
export async function handleGroups(request: Request): Promise<Response> {
  try {
    const result = await KV.list({ prefix: 'tag:', limit: 100 });
    const tags: Tag[] = [];
    const groups: Record<string, Tag[]> = {};
    const keys = result?.keys || [];

    for (const key of keys) {
      const keyName = typeof key === 'string' ? key : (key.key || key.name);
      if (!keyName) continue;

      const data = await KV.get(keyName, { type: 'json' });
      if (data) {
        if (data.groupId) {
          if (!groups[data.groupId]) groups[data.groupId] = [];
          groups[data.groupId].push(data);
        } else {
          tags.push(data);
        }
      }
    }

    const groupList = await KV.list({ prefix: 'tagGroup:', limit: 10 });
    const resultGroups = [];
    const groupKeys = groupList?.keys || [];

    for (const key of groupKeys) {
      const keyName = typeof key === 'string' ? key : (key.key || key.name);
      if (!keyName) continue;

      const groupData = await KV.get(keyName, { type: 'json' });
      if (groupData) {
        resultGroups.push({
          id: groupData.id,
          name: groupData.name,
          children: groups[groupData.id] || [],
          noteCount: (groups[groupData.id] || []).reduce((sum: number, t: Tag) => sum + (t.noteCount || 0), 0),
        });
      }
    }

    return json(resultGroups);
  } catch (err) {
    console.error('Get groups error:', err);
    return error(500, '获取标签分组失败');
  }
}

// 创建标签
export async function handleCreate(request: Request): Promise<Response> {
  try {
    const { name, color, groupId } = await request.json();
    if (!name || name.length > 50) {
      return error(400, '标签名称长度必须在 1-50 之间');
    }
    const id = crypto.randomUUID();
    const tag = {
      id,
      name,
      color: color || '#3B82F6',
      groupId: groupId || null,
      noteCount: 0,
      createdAt: new Date().toISOString(),
    };
    await KV.put(`tag:${id}`, JSON.stringify(tag));
    return json(tag);
  } catch (err) {
    console.error('Create tag error:', err);
    return error(500, '创建标签失败');
  }
}

// 更新标签
export async function handleUpdate(request: Request, id: string): Promise<Response> {
  try {
    const { name, color, groupId } = await request.json();
    const existing = await KV.get(`tag:${id}`, { type: 'json' });
    if (!existing) {
      return error(404, '标签不存在');
    }

    const updated = {
      ...existing,
      name: name ?? existing.name,
      color: color ?? existing.color,
      groupId: groupId !== undefined ? groupId : existing.groupId,
    };
    await KV.put(`tag:${id}`, JSON.stringify(updated));
    return json(updated);
  } catch (err) {
    console.error('Update tag error:', err);
    return error(500, '更新标签失败');
  }
}

// 删除标签
export async function handleDelete(request: Request, id: string): Promise<Response> {
  try {
    await KV.delete(`tag:${id}`);
    return json({ success: true });
  } catch (err) {
    console.error('Delete tag error:', err);
    return error(500, '删除标签失败');
  }
}

// 移动标签到分组
export async function handleMove(request: Request): Promise<Response> {
  try {
    const { tagId, groupId } = await request.json();
    const existing = await KV.get(`tag:${tagId}`, { type: 'json' });
    if (!existing) {
      return error(404, '标签不存在');
    }

    const updated = { ...existing, groupId: groupId || null };
    await KV.put(`tag:${tagId}`, JSON.stringify(updated));
    return json({ success: true });
  } catch (err) {
    console.error('Move tag error:', err);
    return error(500, '移动标签失败');
  }
}

// 合并标签
export async function handleMerge(request: Request): Promise<Response> {
  try {
    const { sourceIds, targetId } = await request.json();
    const target = await KV.get(`tag:${targetId}`, { type: 'json' });
    if (!target) {
      return error(404, '目标标签不存在');
    }

    // 删除源标签
    for (const sourceId of sourceIds) {
      await KV.delete(`tag:${sourceId}`);
    }
    return json({ success: true });
  } catch (err) {
    console.error('Merge tags error:', err);
    return error(500, '合并标签失败');
  }
}

// 创建分组
export async function handleCreateGroup(request: Request): Promise<Response> {
  try {
    const { name } = await request.json();
    if (!name || name.length > 50) {
      return error(400, '分组名称长度必须在 1-50 之间');
    }
    const id = crypto.randomUUID();
    const group = { id, name, createdAt: new Date().toISOString() };
    await KV.put(`tagGroup:${id}`, JSON.stringify(group));
    return json(group);
  } catch (err) {
    console.error('Create group error:', err);
    return error(500, '创建分组失败');
  }
}

// 更新分组
export async function handleUpdateGroup(request: Request, id: string): Promise<Response> {
  try {
    const { name } = await request.json();
    const existing = await KV.get(`tagGroup:${id}`, { type: 'json' });
    if (!existing) {
      return error(404, '分组不存在');
    }

    const updated = { ...existing, name: name ?? existing.name };
    await KV.put(`tagGroup:${id}`, JSON.stringify(updated));
    return json(updated);
  } catch (err) {
    console.error('Update group error:', err);
    return error(500, '更新分组失败');
  }
}

// 删除分组
export async function handleDeleteGroup(request: Request, id: string): Promise<Response> {
  try {
    await KV.delete(`tagGroup:${id}`);
    return json({ success: true });
  } catch (err) {
    console.error('Delete group error:', err);
    return error(500, '删除分组失败');
  }
}
