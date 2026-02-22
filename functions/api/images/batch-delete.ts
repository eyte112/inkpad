import { json, error, IMAGE_META_PREFIX, IMAGE_INDEX_KEY, SETTINGS_KEY } from '../../shared/types.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';
import {
  extractGithubPath, extractR2Path,
  deleteFromGithub, deleteFromR2, deleteFromSmms, deleteFromImgur,
  cleanupHashRecords,
} from '../../shared/image-ops.ts';

// @ts-ignore - KV 是 EdgeOne Pages 的全局变量
declare const KV: any;

// EdgeOne 文件路由兼容
export async function onRequest(context: any): Promise<Response> {
  const authError = await authMiddleware(context.request);
  if (authError) return authError;
  return handleBatchDelete(context.request);
}

// POST /api/images/batch-delete - 批量删除图片
export async function handleBatchDelete(request: Request): Promise<Response> {
  try {
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return error(400, '缺少 ids 参数');
    }
    if (ids.length > 20) {
      return error(400, '单次最多删除 20 张');
    }

    const settings = await KV.get(SETTINGS_KEY, 'json');
    const provider = settings?.provider || 'github';

    const results: { id: string; success: boolean; error?: string }[] = [];
    const deletedIds: string[] = [];

    // 单个图片删除逻辑
    async function deleteSingle(id: string): Promise<{ id: string; success: boolean; error?: string }> {
      try {
        const meta = await KV.get(`${IMAGE_META_PREFIX}${id}`, 'json');
        if (!meta) return { id, success: false, error: '记录不存在' };

        const imageUrl = meta.url;
        if (provider === 'github') {
          await deleteFromGithub(settings.github, extractGithubPath(imageUrl));
        } else if (provider === 'r2') {
          await deleteFromR2(settings.r2, extractR2Path(imageUrl, settings.r2?.publicDomain));
        } else if (provider === 'smms') {
          await deleteFromSmms(settings.smms, imageUrl);
        } else if (provider === 'imgur') {
          await deleteFromImgur(settings.imgur, imageUrl);
        }

        await cleanupHashRecords(imageUrl);
        await KV.delete(`${IMAGE_META_PREFIX}${id}`);
        return { id, success: true };
      } catch (err) {
        return { id, success: false, error: '删除失败' };
      }
    }

    // 并发执行，控制并发数为 5
    const CONCURRENCY = 5;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const batch = ids.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(batch.map(deleteSingle));
      for (const r of batchResults) {
        const result = r.status === 'fulfilled' ? r.value : { id: batch[0], success: false, error: '删除失败' };
        results.push(result);
        if (result.success) deletedIds.push(result.id);
      }
    }

    // 统一清理 index，避免循环中多次读写竞态
    if (deletedIds.length > 0) {
      try {
        const indexRaw = await KV.get(IMAGE_INDEX_KEY, 'json');
        if (Array.isArray(indexRaw)) {
          const deleteSet = new Set(deletedIds);
          const updated = indexRaw.filter((item: any) => {
            const id = typeof item === 'string' ? item : item.id;
            return !deleteSet.has(id);
          });
          await KV.put(IMAGE_INDEX_KEY, JSON.stringify(updated));
        }
      } catch { /* 清理失败不影响主流程 */ }
    }

    return json({ success: true, results });
  } catch (err) {
    console.error('Batch delete error:', err);
    return error(500, '批量删除失败');
  }
}
