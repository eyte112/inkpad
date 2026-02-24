// Cloudflare Workers 入口
import { handleRequest } from '../../functions/shared/router';

interface Env {
  KV: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    (globalThis as any).KV = env.KV;
    return handleRequest(request);
  },
};
