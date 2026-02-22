/**
 * 统一 KV 存储接口
 * 所有平台适配器（EdgeOne / SQLite / Cloudflare / 阿里云 ESA）均需实现此接口
 */

export interface KVGetOptions {
  type?: 'json' | 'text' | 'arrayBuffer' | 'stream';
}

export interface KVPutOptions {
  expirationTtl?: number; // 秒
}

export interface KVListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

export interface KVListKey {
  name: string;
}

export interface KVListResult {
  keys: KVListKey[];
  cursor?: string;
  list_complete: boolean;
}

export interface IKVStore {
  get(key: string, options?: KVGetOptions | 'json' | 'text'): Promise<any>;
  put(key: string, value: string, options?: KVPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVListOptions): Promise<KVListResult>;
}
