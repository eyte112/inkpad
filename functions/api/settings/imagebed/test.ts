import { json, error } from '../../../shared/types.ts';
import { authMiddleware } from '../../../shared/auth-middleware.ts';
import { signR2Request, getAmzDate } from '../../../shared/r2-signature.ts';

// POST /api/settings/imagebed/test - 测试图床连接
export async function handleImagebedTest(context: any): Promise<Response> {
  const { request } = context;

  if (request.method !== 'POST') {
    return error(405, 'Method not allowed');
  }

  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const { provider, github, r2, smms, imgur } = await request.json();

    if (provider === 'github') {
      return await testGithub(github);
    } else if (provider === 'r2') {
      return await testR2(r2);
    } else if (provider === 'smms') {
      return await testSmms(smms);
    } else if (provider === 'imgur') {
      return await testImgur(imgur);
    }

    return error(400, '不支持的提供商');
  } catch (err) {
    return error(500, '测试失败');
  }
}

// 测试 GitHub 连接
async function testGithub(github: { token: string; repo: string }): Promise<Response> {
  const res = await fetch(
    `https://api.github.com/repos/${github.repo}`,
    {
      headers: {
        'Authorization': `Bearer ${github.token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'InkPad/1.0',
      },
    }
  );

  if (!res.ok) {
    const data = await res.json();
    return error(400, data.message || '连接失败');
  }

  return json({ success: true, message: '连接成功' });
}

// 测试 Cloudflare R2 连接
async function testR2(r2: { accountId: string; accessKeyId: string; secretAccessKey: string; bucketName: string }): Promise<Response> {
  const { accountId, accessKeyId, secretAccessKey, bucketName } = r2;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucketName}`;
  const queryString = 'list-type=2&max-keys=1';
  const url = `https://${host}${canonicalUri}?${queryString}`;

  const { amzDate, dateStamp } = getAmzDate();
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // 空 body 的 SHA256

  const headers = await signR2Request({
    method: 'GET',
    host,
    canonicalUri,
    queryString,
    payloadHash,
    amzDate,
    dateStamp,
    region: 'auto',
    service: 's3',
    accessKeyId,
    secretAccessKey,
  });

  const res = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    return error(400, `R2 连接失败: ${text}`);
  }

  return json({ success: true, message: '连接成功' });
}

// 测试 S.EE 连接（原 SM.MS）
async function testSmms(smms: { token: string }): Promise<Response> {
  const res = await fetch('https://s.ee/api/v1/usage', {
    headers: {
      'Authorization': smms.token,
    },
  });

  const data = await res.json();
  // 只要不是 Unauthorized 就说明 token 有效（usage 接口可能限制免费用户）
  if (data.message === 'Unauthorized') {
    return error(400, 'Token 无效');
  }

  return json({ success: true, message: '连接成功' });
}

// 测试 Imgur 连接
async function testImgur(imgur: { clientId: string }): Promise<Response> {
  const res = await fetch('https://api.imgur.com/3/credits', {
    headers: {
      'Authorization': `Client-ID ${imgur.clientId}`,
    },
  });

  const data = await res.json();
  if (!data.success) {
    return error(400, data.data?.error || 'Client ID 无效');
  }

  return json({ success: true, message: `连接成功（剩余配额: ${data.data.ClientRemaining}/${data.data.ClientLimit}）` });
}

export { handleImagebedTest as onRequest };
