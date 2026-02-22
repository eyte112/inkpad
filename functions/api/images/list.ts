import { json, error, ImageMeta, IMAGE_META_PREFIX, IMAGE_INDEX_KEY } from '../../shared/types.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';

// @ts-ignore - KV 是 EdgeOne Pages 的全局变量
declare const KV: any;

// EdgeOne 文件路由兼容
export async function onRequest(context: any): Promise<Response> {
  const authError = await authMiddleware(context.request);
  if (authError) return authError;
  return handleList(context.request);
}

// GET /api/images/list - 获取图片列表（支持分页和搜索）
export async function handleList(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20') || 20));
    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';

    // 读取索引（兼容旧格式 string[] 和新格式 { id, filename }[]）
    const indexRaw = await KV.get(IMAGE_INDEX_KEY, 'json');
    const rawIndex: Array<string | { id: string; filename: string }> = indexRaw || [];

    if (rawIndex.length === 0) {
      return json({ images: [], total: 0, page, limit, hasMore: false });
    }

    // 标准化索引项
    const index = rawIndex.map(item =>
      typeof item === 'string' ? { id: item, filename: '' } : item
    );

    let resultImages: ImageMeta[];
    let total: number;

    if (search) {
      // 先在索引中按 filename 过滤（新格式可直接匹配，旧格式 filename 为空则回退读 meta）
      const matched: string[] = [];
      const unknown: string[] = [];
      for (const item of index) {
        if (item.filename) {
          if (item.filename.toLowerCase().includes(search)) matched.push(item.id);
        } else {
          unknown.push(item.id);
        }
      }
      // 旧格式条目需读 meta 判断
      if (unknown.length > 0) {
        const unknownMetas = await batchGetMetas(unknown);
        for (const m of unknownMetas) {
          if (m.filename.toLowerCase().includes(search)) matched.push(m.id);
        }
      }
      total = matched.length;
      const start = (page - 1) * limit;
      const pageIds = matched.slice(start, start + limit);
      resultImages = await batchGetMetas(pageIds);
    } else {
      // 无搜索时只读取当前页范围
      total = index.length;
      const start = (page - 1) * limit;
      const pageIds = index.slice(start, start + limit).map(item => item.id);
      resultImages = await batchGetMetas(pageIds);
    }

    return json({
      images: resultImages,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (err) {
    return error(500, '获取图片列表失败');
  }
}

// 批量获取 meta，并行分批读取，跳过已丢失的记录
async function batchGetMetas(ids: string[]): Promise<ImageMeta[]> {
  const BATCH_SIZE = 50;
  const results: ImageMeta[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const metas = await Promise.all(
      batch.map(id => KV.get(`${IMAGE_META_PREFIX}${id}`, 'json'))
    );
    for (const m of metas) {
      if (m) results.push(m);
    }
  }
  return results;
}
