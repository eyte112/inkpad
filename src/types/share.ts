// 分享类型定义
export interface Share {
  slug: string;
  noteId: string;
  customAlias?: string;
  isPublic: boolean;
  password?: string;
  expiresAt?: string;
  allowSuggestion?: boolean;
  visitCount: number;
  createdAt: string;
}

export interface CreateShareInput {
  noteId: string;
  customAlias?: string;
  expiresInDays?: number;
  isPublic?: boolean;
  password?: string;
  allowSuggestion?: boolean;
}

export interface UpdateShareInput {
  expiresInDays?: number;
  isPublic?: boolean;
  password?: string;
  allowSuggestion?: boolean;
}

export interface ShareCheckResponse {
  slug: string;
  isPublic: boolean;
  requiresPassword: boolean;
  allowSuggestion?: boolean;
}

export interface ShareResponse {
  slug: string;
  url: string;
  expiresAt?: string;
}

export interface ShareListResponse {
  shares: Share[];
  total: number;
}

export interface SuggestionIndexItem {
  id: string;
  slug: string;
  nickname: string;
  contact: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

// 增量补丁
export interface ContentPatch {
  offset: number;
  deleteCount: number;
  insert: string;
}

export interface Suggestion extends SuggestionIndexItem {
  noteId: string;
  newTitle?: string;
  patches?: ContentPatch[];
  reviewedAt?: string;
}
