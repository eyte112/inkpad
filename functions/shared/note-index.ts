// 笔记索引管理模块 — 消除 N+1 全量扫描
// 用法：import { getIndex, updateIndex, removeFromIndex, rebuildIndex, handleRebuildIndex } from '../shared/note-index.ts';

import { json } from './types.ts';

// @ts-ignore - KV 是 EdgeOne Pages 全局变量
declare const KV: any;

const NOTE_INDEX_KEY = 'note:index';

export interface NoteIndexItem {
  id: string;
  title: string;
  preview: string;    // 前 100 字
  tags: string[];
  updatedAt: string;
}

// 读取索引（1 次 KV 读取）
export async function getIndex(): Promise<NoteIndexItem[]> {
  const data = await KV.get(NOTE_INDEX_KEY, { type: 'json' });
  return Array.isArray(data) ? data : [];
}

// 写入索引
async function saveIndex(index: NoteIndexItem[]): Promise<void> {
  await KV.put(NOTE_INDEX_KEY, JSON.stringify(index));
}

// 新增或更新索引条目
export async function updateIndex(note: {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
}): Promise<void> {
  const index = await getIndex();
  const item: NoteIndexItem = {
    id: note.id,
    title: note.title || '',
    preview: (note.content || '').slice(0, 100),
    tags: note.tags || [],
    updatedAt: note.updatedAt,
  };

  const existing = index.findIndex((i) => i.id === note.id);
  if (existing >= 0) {
    index[existing] = item;
  } else {
    index.push(item);
  }

  await saveIndex(index);
}

// 从索引中移除
export async function removeFromIndex(noteId: string): Promise<void> {
  const index = await getIndex();
  const filtered = index.filter((i) => i.id !== noteId);
  if (filtered.length !== index.length) {
    await saveIndex(filtered);
  }
}

// 重建索引（数据迁移/修复用）
export async function rebuildIndex(): Promise<number> {
  const items: NoteIndexItem[] = [];
  let cursor: string | undefined;

  do {
    const opts: { prefix: string; limit: number; cursor?: string } = { prefix: 'note:', limit: 100 };
    if (cursor) opts.cursor = cursor;

    const result = await KV.list(opts);
    const keys = result?.keys || [];

    for (const key of keys) {
      const keyName = typeof key === 'string' ? key : (key.key || key.name);
      if (!keyName || keyName === NOTE_INDEX_KEY) continue;

      const data = await KV.get(keyName, { type: 'json' });
      if (data && !data.isDeleted) {
        items.push({
          id: data.id,
          title: data.title || '',
          preview: (data.content || '').slice(0, 100),
          tags: data.tags || [],
          updatedAt: data.updatedAt,
        });
      }
    }

    cursor = result?.cursor;
  } while (cursor);

  await saveIndex(items);
  return items.length;
}

export async function handleRebuildIndex(): Promise<Response> {
  const count = await rebuildIndex();
  return json({ success: true, count });
}
