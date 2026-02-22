// JWT 认证模块 — 使用 SHA-256 签名（兼容 EdgeOne 边缘运行时）
// EdgeOne 不支持 crypto.subtle.importKey，改用 digest 实现

const DEFAULT_SECRET = 'cloudnotepad-jwt-fallback-2024';

export function getJwtSecret(): string {
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any).JWT_SECRET) {
      return (globalThis as any).JWT_SECRET;
    }
  } catch { /* ignore */ }
  return DEFAULT_SECRET;
}

function base64urlEncodeStr(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecodeStr(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded);
}

// 用 SHA-256(data + secret) 做签名
async function sign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data + secret));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return base64urlEncodeStr(hashArray.map(b => String.fromCharCode(b)).join(''));
}

interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
  duration: string;
}

export async function generateToken(duration: string, secret: string): Promise<string> {
  const DURATION_MAP: Record<string, number> = {
    'session': 86400,
    '7days': 604800,
    '30days': 2592000,
  };

  const maxAge = DURATION_MAP[duration] || DURATION_MAP['7days'];
  const now = Math.floor(Date.now() / 1000);

  const header = base64urlEncodeStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64urlEncodeStr(JSON.stringify({
    sub: 'user', iat: now, exp: now + maxAge, duration,
  } satisfies TokenPayload));

  const sigInput = `${header}.${payload}`;
  const signature = await sign(sigInput, secret);

  return `${sigInput}.${signature}`;
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<{ valid: boolean; payload?: TokenPayload }> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };

    const [header, payload, signature] = parts;
    const sigInput = `${header}.${payload}`;
    const expected = await sign(sigInput, secret);

    if (expected !== signature) return { valid: false };

    const decoded = JSON.parse(base64urlDecodeStr(payload)) as TokenPayload;
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      return { valid: false };
    }

    return { valid: true, payload: decoded };
  } catch {
    return { valid: false };
  }
}
