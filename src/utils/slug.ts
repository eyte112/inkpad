/**
 * 短链接生成器
 * 使用 Base62 编码 (0-9, a-z, A-Z)
 */

// Base62 字符集
const CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * 数字转 Base62 字符串
 */
export function encodeBase62(num: number): string {
  if (num === 0) return '0';

  let result = '';
  while (num > 0) {
    result = CHARSET[num % 62] + result;
    num = Math.floor(num / 62);
  }

  return result;
}

/**
 * Base62 字符串转数字
 */
export function decodeBase62(str: string): number {
  let result = 0;
  for (let i = 0; i < str.length; i++) {
    result = result * 62 + CHARSET.indexOf(str[i]);
  }
  return result;
}

/**
 * 生成随机短 slug (用于自定义别名场景)
 */
export function generateRandomSlug(length: number = 8): string {
  const result: string[] = [];
  for (let i = 0; i < length; i++) {
    result.push(CHARSET[Math.floor(Math.random() * 62)]);
  }
  return result.join('');
}

/**
 * 验证 slug 格式
 */
export function isValidSlug(slug: string): boolean {
  // 只能包含数字、字母和连字符
  return /^[a-zA-Z0-9-]+$/.test(slug);
}

/**
 * 验证自定义别名
 */
export function validateCustomAlias(alias: string): { valid: boolean; message?: string } {
  if (alias.length < 3) {
    return { valid: false, message: '别名至少 3 个字符' };
  }
  if (alias.length > 30) {
    return { valid: false, message: '别名最多 30 个字符' };
  }
  if (!isValidSlug(alias)) {
    return { valid: false, message: '别名只能包含字母、数字和连字符' };
  }
  // 不能是纯数字
  if (/^\d+$/.test(alias)) {
    return { valid: false, message: '别名不能全为数字' };
  }

  return { valid: true };
}

/**
 * 生成短链接 URL
 */
export function buildShareUrl(slug: string, baseUrl?: string): string {
  const base = baseUrl || window.location.origin;
  return `${base}/s/${slug}`;
}
