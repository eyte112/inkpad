import { api } from './api';
import type {
  CreateShareInput,
  UpdateShareInput,
  ShareListResponse,
  ShareCheckResponse,
} from '@/types/share';

export const sharesApi = {
  // 获取分享列表
  async list() {
    return api.get<ShareListResponse>('/shares');
  },

  // 创建分享链接
  async create(data: CreateShareInput) {
    return api.post<{ slug: string; url: string; expiresAt?: string; isPublic: boolean }>(
      '/shares',
      data
    );
  },

  // 删除分享
  async delete(slug: string) {
    return api.delete(`/shares/${slug}`);
  },

  // 更新分享
  async update(slug: string, data: UpdateShareInput) {
    return api.put<{ success: boolean }>(`/shares/${slug}`, data);
  },

  // 获取分享统计
  async getStats(slug: string) {
    return api.get<{ visitCount: number; createdAt: string }>(
      `/shares/${slug}/stats`
    );
  },

  // 检查分享是否需要密码（公开访问）
  async checkShare(slug: string) {
    const response = await fetch(`/api/share/${slug}/check`);
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(data.message);
    }
    return data.data as ShareCheckResponse;
  },

  // 根据 slug 获取分享内容（密码通过 POST body 传输）
  async getBySlug(slug: string, password?: string) {
    const url = `/api/share/${slug}`;
    const options: RequestInit = password
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }
      : {};
    const response = await fetch(url, options);
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(data.message);
    }
    return data.data as { id: string; title: string; content: string; createdAt: string; updatedAt: string };
  },

  // 提交修改建议（公开 API）
  async submitSuggestion(
    slug: string,
    data: {
      nickname: string;
      contact: string;
      newTitle?: string;
      patches?: import('@/types/share').ContentPatch[];
      password?: string;
    }
  ) {
    const response = await fetch(`/api/share/${slug}/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (result.code !== 0) throw new Error(result.message);
    return result.data;
  },
};
