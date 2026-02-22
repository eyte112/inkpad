import { json, error, NoteListItem } from '../../shared/types.ts';
import { getIndex } from '../../shared/note-index.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';

// @ts-ignore - KV 是 EdgeOne Pages 全局变量
declare const KV: any;

// EdgeOne 文件路由入口
export async function onRequest(context: any): Promise<Response> {
  const request: Request = context.request;
  const authError = await authMiddleware(request);
  if (authError) return authError;
  return handleSearch(request);
}

// 搜索笔记（优先从索引匹配标题/preview，需要时按需读取内容）
export async function handleSearch(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');

    if (!query || query.length < 2) {
      return error(400, '搜索词至少 2 个字符');
    }

    const queryLower = query.toLowerCase();
    const index = await getIndex();

    // 先在索引中匹配标题和 preview
    const titleMatches: NoteListItem[] = [];
    const previewMatches: NoteListItem[] = [];
    const needContentSearch: string[] = [];

    for (const item of index) {
      if (item.title?.toLowerCase().includes(queryLower)) {
        titleMatches.push(item);
      } else if (item.preview?.toLowerCase().includes(queryLower)) {
        previewMatches.push(item);
      } else {
        needContentSearch.push(item.id);
      }
    }

    // 如果索引匹配不足 20 条，按需读取内容搜索
    const contentMatches: NoteListItem[] = [];
    if (titleMatches.length + previewMatches.length < 20 && needContentSearch.length > 0) {
      for (const id of needContentSearch) {
        const data = await KV.get(`note:${id}`, { type: 'json' });
        if (data && !data.isDeleted && data.content?.toLowerCase().includes(queryLower)) {
          contentMatches.push({
            id: data.id,
            title: data.title || '',
            preview: (data.content || '').slice(0, 100),
            tags: data.tags || [],
            updatedAt: data.updatedAt,
          });
          if (titleMatches.length + previewMatches.length + contentMatches.length >= 20) break;
        }
      }
    }

    const results = [...titleMatches, ...previewMatches, ...contentMatches];
    results.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(queryLower) ? 1 : 0;
      const bTitle = b.title.toLowerCase().includes(queryLower) ? 1 : 0;
      return bTitle - aTitle || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return json(results.slice(0, 20));
  } catch (err) {
    console.error('Search error:', err);
    return error(500, '搜索失败');
  }
}
