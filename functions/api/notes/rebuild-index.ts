import { error } from '../../shared/types.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';
import { rebuildIndex } from '../../shared/note-index.ts';

// @ts-ignore
declare const KV: any;

export async function onRequest(context: any): Promise<Response> {
  const request: Request = context.request;
  if (request.method !== 'POST') return error(405, 'Method Not Allowed');

  const authError = await authMiddleware(request);
  if (authError) return authError;

  const count = await rebuildIndex();
  return new Response(JSON.stringify({ code: 0, message: 'success', data: { success: true, count } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
