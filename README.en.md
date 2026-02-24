<div align="center">

# InkPad

**Self-hosted Markdown note-taking app with real-time sync, multi-platform deployment, and passwordless login.**

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io-blue?logo=docker)](https://ghcr.io/eyte112/inkpad)

[![Deploy to EdgeOne Pages](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Feyte112%2Finkpad)
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/eyte112/inkpad)

[Features](#features) · [Screenshots](#screenshots) · [Quick Start](#quick-start) · [Deployment](#deployment) · [Development](#development)

<a href="./README.md">中文文档</a>

</div>

---

## Features

| | Feature | Description |
|---|---------|-------------|
| :pencil2: | **Markdown Editor** | Real-time preview powered by [@uiw/react-md-editor](https://github.com/uiwjs/react-md-editor) |
| :floppy_disk: | **Auto-save** | 2s debounce + optimistic locking + conflict detection & merge |
| :framed_picture: | **Multi Image Hosting** | Upload to GitHub / S.EE / Imgur / R2 via backend proxy |
| :link: | **Note Sharing** | Short links with optional password protection |
| :key: | **Passwordless Login** | WebAuthn Passkey (pure Web Crypto, no server-side deps) |
| :crescent_moon: | **Dark Mode** | System-aware with manual toggle |
| :label: | **Tags & Search** | Organize and find notes quickly |
| :clock3: | **Version History** | Auto-saves every edit, view and restore any previous version |
| :bulb: | **Edit Suggestions** | Visitors can submit suggestions on shared notes, author reviews and accepts |
| :globe_with_meridians: | **Multi-platform** | Deploy anywhere with unified KV abstraction |

### Roadmap

- Custom share link slugs
- Share link expiration settings
- Note export (PDF / HTML / Markdown bundle download)
- Burn after reading (auto-destroy shared content after viewing)
- End-to-end encryption (client-side encryption, zero-knowledge server)

## Screenshots

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

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Frontend** | React 19 · TypeScript · Vite 7 · Tailwind CSS 4 |
| **State** | Zustand 5 · TanStack Query 5 |
| **UI** | Radix UI · Lucide React |
| **Backend** | Platform-agnostic handlers (TypeScript) |
| **Storage** | Unified KV interface (`IKVStore`) |
| **VPS Runtime** | Hono · better-sqlite3 |

## Quick Start

### Docker (Recommended)

```bash
docker run -d \
  --name inkpad \
  -p 3000:3000 \
  -v inkpad-data:/app/data \
  ghcr.io/eyte112/inkpad:latest
```

Open `http://localhost:3000`, set your password on first visit.

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

## Deployment

### Option 1: VPS / Docker

Data is persisted in SQLite at `/app/data/inkpad.db`.

| Env Variable | Description | Default |
|:-------------|:------------|:--------|
| `PORT` | Server port | `3000` |
| `DB_PATH` | SQLite database path | `./data/inkpad.db` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | Same-origin only |

### Option 2: EdgeOne Pages

1. Push code to GitHub
2. Import in [EdgeOne Pages Console](https://console.cloud.tencent.com/edgeone/pages)
3. Build command: `npm run build`, output: `dist`
4. Create KV namespace and bind to Functions

### Option 3: Cloudflare Workers

1. Install Wrangler CLI: `npm i -g wrangler`
2. Create KV namespace: `wrangler kv namespace create KV`
3. Add the returned `id` to `kv_namespaces` in `wrangler.toml`
4. Deploy: `wrangler deploy`

## Architecture

```
src/           -> Frontend React SPA
functions/     -> Backend handlers (platform-agnostic)
  ├── api/     -> REST API routes
  └── shared/  -> Auth, KV abstraction, unified router
server/        -> VPS entry (Hono + SQLite)
platforms/     -> Other platform entries
  └── cloudflare/  -> Cloudflare Workers entry
```

> **KV Abstraction** — Business logic talks to `IKVStore` interface. Platform adapters (EdgeOne KV, SQLite, Cloudflare Workers, etc.) implement it. Add a new platform by implementing the interface + creating an entry file.

## Development

```bash
git clone https://github.com/eyte112/inkpad.git
cd inkpad
npm install

# VPS mode (full-stack, local SQLite)
npm run dev:server

# Frontend only (needs deployed backend)
npm run dev
```

<details>
<summary><b>All Commands</b></summary>

```bash
npm run build          # Frontend production build
npm run build:server   # Backend production build
npm run start:server   # Production start
npm run lint           # ESLint check
npm run format         # Prettier format
```

</details>

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

## License

[AGPL-3.0](./LICENSE)
