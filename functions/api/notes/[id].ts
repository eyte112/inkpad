import { error } from '../../shared/types.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';
import { handleGet, handleUpdate, handleDelete, handlePatch } from './index.ts';

// EdgeOne 文件路由：/api/notes/:id 和 /api/notes/:id/patch
export async function onRequest(context: any): Promise<Response> {
  const request: Request = context.request;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 认证
  const authError = await authMiddleware(request);
  if (authError) return authError;

  // 从 URL 解析 id
  const segments = path.replace(/\/$/, '').split('/');
  // /api/notes/:id => segments = ['', 'api', 'notes', ':id']
  // /api/notes/:id/patch => segments = ['', 'api', 'notes', ':id', 'patch']
  const id = decodeURIComponent(segments[3] || '');
  if (!id) return error(400, '缺少笔记 ID');

  // /api/notes/:id/patch
  if (segments[4] === 'patch' && method === 'POST') {
    return handlePatch(request, id);
  }

  // /api/notes/:id
  if (method === 'GET') return handleGet(request, id);
  if (method === 'PUT') return handleUpdate(request, id);
  if (method === 'DELETE') return handleDelete(request, id);

  return error(405, 'Method Not Allowed');
}
