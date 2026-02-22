import { api } from './api';
import type {
  Tag,
  TagGroup,
  CreateTagInput,
  UpdateTagInput,
  MoveTagInput,
  MergeTagsInput,
} from '@/types/tag';

export const tagsApi = {
  // 获取标签列表（扁平）
  async list() {
    return api.get<Tag[]>('/tags');
  },

  // 获取标签分组（树形）
  async groups() {
    return api.get<TagGroup[]>('/tags/groups');
  },

  // 创建标签
  async create(data: CreateTagInput) {
    return api.post<Tag>('/tags', data);
  },

  // 更新标签
  async update(data: UpdateTagInput) {
    return api.put<Tag>(`/tags/${data.id}`, data);
  },

  // 删除标签
  async delete(id: string) {
    return api.delete(`/tags/${id}`);
  },

  // 移动标签到分组
  async move(data: MoveTagInput) {
    return api.post<void>('/tags/move', data);
  },

  // 合并标签
  async merge(data: MergeTagsInput) {
    return api.post<void>('/tags/merge', data);
  },

  // 创建分组
  async createGroup(name: string) {
    return api.post<TagGroup>('/tags/groups', { name });
  },

  // 删除分组
  async deleteGroup(id: string) {
    return api.delete(`/tags/groups/${id}`);
  },

  // 更新分组
  async updateGroup(id: string, name: string) {
    return api.put<TagGroup>(`/tags/groups/${id}`, { name });
  },
};
