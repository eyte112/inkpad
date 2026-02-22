// 图片服务

import type { ImageListParams, ImageListResponse } from '@/types/image';

export const imagesApi = {
  // 上传图片
  async upload(file: File): Promise<{ url: string; id: string }> {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch('/api/images/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    let response: any;
    try {
      response = await res.json();
    } catch {
      throw new Error('服务器响应异常，请稍后重试');
    }

    if (!res.ok || response.code !== 0) {
      throw new Error(response.message || '上传失败');
    }

    return response.data;
  },

  // 获取图片列表
  async list(params: ImageListParams = {}): Promise<ImageListResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.search) query.set('search', params.search);

    const res = await fetch(`/api/images/list?${query}`, {
      credentials: 'include',
    });

    const response = await res.json();

    if (!res.ok || response.code !== 0) {
      throw new Error(response.message || '获取图片列表失败');
    }

    return response.data;
  },

  // 删除图片
  async delete(path: string, id?: string): Promise<void> {
    const query = new URLSearchParams({ path });
    if (id) query.set('id', id);

    const res = await fetch(`/api/images/delete?${query}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const response = await res.json();

    if (!res.ok || response.code !== 0) {
      throw new Error(response.message || '删除失败');
    }
  },

  // 批量删除图片
  async batchDelete(ids: string[]): Promise<{ results: { id: string; success: boolean; error?: string }[] }> {
    const res = await fetch('/api/images/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids }),
    });

    const response = await res.json();

    if (!res.ok || response.code !== 0) {
      throw new Error(response.message || '批量删除失败');
    }

    return response.data;
  },
};
