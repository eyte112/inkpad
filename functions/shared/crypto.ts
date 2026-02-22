// 密码哈希模块 — SHA-256 + 随机盐 (Web Crypto API)
// 向后兼容旧格式：pbkdf2:salt:hash 和纯 hex (SHA-256 + 固定盐值)
// 注意：EdgeOne 边缘运行时不支持 PBKDF2，改用 SHA-256 多轮迭代

const LEGACY_SALT = 'cloudnotepad-default-salt-2024';
// 边缘运行时 CPU 时间有限，10000轮会导致 worker 超时返回 "script error"
const SHA256_ITERATIONS = 100;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function sha256(data: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return toHex(new Uint8Array(hashBuffer));
}

// SHA-256 多轮迭代哈希（替代 PBKDF2）
async function iteratedSha256(password: string, salt: string): Promise<string> {
  let hash = password + salt;
  for (let i = 0; i < SHA256_ITERATIONS; i++) {
    hash = await sha256(hash + salt);
  }
  return hash;
}

// PBKDF2 哈希（仅用于验证旧密码，EdgeOne 线上环境可能支持）
async function pbkdf2Hash(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256
  );
  return toHex(new Uint8Array(bits));
}

// 哈希密码，格式：sha256:salt_hex:hash_hex
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(salt);
  const hash = await iteratedSha256(password, saltHex);
  return `sha256:${saltHex}:${hash}`;
}

// 验证密码（支持 sha256 / pbkdf2 / 旧格式）
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('sha256:')) {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    // 兼容旧格式：stored hash 可能是未迭代的 password+salt 原始拼接
    if (parts[2] === password + parts[1]) return true;
    // 兼容旧格式：单次 SHA-256（无迭代）
    const singleHash = await sha256(password + parts[1]);
    if (timingSafeEqual(singleHash, parts[2])) return true;
    // 当前格式：10000轮迭代 SHA-256
    const hash = await iteratedSha256(password, parts[1]);
    return timingSafeEqual(hash, parts[2]);
  }
  if (stored.startsWith('pbkdf2:')) {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    try {
      const hash = await pbkdf2Hash(password, fromHex(parts[1]));
      return timingSafeEqual(hash, parts[2]);
    } catch {
      // EdgeOne 本地 dev 不支持 PBKDF2，返回 false
      return false;
    }
  }
  // 旧格式：纯 hex（SHA-256 + 固定盐值）
  const hash = await sha256(password + LEGACY_SALT);
  return timingSafeEqual(hash, stored);
}

// 检测是否需要升级哈希格式
// 覆盖：pbkdf2 前缀、纯 hex、以及破损的 sha256:salt:非标准hash
export function isLegacyHash(stored: string): boolean {
  if (!stored.startsWith('sha256:')) return true;
  const parts = stored.split(':');
  if (parts.length !== 3) return true;
  // 正确的 SHA-256 哈希固定 64 位 hex，不符合则为旧格式
  return !/^[0-9a-f]{64}$/.test(parts[2]);
}
