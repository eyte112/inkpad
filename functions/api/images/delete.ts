import { json, error, IMAGE_META_PREFIX, SETTINGS_KEY } from '../../shared/types.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';
import {
  extractGithubPath, extractR2Path,
  deleteFromGithub, deleteFromR2, deleteFromSmms, deleteFromImgur,
  cleanupHashRecords, cleanupRegistryRecords,
} from '../../shared/image-ops.ts';

// @ts-ignore - KV 是 EdgeOne Pages 的全局变量
declare const KV: any;

// EdgeOne 文件路由兼容
export async function onRequest(context: any): Promise<Response> {
  const authError = await authMiddleware(context.request);
  if (authError) return authError;
  return handleDelete(context.request);
}

// DELETE /api/images/delete?id=xxx - 删除图片
export async function handleDelete(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const imageId = url.searchParams.get('id');
  const pathParam = url.searchParams.get('path');

  if (!imageId && !pathParam) {
    return error(400, '缺少 id 或 path 参数');
  }

  try {
    const settings = await KV.get(SETTINGS_KEY, 'json');
    const provider = settings?.provider || 'github';

    let imageUrl = pathParam || '';
    if (imageId) {
      const meta = await KV.get(`${IMAGE_META_PREFIX}${imageId}`, 'json');
      if (!meta) {
        return error(404, '图片记录不存在');
      }
      imageUrl = meta.url;
    }

    if (provider === 'github') {
      await deleteFromGithub(settings.github, extractGithubPath(imageUrl));
    } else if (provider === 'r2') {
      await deleteFromR2(settings.r2, extractR2Path(imageUrl, settings.r2?.publicDomain));
    } else if (provider === 'smms') {
      await deleteFromSmms(settings.smms, imageUrl);
    } else if (provider === 'imgur') {
      await deleteFromImgur(settings.imgur, imageUrl);
    } else {
      return error(400, '不支持的图床提供商');
    }

    await cleanupHashRecords(imageUrl);

    if (imageId) {
      await cleanupRegistryRecords(imageId);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Image delete error:', err);
    return error(500, '删除失败');
  }
}
