// EdgeOne Pages 入口 — 所有 /api/* 请求由共享路由器处理
// EISDIR 修复：必须用 .ts 扩展名导入
import { handleRequest } from '../shared/router.ts';

export async function onRequest(
  context: { request: Request; env: Env; params: Record<string, string> }
): Promise<Response> {
  return handleRequest(context.request);
}
