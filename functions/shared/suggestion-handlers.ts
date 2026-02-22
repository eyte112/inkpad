import { json, error } from './types.ts';

// @ts-ignore
declare const KV: any;

export async function handleSuggestionList(request: Request, noteId: string): Promise<Response> {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');

    let index: any[] =
      (await KV.get(`suggestion:index:${noteId}`, { type: 'json' })) || [];

    if (status) {
      index = index.filter((s: any) => s.status === status);
    }

    return json(index);
  } catch (err) {
    console.error('List suggestions error:', err);
    return error(500, '获取建议列表失败');
  }
}
