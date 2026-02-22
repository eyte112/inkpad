import { api } from './api';
import type { Note, HistoryIndexItem, HistoryEntry } from '@/types/note';

export const historyApi = {
  async list(noteId: string) {
    return api.get<HistoryIndexItem[]>(`/notes/${noteId}/history`);
  },
  async get(noteId: string, version: string) {
    return api.get<HistoryEntry>(`/notes/${noteId}/history/${version}`);
  },
  async rollback(noteId: string, version: number, currentVersion: number) {
    return api.post<Note>(`/notes/${noteId}/rollback`, { version, currentVersion });
  },
};
