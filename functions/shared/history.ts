// @ts-ignore
declare const KV: any;

import type { HistoryIndexItem, HistoryEntry } from './types.ts';

const MAX_HISTORY = 50;

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

export async function saveHistory(
  noteId: string,
  version: number,
  title: string,
  content: string,
  source: 'edit' | 'merge' | 'rollback',
): Promise<void> {
  const id = String(version);
  const now = new Date().toISOString();

  const entry: HistoryEntry = { id, noteId, title, content, source, createdAt: now };
  await KV.put(`history:${noteId}:${id}`, JSON.stringify(entry));

  const index = await getHistoryIndex(noteId);
  index.unshift({ id, title, source, contentLength: content.length, createdAt: now });

  // 智能清理：优先删除 source='edit' 的旧条目，保留 rollback/merge
  const toDelete: HistoryIndexItem[] = [];
  while (index.length > MAX_HISTORY) {
    const editIdx = findLastIndex(index, (item) => item.source === 'edit');
    const removeIdx = editIdx !== -1 ? editIdx : index.length - 1;
    toDelete.push(index.splice(removeIdx, 1)[0]);
  }

  await KV.put(`history:index:${noteId}`, JSON.stringify(index));

  for (const old of toDelete) {
    await KV.delete(`history:${noteId}:${old.id}`);
  }
}

export async function getHistoryIndex(noteId: string): Promise<HistoryIndexItem[]> {
  const data = await KV.get(`history:index:${noteId}`, { type: 'json' });
  return Array.isArray(data) ? data : [];
}

export async function getHistoryEntry(noteId: string, version: string): Promise<HistoryEntry | null> {
  return await KV.get(`history:${noteId}:${version}`, { type: 'json' });
}

export async function deleteNoteHistory(noteId: string): Promise<void> {
  const index = await getHistoryIndex(noteId);
  for (const item of index) {
    await KV.delete(`history:${noteId}:${item.id}`);
  }
  await KV.delete(`history:index:${noteId}`);
}
