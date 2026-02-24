/**
 * 共享路由器 — 所有平台入口的统一路由分发
 * 新增 API 只需在 routes 数组中添加一行
 */

import { authMiddleware } from './auth-middleware.ts';

// --- Handler 导入 ---
import {
  handleSetup, handleLogin, handleVerify, handleLogout,
  handleCheckSetup, handleChangePassword, handleResetRequest, handleResetConfirm,
} from '../api/auth/index.ts';
import {
  handleAuthOptions, handleAuthVerify, handleRegisterOptions, handleRegisterVerify,
  handlePasskeyCheck, handlePasskeyList, handlePasskeyDelete,
} from './passkey-handlers.ts';
import {
  handleList as noteList, handleCreate as noteCreate,
  handleGet as noteGet, handleUpdate as noteUpdate,
  handleDelete as noteDelete, handlePatch as notePatch,
} from '../api/notes/index.ts';
import { handleSearch } from '../api/notes/search.ts';
import { handleRebuildIndex } from './note-index.ts';
import { handleHistoryList, handleHistoryDetail, handleRollback } from './history-handlers.ts';
import { handleSuggestionList } from './suggestion-handlers.ts';
import { handleSuggestionDetail, handleSuggestionReview } from './suggestion-review-handlers.ts';
import { handleShareAccess as shareOnRequest } from '../api/share/[[slug]].ts';
import { handleCheck as shareSlugCheck, handleGet as shareSlugGet } from '../api/shares/[slug].ts';
import {
  handleList as shareList, handleCreate as shareCreate,
  handleUpdate as shareUpdate, handleDelete as shareDelete,
  handleStats as shareStats,
} from '../api/shares/index.ts';
import {
  handleList as tagList, handleCreate as tagCreate,
  handleUpdate as tagUpdate, handleDelete as tagDelete,
  handleGroups as tagGroups, handleCreateGroup as tagCreateGroup,
  handleUpdateGroup as tagUpdateGroup, handleDeleteGroup as tagDeleteGroup,
  handleMove as tagMove, handleMerge as tagMerge,
} from '../api/tags/index.ts';
import { handleList as imageList } from '../api/images/list.ts';
import { handleUpload as imageUpload } from '../api/images/upload.ts';
import { handleDelete as imageDelete } from '../api/images/delete.ts';
import { handleBatchDelete as imageBatchDelete } from '../api/images/batch-delete.ts';
import { handleConfig as imageConfig } from '../api/images/config.ts';
import { handleProxy as imageProxy } from '../api/images/proxy.ts';
import { handleImagebedSettings as imagebedSettings } from '../api/settings/imagebed.ts';
import { handleImagebedTest as imagebedTest } from '../api/settings/imagebed/test.ts';

// --- 类型定义 ---
type RouteHandler = (request: Request, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: string;
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  handler: RouteHandler;
  auth: boolean;
}

// --- 路径编译 ---
function compilePath(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

function route(method: string, pattern: string, handler: RouteHandler, auth = true): Route {
  const { regex, paramNames } = compilePath(pattern);
  return { method, pattern, regex, paramNames, handler, auth };
}

// onRequest 风格 handler 包装器
function wrap(fn: (ctx: any) => Promise<Response>): RouteHandler {
  return (request) => fn({ request });
}

// --- 路由表 ---
const routes: Route[] = [
  // 公开认证路由
  route('POST', '/api/auth/setup', (r) => handleSetup(r), false),
  route('POST', '/api/auth/login', (r) => handleLogin(r), false),
  route('POST', '/api/auth/verify', (r) => handleVerify(r), false),
  route('POST', '/api/auth/logout', (r) => handleLogout(r), false),
  route('GET', '/api/auth/check-setup', () => handleCheckSetup(), false),
  route('POST', '/api/auth/change-password', (r) => handleChangePassword(r), false),
  route('POST', '/api/auth/reset-request', (r) => handleResetRequest(r), false),
  route('POST', '/api/auth/reset-confirm', (r) => handleResetConfirm(r), false),

  // Passkey 公开路由
  route('GET', '/api/auth/passkey/check', () => handlePasskeyCheck(), false),
  route('POST', '/api/auth/passkey/auth-options', (r) => handleAuthOptions(r), false),
  route('POST', '/api/auth/passkey/auth-verify', (r) => handleAuthVerify(r), false),

  // 公开分享访问
  route('GET', '/api/share/:slug/check', (r, p) => shareSlugCheck(r, p.slug), false),
  route('POST', '/api/share/:slug/suggest', wrap(shareOnRequest), false),
  route('GET', '/api/share/:slug', (r, p) => shareSlugGet(r, p.slug), false),
  route('POST', '/api/share/:slug', (r, p) => shareSlugGet(r, p.slug), false),

  // Settings（内部自带 authMiddleware，不重复认证）
  route('GET', '/api/settings/imagebed', wrap(imagebedSettings), false),
  route('PUT', '/api/settings/imagebed', wrap(imagebedSettings), false),
  route('POST', '/api/settings/imagebed/test', wrap(imagebedTest), false),

  // Passkey 需认证路由
  route('POST', '/api/auth/passkey/register-options', (r) => handleRegisterOptions(r)),
  route('POST', '/api/auth/passkey/register-verify', (r) => handleRegisterVerify(r)),
  route('GET', '/api/auth/passkey/list', () => handlePasskeyList()),
  route('DELETE', '/api/auth/passkey/delete', (r) => handlePasskeyDelete(r)),

  // 笔记路由
  route('POST', '/api/notes/rebuild-index', () => handleRebuildIndex()),
  route('GET', '/api/notes/search', (r) => handleSearch(r)),
  route('GET', '/api/notes', (r) => noteList(r)),
  route('POST', '/api/notes', (r) => noteCreate(r)),
  route('POST', '/api/notes/:id/patch', (r, p) => notePatch(r, p.id)),
  route('GET', '/api/notes/:id/history/:version', (r, p) => handleHistoryDetail(r, p.id, p.version)),
  route('GET', '/api/notes/:id/history', (r, p) => handleHistoryList(r, p.id)),
  route('POST', '/api/notes/:id/rollback', (r, p) => handleRollback(r, p.id)),
  route('GET', '/api/notes/:id/suggestions', (r, p) => handleSuggestionList(r, p.id)),
  route('GET', '/api/notes/:id', (r, p) => noteGet(r, p.id)),
  route('PUT', '/api/notes/:id', (r, p) => noteUpdate(r, p.id)),
  route('DELETE', '/api/notes/:id', (r, p) => noteDelete(r, p.id)),

  // 建议路由
  route('POST', '/api/suggestions/:id/review', (r, p) => handleSuggestionReview(r, p.id)),
  route('GET', '/api/suggestions/:id', (r, p) => handleSuggestionDetail(r, p.id)),

  // 标签路由
  route('GET', '/api/tags/groups', (r) => tagGroups(r)),
  route('POST', '/api/tags/groups', (r) => tagCreateGroup(r)),
  route('PUT', '/api/tags/groups/:id', (r, p) => tagUpdateGroup(r, p.id)),
  route('DELETE', '/api/tags/groups/:id', (r, p) => tagDeleteGroup(r, p.id)),
  route('POST', '/api/tags/move', (r) => tagMove(r)),
  route('POST', '/api/tags/merge', (r) => tagMerge(r)),
  route('GET', '/api/tags', (r) => tagList(r)),
  route('POST', '/api/tags', (r) => tagCreate(r)),
  route('PUT', '/api/tags/:id', (r, p) => tagUpdate(r, p.id)),
  route('DELETE', '/api/tags/:id', (r, p) => tagDelete(r, p.id)),

  // 分享管理路由
  route('GET', '/api/shares', (r) => shareList(r)),
  route('POST', '/api/shares', (r) => shareCreate(r)),
  route('GET', '/api/shares/:slug/stats', (r, p) => shareStats(r, p.slug)),
  route('PUT', '/api/shares/:slug', (r, p) => shareUpdate(r, p.slug)),
  route('DELETE', '/api/shares/:slug', (r, p) => shareDelete(r, p.slug)),

  // 图片路由
  route('GET', '/api/images/list', (r) => imageList(r)),
  route('POST', '/api/images/upload', (r) => imageUpload(r)),
  route('DELETE', '/api/images/delete', (r) => imageDelete(r)),
  route('POST', '/api/images/batch-delete', (r) => imageBatchDelete(r)),
  route('GET', '/api/images/config', (r) => imageConfig(r)),
  route('GET', '/api/images/proxy', (r) => imageProxy(r)),
];

// --- CORS 处理 ---
function getCorsOrigin(request: Request): string {
  const origin = request.headers.get('Origin') || '';
  const envOrigins = (typeof process !== 'undefined' && process.env?.CORS_ORIGINS) || '';
  if (!envOrigins) return '';
  const allowed = envOrigins.split(',').map((s) => s.trim());
  return allowed.includes(origin) ? origin : '';
}

function corsHeaders(origin: string): Record<string, string> {
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// --- 主入口 ---
export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const corsOrigin = getCorsOrigin(request);

  // CORS 预检
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
  }

  // 路由匹配
  for (const r of routes) {
    if (r.method !== method) continue;
    const match = path.match(r.regex);
    if (!match) continue;

    // 提取参数
    const params: Record<string, string> = {};
    r.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]);
    });

    // 认证检查
    if (r.auth) {
      const authResult = await authMiddleware(request);
      if (authResult) return addCors(authResult, corsOrigin);
    }

    const response = await r.handler(request, params);
    return addCors(response, corsOrigin);
  }

  // 404
  const body = JSON.stringify({ code: 404, message: 'Not Found' });
  return addCors(
    new Response(body, { status: 404, headers: { 'Content-Type': 'application/json' } }),
    corsOrigin,
  );
}

function addCors(response: Response, origin: string): Response {
  if (!origin) return response;
  const res = new Response(response.body, response);
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  return res;
}
