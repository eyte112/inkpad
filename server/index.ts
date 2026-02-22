import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createSqliteKV } from './kv-sqlite';

// --- 初始化 KV ---
const dbPath = process.env.DB_PATH || './data/cloudnotepad.db';
const dbDir = dirname(resolve(dbPath));
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
(globalThis as any).KV = createSqliteKV(dbPath);

// --- Handler 导入 ---
import {
  handleSetup,
  handleLogin,
  handleVerify,
  handleLogout,
  handleCheckSetup,
  handleChangePassword,
  handleResetRequest,
  handleResetConfirm,
  authMiddleware,
} from '../functions/api/auth/index';
import {
  handleAuthOptions,
  handleAuthVerify,
  handleRegisterOptions,
  handleRegisterVerify,
} from '../functions/shared/passkey-handlers';
import {
  handleCheck as handleShareCheck,
  handleGet as handleShareGet,
} from '../functions/api/shares/[slug]';
import {
  handleList as handleNoteList,
  handleCreate as handleNoteCreate,
  handleGet as handleNoteGet,
  handleUpdate as handleNoteUpdate,
  handleDelete as handleNoteDelete,
  handlePatch as handleNotePatch,
} from '../functions/api/notes/index';
import { handleSearch } from '../functions/api/notes/search';
import { rebuildIndex } from '../functions/shared/note-index';
import {
  handleHistoryList,
  handleHistoryDetail,
  handleRollback,
} from '../functions/shared/history-handlers';
import {
  handleSuggestionList,
} from '../functions/shared/suggestion-handlers';
import {
  handleSuggestionDetail,
  handleSuggestionReview,
} from '../functions/shared/suggestion-review-handlers';
import {
  onRequest as shareOnRequest,
} from '../functions/api/share/[[slug]]';
import {
  handleList as handleTagList,
  handleCreate as handleTagCreate,
  handleUpdate as handleTagUpdate,
  handleDelete as handleTagDelete,
  handleGroups,
  handleCreateGroup,
  handleUpdateGroup,
  handleDeleteGroup,
  handleMove as handleTagMove,
  handleMerge as handleTagMerge,
} from '../functions/api/tags/index';
import {
  handleList as handleShareList,
  handleCreate as handleShareCreate,
  handleUpdate as handleShareUpdate,
  handleDelete as handleShareDelete,
  handleStats as handleShareStats,
} from '../functions/api/shares/index';
import { handleList as handleImageList } from '../functions/api/images/list';
import { handleUpload } from '../functions/api/images/upload';
import { handleDelete as handleImageDelete } from '../functions/api/images/delete';
import { handleBatchDelete } from '../functions/api/images/batch-delete';
import { handleConfig as handleImageConfig } from '../functions/api/images/config';
import { handleProxy } from '../functions/api/images/proxy';
import { onRequest as imagebedSettings } from '../functions/api/settings/imagebed';
import { onRequest as imagebedTest } from '../functions/api/settings/imagebed/test';
import { json as jsonResp } from '../functions/shared/types';

// --- App ---
const app = new Hono();

// CORS origin 白名单（逗号分隔），未配置则仅允许同源
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
);

function getCorsOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  return allowedOrigins.has(origin) ? origin : null;
}

app.options('*', (c) => {
  const origin = getCorsOrigin(c.req.raw);
  return new Response(null, {
    status: 204,
    headers: origin
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
        }
      : {},
  });
});

app.use('/api/*', async (c, next) => {
  await next();
  const origin = getCorsOrigin(c.req.raw);
  if (origin) {
    c.res.headers.set('Access-Control-Allow-Origin', origin);
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
  }
});

// --- 公开路由 ---
app.post('/api/auth/setup', (c) => handleSetup(c.req.raw));
app.post('/api/auth/login', (c) => handleLogin(c.req.raw));
app.post('/api/auth/verify', (c) => handleVerify(c.req.raw));
app.post('/api/auth/logout', () => handleLogout());
app.get('/api/auth/check-setup', () => handleCheckSetup());
app.post('/api/auth/change-password', (c) => handleChangePassword(c.req.raw));
app.post('/api/auth/reset-request', (c) => handleResetRequest(c.req.raw));
app.post('/api/auth/reset-confirm', (c) => handleResetConfirm(c.req.raw));

app.get('/api/auth/passkey/check', async () => {
  try {
    const creds = await (globalThis as any).KV.get('passkey:credentials', { type: 'json' });
    return jsonResp({ hasPasskey: Array.isArray(creds) && creds.length > 0 });
  } catch {
    return jsonResp({ hasPasskey: false });
  }
});
app.post('/api/auth/passkey/auth-options', (c) => handleAuthOptions(c.req.raw));
app.post('/api/auth/passkey/auth-verify', (c) => handleAuthVerify(c.req.raw));

app.get('/api/share/:slug/check', (c) => handleShareCheck(c.req.raw, c.req.param('slug')));
app.post('/api/share/:slug/suggest', (c) => shareOnRequest({ request: c.req.raw }));
app.get('/api/share/:slug', (c) => handleShareGet(c.req.raw, c.req.param('slug')));
app.post('/api/share/:slug', (c) => handleShareGet(c.req.raw, c.req.param('slug')));

// --- Settings（内部自带 authMiddleware）---
app.get('/api/settings/imagebed', (c) => imagebedSettings({ request: c.req.raw }));
app.put('/api/settings/imagebed', (c) => imagebedSettings({ request: c.req.raw }));
app.post('/api/settings/imagebed/test', (c) => imagebedTest({ request: c.req.raw }));

// --- 需认证路由 ---
const authed = new Hono();
authed.use('*', async (c, next) => {
  const res = await authMiddleware(c.req.raw);
  if (res) return res;
  await next();
});

// Passkey
authed.post('/api/auth/passkey/register-options', (c) => handleRegisterOptions(c.req.raw));
authed.post('/api/auth/passkey/register-verify', (c) => handleRegisterVerify(c.req.raw));
authed.get('/api/auth/passkey/list', async () => {
  const creds =
    (await (globalThis as any).KV.get('passkey:credentials', { type: 'json' })) || [];
  return jsonResp(
    creds.map((c: any) => ({ id: c.id, deviceName: c.deviceName, createdAt: c.createdAt })),
  );
});
authed.delete('/api/auth/passkey/delete', async (c) => {
  const { id } = (await c.req.raw.json()) as { id: string };
  if (!id)
    return new Response(JSON.stringify({ code: 400, message: '缺少凭证 ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  const creds =
    (await (globalThis as any).KV.get('passkey:credentials', { type: 'json' })) || [];
  const filtered = creds.filter((cr: any) => cr.id !== id);
  if (filtered.length === creds.length)
    return new Response(JSON.stringify({ code: 404, message: '凭证不存在' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  await (globalThis as any).KV.put('passkey:credentials', JSON.stringify(filtered));
  return jsonResp({ success: true });
});

// Notes
authed.post('/api/notes/rebuild-index', async () => {
  const count = await rebuildIndex();
  return jsonResp({ success: true, count });
});
authed.get('/api/notes/search', (c) => handleSearch(c.req.raw));
authed.get('/api/notes', (c) => handleNoteList(c.req.raw));
authed.post('/api/notes', (c) => handleNoteCreate(c.req.raw));
authed.post('/api/notes/:id/patch', (c) => handleNotePatch(c.req.raw, c.req.param('id')));
authed.get('/api/notes/:id/history/:version', (c) => handleHistoryDetail(c.req.raw, c.req.param('id'), c.req.param('version')));
authed.get('/api/notes/:id/history', (c) => handleHistoryList(c.req.raw, c.req.param('id')));
authed.post('/api/notes/:id/rollback', (c) => handleRollback(c.req.raw, c.req.param('id')));
authed.get('/api/notes/:id/suggestions', (c) => handleSuggestionList(c.req.raw, c.req.param('id')));
authed.get('/api/notes/:id', (c) => handleNoteGet(c.req.raw, c.req.param('id')));
authed.put('/api/notes/:id', (c) => handleNoteUpdate(c.req.raw, c.req.param('id')));
authed.delete('/api/notes/:id', (c) => handleNoteDelete(c.req.raw, c.req.param('id')));

// Suggestions
authed.get('/api/suggestions/:id', (c) => handleSuggestionDetail(c.req.raw, c.req.param('id')));
authed.post('/api/suggestions/:id/review', (c) => handleSuggestionReview(c.req.raw, c.req.param('id')));

// Tags
authed.get('/api/tags/groups', (c) => handleGroups(c.req.raw));
authed.post('/api/tags/groups', (c) => handleCreateGroup(c.req.raw));
authed.put('/api/tags/groups/:id', (c) => handleUpdateGroup(c.req.raw, c.req.param('id')));
authed.delete('/api/tags/groups/:id', (c) =>
  handleDeleteGroup(c.req.raw, c.req.param('id')),
);
authed.post('/api/tags/move', (c) => handleTagMove(c.req.raw));
authed.post('/api/tags/merge', (c) => handleTagMerge(c.req.raw));
authed.get('/api/tags', (c) => handleTagList(c.req.raw));
authed.post('/api/tags', (c) => handleTagCreate(c.req.raw));
authed.put('/api/tags/:id', (c) => handleTagUpdate(c.req.raw, c.req.param('id')));
authed.delete('/api/tags/:id', (c) => handleTagDelete(c.req.raw, c.req.param('id')));

// Shares
authed.get('/api/shares/:slug/stats', (c) =>
  handleShareStats(c.req.raw, c.req.param('slug')),
);
authed.get('/api/shares', (c) => handleShareList(c.req.raw));
authed.post('/api/shares', (c) => handleShareCreate(c.req.raw));
authed.put('/api/shares/:slug', (c) => handleShareUpdate(c.req.raw, c.req.param('slug')));
authed.delete('/api/shares/:slug', (c) =>
  handleShareDelete(c.req.raw, c.req.param('slug')),
);

// Images
authed.get('/api/images/list', (c) => handleImageList(c.req.raw));
authed.post('/api/images/upload', (c) => handleUpload(c.req.raw));
authed.delete('/api/images/delete', (c) => handleImageDelete(c.req.raw));
authed.post('/api/images/batch-delete', (c) => handleBatchDelete(c.req.raw));
authed.get('/api/images/config', (c) => handleImageConfig(c.req.raw));
authed.get('/api/images/proxy', (c) => handleProxy(c.req.raw));

app.route('/', authed);

// --- 静态文件 + SPA fallback ---
const distDir = resolve(process.cwd(), 'dist');
app.use('/*', serveStatic({ root: './dist' }));
app.get('*', (c) => {
  try {
    const html = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
    return c.html(html);
  } catch {
    return c.text('Not Found', 404);
  }
});

// --- 启动 ---
const port = Number(process.env.PORT) || 3000;
console.log(`CloudNotepad server running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
