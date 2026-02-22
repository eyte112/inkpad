import { json, error } from './types.ts';
import { getHistoryIndex, getHistoryEntry, saveHistory } from './history.ts';
import { updateIndex } from './note-index.ts';

// @ts-ignore
declare const KV: any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^\d+$/;

export async function handleHistoryList(request: Request, noteId: string): Promise<Response> {
  if (!UUID_RE.test(noteId)) return error(400, '无效的笔记 ID');
  try {
    const index = await getHistoryIndex(noteId);
    return json(index);
  } catch (err) {
    console.error('List history error:', err);
    return error(500, '获取历史版本列表失败');
  }
}

export async function handleHistoryDetail(
  request: Request,
  noteId: string,
  version: string,
): Promise<Response> {
  if (!UUID_RE.test(noteId)) return error(400, '无效的笔记 ID');
  if (!VERSION_RE.test(version)) return error(400, '无效的版本号');
  try {
    const entry = await getHistoryEntry(noteId, version);
    if (!entry) return error(404, '历史版本不存在');
    return json(entry);
  } catch (err) {
    console.error('Get history detail error:', err);
    return error(500, '获取历史版本详情失败');
  }
}

export async function handleRollback(request: Request, noteId: string): Promise<Response> {
  if (!UUID_RE.test(noteId)) return error(400, '无效的笔记 ID');
  try {
    const { version, currentVersion } = await request.json();
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
      return error(400, '无效的目标版本号');
    if (typeof currentVersion !== 'number' || !Number.isInteger(currentVersion) || currentVersion < 1)
      return error(400, '无效的当前版本号');

    const existing = await KV.get(`note:${noteId}`, { type: 'json' });
    if (!existing || existing.isDeleted) return error(404, '笔记不存在');
    if (existing.version !== currentVersion) return error(409, '版本冲突，请刷新后重试');

    const snapshot = await getHistoryEntry(noteId, String(version));
    if (!snapshot) return error(404, '目标历史版本不存在');

    await saveHistory(noteId, existing.version, existing.title, existing.content, 'rollback');

    const updated = {
      ...existing,
      title: snapshot.title,
      content: snapshot.content,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    await KV.put(`note:${noteId}`, JSON.stringify(updated));
    await updateIndex(updated);
    return json(updated);
  } catch (err) {
    console.error('Rollback error:', err);
    return error(500, '回滚失败');
  }
}
