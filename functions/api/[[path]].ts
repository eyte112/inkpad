// 静态导入 — 消除动态 import() 导致的 EISDIR 错误
// EISDIR 修复：路由 index.ts 文件必须用 .ts 扩展名导入，否则打包器会把目录当文件读取
import { handleSetup, handleLogin, handleVerify, handleLogout, handleCheckSetup, handleChangePassword, handleResetRequest, handleResetConfirm } from './auth/index.ts';
import { authMiddleware } from '../shared/auth-middleware.ts';
import { handleAuthOptions, handleAuthVerify, handleRegisterOptions, handleRegisterVerify } from '../shared/passkey-handlers.ts';
import { handleCheck as shareSlugCheck, handleGet as shareSlugGet } from './shares/[slug].ts';
import { rebuildIndex } from '../shared/note-index.ts';
import { handleList as noteList, handleCreate as noteCreate, handleGet as noteGet, handleUpdate as noteUpdate, handleDelete as noteDelete, handlePatch as notePatch } from './notes/index.ts';
import { handleSearch } from './notes/search.ts';
import { handleHistoryDetail, handleHistoryList, handleRollback } from '../shared/history-handlers.ts';
import { handleSuggestionList } from '../shared/suggestion-handlers.ts';
import { handleSuggestionReview, handleSuggestionDetail } from '../shared/suggestion-review-handlers.ts';
import { handleList as tagList, handleCreate as tagCreate, handleGroups as tagGroups, handleCreateGroup as tagCreateGroup, handleMove as tagMove, handleMerge as tagMerge, handleUpdateGroup as tagUpdateGroup, handleDeleteGroup as tagDeleteGroup, handleUpdate as tagUpdate, handleDelete as tagDelete } from './tags/index.ts';
import { handleList as shareList, handleCreate as shareCreate, handleStats as shareStats, handleUpdate as shareUpdate, handleDelete as shareDelete } from './shares/index.ts';
import { handleList as imageList } from './images/list.ts';
import { handleUpload as imageUpload } from './images/upload.ts';
import { handleDelete as imageDelete } from './images/delete.ts';
import { handleBatchDelete as imageBatchDelete } from './images/batch-delete.ts';
import { handleConfig as imageConfig } from './images/config.ts';
import { handleProxy as imageProxy } from './images/proxy.ts';

// @ts-ignore - KV 是 EdgeOne Pages 全局变量
declare const KV: any;

function jsonResp(data: any, status = 200): Response {
  return new Response(JSON.stringify({ code: 0, message: 'success', data }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// 路由处理
export async function onRequest(
  context: { request: Request; env: Env; params: Record<string, string> }
): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS 预检请求
  if (method === 'OPTIONS') {
    const origin = request.headers.get('Origin') || '';
    const envOrigins = (typeof process !== 'undefined' && process.env?.CORS_ORIGINS) || '';
    const allowedOrigins = envOrigins ? envOrigins.split(',').map(s => s.trim()) : [];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : '';
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  }

  // 认证路由（无需登录）
  if (path === '/api/auth/setup' && method === 'POST') return handleSetup(request);
  if (path === '/api/auth/login' && method === 'POST') return handleLogin(request);
  if (path === '/api/auth/verify' && method === 'POST') return handleVerify(request);
  if (path === '/api/auth/logout' && method === 'POST') return handleLogout();
  if (path === '/api/auth/check-setup' && method === 'GET') return handleCheckSetup();
  if (path === '/api/auth/change-password' && method === 'POST') return handleChangePassword(request);
  if (path === '/api/auth/reset-request' && method === 'POST') return handleResetRequest(request);
  if (path === '/api/auth/reset-confirm' && method === 'POST') return handleResetConfirm(request);

  // Passkey 路由（无需登录）
  if (path === '/api/auth/passkey/check' && method === 'GET') {
    try {
      const creds = await KV.get('passkey:credentials', { type: 'json' });
      return jsonResp({ hasPasskey: Array.isArray(creds) && creds.length > 0 });
    } catch { return jsonResp({ hasPasskey: false }); }
  }
  if (path === '/api/auth/passkey/auth-options' && method === 'POST') return handleAuthOptions(request);
  if (path === '/api/auth/passkey/auth-verify' && method === 'POST') return handleAuthVerify(request);

  // 公开分享访问（无需登录）
  if (path.match(/^\/api\/share\/[^/]+\/check$/) && method === 'GET') {
    const slug = path.split('/')[3];
    return shareSlugCheck(request, slug);
  }
  if (path.startsWith('/api/share/') && (method === 'GET' || method === 'POST') && !path.endsWith('/check')) {
    const slug = path.split('/').pop();
    return shareSlugGet(request, slug);
  }

  // 以下路由需要认证
  const authResult = await authMiddleware(request);
  if (authResult) return authResult;

  // Passkey 需登录路由
  if (path === '/api/auth/passkey/register-options' && method === 'POST') return handleRegisterOptions(request);
  if (path === '/api/auth/passkey/register-verify' && method === 'POST') return handleRegisterVerify(request);
  if (path === '/api/auth/passkey/list' && method === 'GET') {
    const creds = await KV.get('passkey:credentials', { type: 'json' }) || [];
    return jsonResp(creds.map((c: any) => ({ id: c.id, deviceName: c.deviceName, createdAt: c.createdAt })));
  }
  if (path === '/api/auth/passkey/delete' && method === 'DELETE') {
    const { id } = await request.json() as { id: string };
    if (!id) return new Response(JSON.stringify({ code: 400, message: '缺少凭证 ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const creds = await KV.get('passkey:credentials', { type: 'json' }) || [];
    const filtered = creds.filter((c: any) => c.id !== id);
    if (filtered.length === creds.length) return new Response(JSON.stringify({ code: 404, message: '凭证不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    await KV.put('passkey:credentials', JSON.stringify(filtered));
    return jsonResp({ success: true });
  }

  // 笔记路由
  if (path === '/api/notes/rebuild-index' && method === 'POST') {
    const count = await rebuildIndex();
    return jsonResp({ success: true, count });
  }
  if (path === '/api/notes') {
    if (method === 'GET') return noteList(request);
    if (method === 'POST') return noteCreate(request);
  }
  if (path === '/api/notes/search' && method === 'GET') return handleSearch(request);

  // 笔记增量更新
  if (path.match(/^\/api\/notes\/[^/]+\/patch$/) && method === 'POST') {
    return notePatch(request, path.split('/')[3]);
  }

  // 历史版本
  if (path.match(/^\/api\/notes\/[^/]+\/history\/[^/]+$/) && method === 'GET') {
    const parts = path.split('/');
    return handleHistoryDetail(request, parts[3], parts[5]);
  }
  if (path.match(/^\/api\/notes\/[^/]+\/history$/) && method === 'GET') {
    return handleHistoryList(request, path.split('/')[3]);
  }
  if (path.match(/^\/api\/notes\/[^/]+\/rollback$/) && method === 'POST') {
    return handleRollback(request, path.split('/')[3]);
  }

  // 笔记建议
  if (path.match(/^\/api\/notes\/[^/]+\/suggestions$/) && method === 'GET') {
    return handleSuggestionList(request, path.split('/')[3]);
  }

  // 建议详情与审核
  if (path.match(/^\/api\/suggestions\/[^/]+\/review$/) && method === 'POST') {
    return handleSuggestionReview(request, path.split('/')[3]);
  }
  if (path.match(/^\/api\/suggestions\/[^/]+$/) && method === 'GET') {
    return handleSuggestionDetail(request, path.split('/')[3]);
  }

  // 单篇笔记
  if (path.match(/^\/api\/notes\/[^/]+$/) && path !== '/api/notes/search') {
    const id = path.split('/').pop();
    if (method === 'GET') return noteGet(request, id);
    if (method === 'PUT') return noteUpdate(request, id);
    if (method === 'DELETE') return noteDelete(request, id);
  }

  // 标签路由
  if (path === '/api/tags') {
    if (method === 'GET') return tagList(request);
    if (method === 'POST') return tagCreate(request);
  }
  if (path === '/api/tags/groups') {
    if (method === 'GET') return tagGroups(request);
    if (method === 'POST') return tagCreateGroup(request);
  }
  if (path === '/api/tags/move' && method === 'POST') return tagMove(request);
  if (path === '/api/tags/merge' && method === 'POST') return tagMerge(request);

  if (path.match(/^\/api\/tags\/groups\/[^/]+$/) && path !== '/api/tags/groups') {
    const id = path.split('/').pop();
    if (method === 'PUT') return tagUpdateGroup(request, id);
    if (method === 'DELETE') return tagDeleteGroup(request, id);
  }
  if (path.match(/^\/api\/tags\/[^/]+$/) && !path.includes('/groups') && path !== '/api/tags/move' && path !== '/api/tags/merge') {
    const id = path.split('/').pop();
    if (method === 'PUT') return tagUpdate(request, id);
    if (method === 'DELETE') return tagDelete(request, id);
  }

  // 分享路由
  if (path === '/api/shares') {
    if (method === 'GET') return shareList(request);
    if (method === 'POST') return shareCreate(request);
  }
  if (path.match(/^\/api\/shares\/[^/]+\/stats$/) && method === 'GET') {
    return shareStats(request, path.split('/')[3]);
  }
  if (path.match(/^\/api\/shares\/[^/]+$/) && !path.endsWith('/stats')) {
    const slug = path.split('/').pop();
    if (method === 'PUT') return shareUpdate(request, slug);
    if (method === 'DELETE') return shareDelete(request, slug);
  }

  // 图片路由
  if (path === '/api/images/list' && method === 'GET') return imageList(request);
  if (path === '/api/images/upload' && method === 'POST') return imageUpload(request);
  if (path === '/api/images/delete' && method === 'DELETE') return imageDelete(request);
  if (path === '/api/images/batch-delete' && method === 'POST') return imageBatchDelete(request);
  if (path === '/api/images/config' && method === 'GET') return imageConfig(request);
  if (path === '/api/images/proxy' && method === 'GET') return imageProxy(request);

  return new Response(JSON.stringify({ code: 404, message: 'Not Found', _from: 'catch-all', _path: path, _method: method }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
