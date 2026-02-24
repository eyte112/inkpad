import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createSqliteKV } from './kv-sqlite';
import { handleRequest } from '../functions/shared/router';

// --- 初始化 KV ---
const dbPath = process.env.DB_PATH || './data/cloudnotepad.db';
const dbDir = dirname(resolve(dbPath));
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
(globalThis as any).KV = createSqliteKV(dbPath);

// --- App ---
const app = new Hono();

// 所有 /api/* 请求委托给共享路由器
app.all('/api/*', (c) => handleRequest(c.req.raw));

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
console.log(`InkPad server running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
