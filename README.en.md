<div align="center">

# InkPad

**Self-hosted Markdown note-taking app with real-time sync, multi-platform deployment, and passwordless login.**

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io-blue?logo=docker)](https://ghcr.io/eyte112/inkpad)

[Features](#features) · [Screenshots](#screenshots) · [Quick Start](#quick-start) · [Deployment](#deployment) · [Development](#development)

<a href="./README.md">中文文档</a>

</div>

---

> [!CAUTION]
> This project was developed with AI assistance and may contain unknown security vulnerabilities. Do not use it to store sensitive information (passwords, keys, private data, etc.). Use at your own risk.

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
| :globe_with_meridians: | **Multi-platform** | Deploy anywhere with unified KV abstraction |

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

Data is persisted in SQLite at `/app/data/cloudnotepad.db`.

| Env Variable | Description | Default |
|:-------------|:------------|:--------|
| `PORT` | Server port | `3000` |
| `DB_PATH` | SQLite database path | `./data/cloudnotepad.db` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | Same-origin only |

### Option 2: EdgeOne Pages

1. Push code to GitHub
2. Import in [EdgeOne Pages Console](https://console.cloud.tencent.com/edgeone/pages)
3. Build command: `npm run build`, output: `dist`
4. Create KV namespace and bind to Functions

## Architecture

```
src/           -> Frontend React SPA
functions/     -> Backend handlers (platform-agnostic)
  ├── api/     -> REST API routes
  └── shared/  -> Auth, KV abstraction, utilities
server/        -> VPS entry (Hono + SQLite)
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
