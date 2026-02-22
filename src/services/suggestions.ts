import { api } from './api';
import type { SuggestionIndexItem, Suggestion } from '@/types/share';

export const suggestionsApi = {
  async list(noteId: string, status?: string) {
    const params = status ? `?status=${status}` : '';
    return api.get<SuggestionIndexItem[]>(`/notes/${noteId}/suggestions${params}`);
  },
  async get(id: string) {
    return api.get<Suggestion>(`/suggestions/${id}`);
  },
  async review(id: string, action: 'approve' | 'reject') {
    return api.post<{ success: boolean }>(`/suggestions/${id}/review`, { action });
  },
};
