# EdgeOne Pages Functions 指南

## 概述

EdgeOne Pages Functions 是腾讯云 EdgeOne Pages 提供的 Serverless 函数能力，支持三种函数类型，满足不同场景需求。

## 函数类型对比

| 特性 | Edge Functions（边缘函数） | Node Functions（Node 函数） |
|------|--------------------------|---------------------------|
| 目录 | `./edge-functions/` | `./node-functions/` |
| 运行时 | V8 Edge Runtime | Node.js v20.x |
| 部署位置 | 3200+ 全球边缘节点 | 云中心 |
| CPU 时间 | 200ms | 120s（墙钟时间） |
| 代码限制 | 5MB | 128MB |
| 请求体限制 | 1MB | 6MB |
| 语言 | JavaScript ES2023+ | Node.js（完整 npm 生态） |
| WebSocket | ❌ | ✅ |
| 框架支持 | 无 | Express / Koa |
| 冷启动 | 极低（边缘节点） | 较高（云中心） |

> Cloud Functions（云函数）是 Node Functions 的上层分类，目前仅包含 Node Functions，未来可能扩展 Python、Go、PHP 等运行时。

## 三者关系

```
Pages Functions（总称）
├── Edge Functions（边缘函数）
│   └── V8 Runtime，部署在边缘节点，低延迟
└── Cloud Functions（云函数）
    └── Node Functions（Node 函数）
        └── Node.js v20.x，部署在云中心，功能更强
```

## Handler 模式

两种函数类型共享相同的 Handler 模式：

```typescript
// 通用处理器
export function onRequest(context: EventContext) { ... }

// HTTP 方法特定处理器
export function onRequestGet(context: EventContext) { ... }
export function onRequestPost(context: EventContext) { ... }
```

Node Functions 的 `EventContext` 额外包含：`uuid`、`clientIp`、`server`（region, requestId）、`geo` 等属性。

Node Functions 还支持 Express/Koa 框架模式（所有路由写在 `[[default]].js` 中，`export default app`，无需启动 HTTP 服务器）。

## 本地调试

```bash
# 安装 CLI
npm install -g edgeone

# 启动本地开发服务器（同时运行前端 + 函数）
edgeone pages dev
```

## 对本项目的建议

### 当前状态

本项目使用 `functions/` 目录存放后端函数，这是 EdgeOne Pages 的**旧版目录格式**，与新版的 `edge-functions/` 和 `node-functions/` 目录约定不同。目前仍然兼容，但建议关注官方迁移指引。

### 推荐方案

**继续使用 Edge Functions（当前方案）**，原因：

1. **低延迟**：3200+ 边缘节点，用户就近访问
2. **匹配业务场景**：笔记 CRUD、认证、图片代理等操作均为轻量级，不超过 200ms CPU 限制
3. **请求体限制可接受**：1MB 对于笔记内容和图片元数据足够（图片上传走图床代理）
4. **跨平台兼容**：V8 Runtime 使用 Web 标准 API，便于迁移到 Cloudflare Workers 等平台

### 何时考虑 Node Functions

- 需要 WebSocket 实时协作编辑
- 需要使用 npm 包进行复杂文档处理（如 PDF 生成）
- 单次请求处理时间超过 200ms
- 请求体超过 1MB（如大文件直传）
