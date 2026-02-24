import { json, error } from '../../shared/types.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';

// @ts-ignore - KV 是 EdgeOne Pages 的全局变量
declare const KV: any;

const SETTINGS_KEY = 'settings:imagebed';

// GET /api/settings/imagebed - 获取图床配置
async function getSettings(request: Request): Promise<Response> {
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const settings = await KV.get(SETTINGS_KEY, 'json');
    return json(settings || { provider: 'github' });
  } catch (err) {
    return error(500, '获取配置失败');
  }
}

const VALID_PROVIDERS = ['github', 'r2', 'smms', 'imgur'];

// PUT /api/settings/imagebed - 保存图床配置
async function saveSettings(request: Request): Promise<Response> {
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const settings = await request.json();
    if (
      !settings || typeof settings !== 'object' ||
      !VALID_PROVIDERS.includes(settings.provider)
    ) {
      return error(400, '无效的图床配置：provider 必须为 github/r2/smms/imgur');
    }

    // H3: 验证各 provider 必填字段
    const requiredFields: Record<string, string[]> = {
      github: ['token', 'repo', 'branch', 'path'],
      r2: ['accountId', 'accessKeyId', 'secretAccessKey', 'bucketName', 'publicDomain'],
      smms: ['token'],
      imgur: ['clientId'],
    };
    const cfg = settings[settings.provider];
    const fields = requiredFields[settings.provider];
    if (
      !cfg || typeof cfg !== 'object' ||
      fields.some((f) => !cfg[f] || typeof cfg[f] !== 'string')
    ) {
      return error(400, `${settings.provider} 配置缺少必填字段: ${fields.join(', ')}`);
    }

    await KV.put(SETTINGS_KEY, JSON.stringify(settings));
    return json({ success: true });
  } catch (err) {
    return error(500, '保存配置失败');
  }
}

export async function handleImagebedSettings(context: any): Promise<Response> {
  const { request } = context;
  const method = request.method;

  if (method === 'GET') {
    return getSettings(request);
  } else if (method === 'PUT') {
    return saveSettings(request);
  }

  return error(405, 'Method not allowed');
}

export { handleImagebedSettings as onRequest };
