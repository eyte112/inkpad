import Database from 'better-sqlite3';
import type { IKVStore, KVGetOptions, KVListOptions, KVPutOptions } from '../functions/shared/kv/types';

export function createSqliteKV(dbPath: string): IKVStore {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(
    'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)',
  );

  const now = () => Math.floor(Date.now() / 1000);

  return {
    async get(key: string, options?: KVGetOptions | 'json' | 'text') {
      const row = db.prepare('SELECT value, expires_at FROM kv WHERE key = ?').get(key) as
        | { value: string; expires_at: number | null }
        | undefined;
      if (!row) return null;
      if (row.expires_at && row.expires_at <= now()) {
        db.prepare('DELETE FROM kv WHERE key = ?').run(key);
        return null;
      }
      const wantJson =
        options === 'json' || (typeof options === 'object' && options?.type === 'json');
      return wantJson ? JSON.parse(row.value) : row.value;
    },

    async put(key: string, value: string, options?: KVPutOptions) {
      const ea = options?.expirationTtl ? now() + options.expirationTtl : null;
      db.prepare('INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)').run(
        key,
        value,
        ea,
      );
    },

    async delete(key: string) {
      db.prepare('DELETE FROM kv WHERE key = ?').run(key);
    },

    async list(options?: KVListOptions) {
      const limit = options?.limit ?? 1000;
      const conds = ['(expires_at IS NULL OR expires_at > ?)'];
      const params: any[] = [now()];
      if (options?.prefix) {
        conds.push('key LIKE ?');
        params.push(options.prefix + '%');
      }
      if (options?.cursor) {
        conds.push('key > ?');
        params.push(options.cursor);
      }
      params.push(limit);
      const rows = db
        .prepare(`SELECT key FROM kv WHERE ${conds.join(' AND ')} ORDER BY key LIMIT ?`)
        .all(...params) as { key: string }[];
      const keys = rows.map((r) => ({ name: r.key }));
      return {
        keys,
        cursor: keys.length ? keys[keys.length - 1].name : undefined,
        list_complete: keys.length < limit,
      };
    },
  };
}
