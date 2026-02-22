// 图片元数据
export interface ImageMeta {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
  provider: 'github' | 'r2' | 'smms' | 'imgur';
  hash: string;
  uploadedAt: string;
}

// 图片列表响应
export interface ImageListResponse {
  images: ImageMeta[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// 图片列表查询参数
export interface ImageListParams {
  page?: number;
  limit?: number;
  search?: string;
}
