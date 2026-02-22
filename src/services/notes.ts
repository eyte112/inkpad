import { api } from './api';
import type {
  Note,
  CreateNoteInput,
  UpdateNoteInput,
  NoteListResponse,
  PatchNoteInput,
} from '@/types/note';

export const notesApi = {
  // 获取笔记列表
  async list(params?: {
    page?: number;
    limit?: number;
    tag?: string;
    search?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.tag) searchParams.set('tag', params.tag);
    if (params?.search) searchParams.set('search', params.search);

    return api.get<NoteListResponse>(`/notes?${searchParams.toString()}`);
  },

  // 获取单篇笔记
  async get(id: string) {
    return api.get<Note>(`/notes/${id}`);
  },

  // 创建笔记
  async create(data: CreateNoteInput) {
    return api.post<Note>('/notes', data);
  },

  // 更新笔记（全量）
  async update(data: UpdateNoteInput) {
    return api.put<Note>(`/notes/${data.id}`, data);
  },

  // 部分更新笔记（仅更新传入的字段）
  async partialUpdate(data: { id: string; title?: string; content?: string; version: number; createSnapshot?: boolean }) {
    return api.put<Note>(`/notes/${data.id}`, data);
  },

  // 更新笔记（增量）
  async patch(data: PatchNoteInput) {
    return api.post<Note>(`/notes/${data.id}/patch`, data);
  },

  // 删除笔记
  async delete(id: string) {
    return api.delete(`/notes/${id}`);
  },

  // 搜索笔记
  async search(query: string) {
    return api.get<Note[]>(`/notes/search?q=${encodeURIComponent(query)}`);
  },
};
