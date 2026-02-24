import { STORAGE_KEYS, NOTE_CONFIG } from '@/constants';

/**
 * 获取本地存储值
 */
export function getStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * 设置本地存储值
 */
export function setStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
}

/**
 * 删除本地存储值
 */
export function removeStorage(key: string): void {
  localStorage.removeItem(key);
}

export interface NoteDraft {
  title: string;
  content: string;
  savedAt: string;
  version: number;
  synced: boolean;
}

/**
 * 获取笔记草稿
 */
export function getNoteDraft(noteId: string): NoteDraft | null {
  const key = `${STORAGE_KEYS.DRAFT_PREFIX}${noteId}`;
  return getStorage<NoteDraft | null>(key, null);
}

/**
 * 保存笔记草稿
 */
export function saveNoteDraft(
  noteId: string,
  title: string,
  content: string,
  version: number,
  synced = false
): void {
  const key = `${STORAGE_KEYS.DRAFT_PREFIX}${noteId}`;
  setStorage(key, {
    title,
    content,
    savedAt: new Date().toISOString(),
    version,
    synced,
  });
}

/**
 * 删除笔记草稿
 */
export function clearNoteDraft(noteId: string): void {
  const key = `${STORAGE_KEYS.DRAFT_PREFIX}${noteId}`;
  removeStorage(key);
}

/**
 * 保存笔记草稿历史
 */
export function saveNoteDraftHistory(
  noteId: string,
  patch: unknown,
  fromVersion: number
): void {
  const key = `${STORAGE_KEYS.DRAFT_HISTORY_PREFIX}${noteId}`;
  const history = getStorage<DraftHistoryEntry[]>(
    key,
    []
  );

  const entry = {
    timestamp: new Date().toISOString(),
    fromVersion,
    patch,
  };

  // 只保留最近的 MAX_HISTORY 条
  const newHistory = [entry, ...history].slice(0, NOTE_CONFIG.MAX_HISTORY);
  setStorage(key, newHistory);
}

export interface DraftHistoryEntry {
  timestamp: string;
  fromVersion: number;
  patch: unknown;
}

/**
 * 获取笔记草稿历史
 */
export function getNoteDraftHistory(noteId: string): DraftHistoryEntry[] {
  const key = `${STORAGE_KEYS.DRAFT_HISTORY_PREFIX}${noteId}`;
  return getStorage<DraftHistoryEntry[]>(key, []);
}

/**
 * 清除笔记草稿历史
 */
export function clearNoteDraftHistory(noteId: string): void {
  const key = `${STORAGE_KEYS.DRAFT_HISTORY_PREFIX}${noteId}`;
  removeStorage(key);
}

/**
 * 清除所有笔记草稿
 */
export function clearAllDrafts(): void {
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (
      key.startsWith(STORAGE_KEYS.DRAFT_PREFIX) ||
      key.startsWith(STORAGE_KEYS.DRAFT_HISTORY_PREFIX)
    ) {
      removeStorage(key);
    }
  });
}
