/**
 * Upstash Redis KV 适配器 — 基于 REST API 原生 fetch 实现
 * 用于 Vercel Serverless Functions 部署
 *
 * 依据：https://upstash.com/docs/redis/features/restapi
 * 使用 POST body JSON 数组格式发送命令，避免 @upstash/redis SDK 兼容性问题
 */

import type {
  IKVStore,
  KVGetOptions,
  KVListOptions,
  KVPutOptions,
} from '../../functions/shared/kv/types';

/** 向 Upstash REST API 发送 Redis 命令 */
async function execCommand(
  url: string,
  token: string,
  command: (string | number)[],
): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Upstash: ${data.error}`);
  return data.result;
}

export function createUpstashKV(url: string, token: string): IKVStore {
  return {
    async get(key: string, options?: KVGetOptions | 'json' | 'text') {
      const value = await execCommand(url, token, ['GET', key]);
      if (value === null || value === undefined) return null;

      const wantJson =
        options === 'json' ||
        (typeof options === 'object' && options?.type === 'json');
      return wantJson ? JSON.parse(value as string) : value;
    },

    async put(key: string, value: string, options?: KVPutOptions) {
      if (options?.expirationTtl) {
        await execCommand(url, token, [
          'SET', key, value, 'EX', options.expirationTtl,
        ]);
      } else {
        await execCommand(url, token, ['SET', key, value]);
      }
    },

    async delete(key: string) {
      await execCommand(url, token, ['DEL', key]);
    },

    async list(options?: KVListOptions) {
      const limit = options?.limit ?? 1000;
      const matchPattern = options?.prefix ? `${options.prefix}*` : '*';

      // 完整扫描所有匹配 key，然后用 key name 做基于排序的分页
      // 参考 SQLite 适配器的分页逻辑，避免 Redis SCAN cursor 的不可靠性
      const allKeys: string[] = [];
      let cursor = 0;

      do {
        const result = await execCommand(url, token, [
          'SCAN', cursor, 'MATCH', matchPattern, 'COUNT', 100,
        ]);
        // SCAN 返回 [nextCursor, [key1, key2, ...]]
        const nextCursor = typeof result[0] === 'number'
          ? result[0]
          : Number(result[0]);
        const keys: string[] = result[1] || [];
        for (const k of keys) {
          allKeys.push(typeof k === 'string' ? k : String(k));
        }
        cursor = nextCursor;
      } while (cursor !== 0);

      // 排序后基于 cursor（key name）分页，与 SQLite 适配器一致
      allKeys.sort();

      let startIdx = 0;
      if (options?.cursor) {
        startIdx = allKeys.findIndex((k) => k > options.cursor!);
        if (startIdx === -1) startIdx = allKeys.length;
      }

      const page = allKeys.slice(startIdx, startIdx + limit);

      return {
        keys: page.map((name) => ({ name })),
        cursor: page.length ? page[page.length - 1] : undefined,
        list_complete: startIdx + limit >= allKeys.length,
      };
    },
  };
}
