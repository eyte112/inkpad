import { json, error, SETTINGS_KEY } from '../../shared/types.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';

// @ts-ignore - KV 是 EdgeOne Pages 的全局变量
declare const KV: any;

// EdgeOne 文件路由兼容
export async function onRequest(context: any): Promise<Response> {
  const authError = await authMiddleware(context.request);
  if (authError) return authError;
  return handleConfig(context.request);
}

// GET /api/images/config - 获取图床公开配置
export async function handleConfig(request: Request): Promise<Response> {
  try {
    const settings = await KV.get(SETTINGS_KEY, 'json');
    const provider = settings?.provider || 'github';

    if (provider === 'github' && settings?.github?.repo) {
      return json({
        configured: true,
        provider: 'github',
        repo: settings.github.repo,
        branch: settings.github.branch,
        path: settings.github.path,
      });
    }

    if (provider === 'r2' && settings?.r2?.publicDomain) {
      return json({
        configured: true,
        provider: 'r2',
        publicDomain: settings.r2.publicDomain,
      });
    }

    if (provider === 'smms' && settings?.smms?.token) {
      return json({
        configured: true,
        provider: 'smms',
      });
    }

    if (provider === 'imgur' && settings?.imgur?.clientId) {
      return json({
        configured: true,
        provider: 'imgur',
      });
    }

    return json({ configured: false, provider });
  } catch (err) {
    return error(500, '获取配置失败');
  }
}
