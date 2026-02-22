// 笔记类型定义
export interface Note {
  id: string;
  title: string;
  content: string; // Markdown 内容
  html?: string; // 渲染后的 HTML（可选缓存）
  tags: string[]; // 标签 ID 数组
  version: number; // 乐观锁版本号
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteDraft {
  id: string;
  content: string;
  savedAt: string;
  version: number;
}

export interface NoteListItem {
  id: string;
  title: string;
  preview: string;
  tags: string[];
  updatedAt: string;
}

// 统一保存输入（创建或更新）
export interface SaveNoteInput {
  id?: string;           // 有 id 为更新，无 id 为创建
  title: string;
  content: string;
  tags?: string[];
  version?: number;      // 更新时必填
}

export interface CreateNoteInput {
  title: string;
  content: string;
  tags?: string[];
}

export interface UpdateNoteInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  version: number; // 乐观锁
  createSnapshot?: boolean;
}

export interface NoteListResponse {
  notes: NoteListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface HistoryIndexItem {
  id: string;
  title: string;
  source: 'edit' | 'merge' | 'rollback';
  contentLength?: number;
  createdAt: string;
}

export interface HistoryEntry extends HistoryIndexItem {
  noteId: string;
  content: string;
}

// 增量更新输入（用于 Diff）
export interface PatchNoteInput {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: any[];
  version: number;
}

// JSON Patch 操作类型
export type PatchOperation =
  | { op: 'add' | 'replace' | 'remove'; path: string; value?: string }
  | { op: 'test'; path: string; value: string };
