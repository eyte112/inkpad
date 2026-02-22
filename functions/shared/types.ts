// 笔记类型定义
export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  version: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// 笔记列表项（不含完整内容）
export interface NoteListItem {
  id: string;
  title: string;
  preview: string;
  tags: string[];
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  groupId: string | null;
  noteCount: number;
  createdAt: string;
}

export interface Share {
  slug: string;
  noteId: string;
  customAlias?: string;
  isPublic: boolean;
  password?: string;
  expiresAt?: string;
  visitCount: number;
  allowSuggestion?: boolean;
  createdAt: string;
}

// 历史版本索引项（轻量）
export interface HistoryIndexItem {
  id: string;
  title: string;
  source: 'edit' | 'merge' | 'rollback';
  contentLength?: number;
  createdAt: string;
}

// 历史版本完整快照
export interface HistoryEntry extends HistoryIndexItem {
  noteId: string;
  content: string;
}

// 增量补丁
export interface ContentPatch {
  offset: number;
  deleteCount: number;
  insert: string;
}

// 修改建议
export interface Suggestion {
  id: string;
  noteId: string;
  slug: string;
  nickname: string;
  contact: string;
  newTitle?: string;
  patches?: ContentPatch[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
}

// 建议索引项（轻量）
export interface SuggestionIndexItem {
  id: string;
  slug: string;
  nickname: string;
  contact: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

// 响应类型
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

// 工具函数 - 返回 Response 对象
export function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ code: 0, message: 'success', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function error(code: number, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status: code,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 带 Cookie 的 JSON 响应
export function jsonWithCookie<T>(data: T, cookie: string, status = 200): Response {
  return new Response(JSON.stringify({ code: 0, message: 'success', data }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
}

// 登录时长映射（秒）
export const LOGIN_DURATION_MAP: Record<string, number> = {
  'session': 0,        // Session Cookie
  '7days': 604800,     // 7天
  '30days': 2592000,   // 30天
};


// 生成 Cookie 字符串
export function createAuthCookie(token: string, maxAge: number, secure = true): string {
  const parts = [
    `auth_token=${token}`,
    'Path=/',
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    secure ? 'SameSite=Strict' : 'SameSite=Lax',
  ];
  if (maxAge > 0) {
    parts.push(`Max-Age=${maxAge}`);
  }
  return parts.join('; ');
}

// 清除 Cookie
export function clearAuthCookie(secure = true): string {
  return `auth_token=; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=${secure ? 'Strict' : 'Lax'}; Max-Age=0`;
}

// 根据请求 URL 判断是否 HTTPS
export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

// 短链接编码
function encodeBase62(num: number): string {
  const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (num === 0) return '0';

  let result = '';
  while (num > 0) {
    result = charset[num % 62] + result;
    num = Math.floor(num / 62);
  }
  return result;
}

export { encodeBase62 };

// 图片元数据（注册表）
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

// KV 键前缀常量
export const IMAGE_META_PREFIX = 'image:meta:';
export const IMAGE_INDEX_KEY = 'image:index';
export const IMAGE_HASH_PREFIX = 'image:hash:';
export const IMAGE_PATH_PREFIX = 'image:path:';
export const SMMS_DELETE_PREFIX = 'image:smms-delete:';
export const IMGUR_DELETE_PREFIX = 'image:imgur-delete:';
export const SETTINGS_KEY = 'settings:imagebed';
