// API 通用类型
import type { APIResponse } from './auth';

// API 错误类型
export interface ApiError {
  code: number;
  message: string;
  errors?: Record<string, string>;
}

// 分页参数
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// 搜索参数
export interface SearchParams extends PaginationParams {
  q?: string;
}

// 排序参数
export interface SortParams {
  field: string;
  order: 'asc' | 'desc';
}

// 通用列表响应
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// 格式化响应辅助函数
export function formatResponse<T>(response: APIResponse<T>): T {
  if (response.code !== 0) {
    throw new Error(response.message || '请求失败');
  }
  return response.data as T;
}
