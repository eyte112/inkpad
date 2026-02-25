<div align="center">

# InkPad

**自托管 Markdown 云笔记，支持实时同步、多平台部署与无密码登录。**

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io-blue?logo=docker)](https://ghcr.io/eyte112/inkpad)

[功能特性](#功能特性) · [预览截图](#预览截图) · [快速开始](#快速开始) · [部署方式](#部署方式) · [本地开发](#本地开发)

<a href="./README.en.md">English</a>

</div>

---

## 功能特性

| | 特性 | 说明 |
|---|------|------|
| :pencil2: | **Markdown 编辑器** | 实时预览，基于 [@uiw/react-md-editor](https://github.com/uiwjs/react-md-editor) |
| :floppy_disk: | **自动保存** | 2 秒防抖 + 乐观锁版本控制 + 冲突检测与合并 |
| :framed_picture: | **多图床上传** | 支持 GitHub / S.EE / Imgur / R2，后端统一代理 |
| :link: | **笔记分享** | 短链接 + 可选密码保护 |
| :key: | **无密码登录** | WebAuthn Passkey（纯 Web Crypto，无服务端依赖） |
| :crescent_moon: | **深色模式** | 跟随系统 + 手动切换 |
| :label: | **标签与搜索** | 快速组织和查找笔记 |
| :clock3: | **历史版本** | 自动记录每次保存，随时查看和回滚到任意历史版本 |
| :bulb: | **修改建议** | 分享页访客可提交修改建议，作者审核后一键采纳 |
| :globe_with_meridians: | **多平台部署** | 统一 KV 抽象接口，一套代码多处运行 |

### 开发计划

- 分享链接后缀自定义（自定义短链 slug）
- 分享过期时间设置
- 笔记导出（PDF / HTML / Markdown 打包下载）
- 阅后即焚（分享内容查看后自动销毁）
- 端到端加密（客户端加密，服务端零知识）

## 预览截图

<p align="center">
  <img src="docs/screenshots/1.png" width="80%" />
</p>
<p align="center">
  <img src="docs/screenshots/2.png" width="80%" />
</p>
<p align="center">
  <img src="docs/screenshots/3.png" width="80%" />
</p>
<p align="center">
  <img src="docs/screenshots/4.png" width="80%" />
</p>

## 技术栈

| 层级 | 技术 |
|:-----|:-----|
| **前端** | React 19 · TypeScript · Vite 7 · Tailwind CSS 4 |
| **状态管理** | Zustand 5 · TanStack Query 5 |
| **UI 组件** | Radix UI · Lucide React |
| **后端** | 平台无关的 TypeScript Handler |
| **数据存储** | 统一 KV 接口（`IKVStore`） |
| **VPS 运行时** | Hono · better-sqlite3 |

## 快速开始

### Docker（推荐）

```bash
docker run -d \
  --name inkpad \
  -p 3000:3000 \
  -v inkpad-data:/app/data \
  ghcr.io/eyte112/inkpad:latest
```

打开 `http://localhost:3000`，首次访问设置密码即可使用。

### Docker Compose

```yaml
services:
  inkpad:
    image: ghcr.io/eyte112/inkpad:latest
    ports:
      - "3000:3000"
    volumes:
      - inkpad-data:/app/data
    restart: unless-stopped

volumes:
  inkpad-data:
```

## 部署方式

### 方式一：VPS / Docker（推荐）

数据持久化在 SQLite，存储于 Docker Volume 中，默认路径 `/app/data/inkpad.db`。

Docker 镜像在每次推送到 `main` 分支或创建版本标签时，由 GitHub Actions 自动构建并发布到 GHCR。

| 环境变量 | 说明 | 默认值 |
|:---------|:-----|:-------|
| `PORT` | 服务端口 | `3000` |
| `DB_PATH` | SQLite 数据库路径 | `./data/inkpad.db` |
| `CORS_ORIGINS` | 允许的跨域来源（逗号分隔） | 仅同源 |

<details>
<summary><b>反向代理配置（Nginx 示例）</b></summary>

```nginx
server {
    listen 443 ssl;
    server_name notes.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10m;
    }
}
```

</details>

<details>
<summary><b>数据备份</b></summary>

```bash
# 备份数据库
docker cp inkpad:/app/data/inkpad.db ./inkpad-backup.db

# 恢复数据库
docker cp ./inkpad-backup.db inkpad:/app/data/inkpad.db
docker restart inkpad
```

</details>

### 方式二：EdgeOne Pages

点击下方按钮一键部署到 EdgeOne Pages：

<a href="https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Feyte112%2Finkpad" target="_blank" rel="noopener noreferrer"><img src="https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg" height="32" alt="Deploy to EdgeOne Pages" /></a>

或手动操作：

1. Fork 或推送代码到 GitHub
2. 登录 [EdgeOne Pages 控制台](https://edgeone.ai/pages)，点击「新建项目」，导入 GitHub 仓库
3. 构建配置：
   - 构建命令：`npm run build`
   - 输出目录：`dist`
4. 创建并绑定 KV 命名空间：
   - 进入项目「设置」→「KV 存储」
   - 创建一个新的 KV 命名空间（名称随意，如 `inkpad-kv`）
   - **绑定变量名必须填大写 `KV`**（代码中通过 `declare const KV` 访问）
5. 触发重新部署，等待构建完成

> **注意**：KV 变量名区分大小写，填写 `kv` 或 `Kv` 都会导致后端 500 错误。

### 方式三：Cloudflare Workers

点击下方按钮一键部署到 Cloudflare Workers：

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/eyte112/inkpad" target="_blank" rel="noopener noreferrer"><img src="https://deploy.workers.cloudflare.com/button" height="32" alt="Deploy to Cloudflare Workers" /></a>

或手动操作：

1. 安装 Wrangler CLI 并登录：
   ```bash
   npm i -g wrangler
   wrangler login
   ```
2. 构建前端：
   ```bash
   npm install
   npm run build
   ```
3. 创建 KV 命名空间：
   ```bash
   wrangler kv namespace create KV
   # 记录返回的 id，如：{ id: "xxxxxxxxxxxx" }
   ```
4. 编辑根目录 `wrangler.jsonc`，将 `kv_namespaces` 中的 `id` 替换为上一步返回的值：
   ```jsonc
   "kv_namespaces": [
     { "binding": "KV", "id": "你的实际 namespace id" }
   ]
   ```
5. 部署：
   ```bash
   npx wrangler deploy
   ```

> **注意**：Cloudflare Workers 的配置文件是根目录下的 `wrangler.jsonc`（非 `.toml`）。

### 方式四：Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Feyte112%2Finkpad)

或手动操作：

1. Fork 或推送代码到 GitHub
2. 登录 [Vercel 控制台](https://vercel.com)，点击「Add New Project」，导入 GitHub 仓库
3. 创建 Upstash Redis 数据库：
   - 在 Vercel 项目「Storage」标签页，点击「Create Database」→ 选择「Upstash KV」
   - 创建完成后环境变量会自动注入（`KV_REST_API_URL`、`KV_REST_API_TOKEN`）
4. 触发重新部署，等待构建完成

> **注意**：如果手动配置 Upstash，环境变量名支持 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 或 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 两种命名。

## 项目结构

```
src/           -> 前端 React SPA
functions/     -> 后端业务逻辑（平台无关）
  ├── api/     -> REST API 路由
  └── shared/  -> 认证、KV 抽象、统一路由器
server/        -> VPS 入口（Hono + SQLite）
platforms/     -> 其他平台入口
  ├── cloudflare/  -> Cloudflare Workers 入口
  └── vercel/      -> Vercel KV 适配器
api/           -> Vercel Serverless Function 入口
```

> **KV 抽象层** — 业务逻辑通过 `IKVStore` 统一接口访问数据。各平台适配器（EdgeOne KV、SQLite、Cloudflare Workers 等）实现该接口。新增平台只需实现接口 + 创建入口文件。

## 本地开发

```bash
git clone https://github.com/eyte112/inkpad.git
cd inkpad
npm install

# VPS 模式（前后端一体，本地 SQLite）
npm run dev:server

# 仅前端（需要已部署的后端）
npm run dev
```

<details>
<summary><b>全部命令</b></summary>

```bash
npm run build          # 前端生产构建
npm run build:server   # 后端生产构建
npm run start:server   # 生产环境启动
npm run lint           # ESLint 检查
npm run format         # Prettier 格式化
```

</details>

## 参与贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feat/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feat/amazing-feature`)
5. 发起 Pull Request

## 许可证

[AGPL-3.0](./LICENSE)
