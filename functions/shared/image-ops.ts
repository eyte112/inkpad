import { IMAGE_HASH_PREFIX, IMAGE_PATH_PREFIX, SMMS_DELETE_PREFIX, IMGUR_DELETE_PREFIX, IMAGE_META_PREFIX, IMAGE_INDEX_KEY } from './types.ts';
import { signR2Request, sha256Hex, getAmzDate } from './r2-signature.ts';

// @ts-ignore - KV 是 EdgeOne Pages 的全局变量
declare const KV: any;

// 从 URL 提取 GitHub 存储路径（proxy URL 或直接路径）
export function extractGithubPath(imageUrl: string): string {
  if (imageUrl.includes('/api/images/proxy')) {
    try {
      const u = new URL(imageUrl, 'http://localhost');
      return u.searchParams.get('path') || imageUrl;
    } catch { return imageUrl; }
  }
  return imageUrl;
}

// 从 URL 提取 R2 存储路径
export function extractR2Path(imageUrl: string, publicDomain?: string): string {
  if (publicDomain) {
    const domain = publicDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const prefix = `https://${domain}/`;
    if (imageUrl.startsWith(prefix)) {
      return imageUrl.slice(prefix.length);
    }
  }
  return imageUrl;
}

// GitHub 删除：通过 Contents API
export async function deleteFromGithub(
  config: { token: string; repo: string; branch: string },
  path: string
): Promise<void> {
  if (!config?.token) throw new Error('GitHub 图床未配置');
  const { token, repo, branch } = config;

  const getRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`,
    { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'InkPad/1.0' } }
  );
  if (!getRes.ok) throw new Error('文件不存在');
  const fileData = await getRes.json();

  const delRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'InkPad/1.0', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Delete: ${path}`, sha: fileData.sha, branch }),
    }
  );
  if (!delRes.ok) {
    const data = await delRes.json();
    throw new Error(data.message || 'GitHub 删除失败');
  }
}

// R2 删除：通过 S3 API DELETE
export async function deleteFromR2(
  config: { accountId: string; accessKeyId: string; secretAccessKey: string; bucketName: string },
  path: string
): Promise<void> {
  if (!config?.accessKeyId) throw new Error('R2 图床未配置');
  const { accountId, accessKeyId, secretAccessKey, bucketName } = config;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucketName}/${path}`;
  const url = `https://${host}${canonicalUri}`;

  const { amzDate, dateStamp } = getAmzDate();
  const payloadHash = await sha256Hex('');
  const headers = await signR2Request({ method: 'DELETE', host, canonicalUri, payloadHash, amzDate, dateStamp, region: 'auto', service: 's3', accessKeyId, secretAccessKey });

  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`R2 删除失败: ${text}`);
  }
}

// S.EE 删除（原 SM.MS）：通过 delete hash
export async function deleteFromSmms(config: { token: string }, imageUrl: string): Promise<void> {
  if (!config?.token) throw new Error('S.EE 图床未配置');
  const deleteHash = await KV.get(`${SMMS_DELETE_PREFIX}${imageUrl}`);
  if (!deleteHash) throw new Error('未找到该图片的删除凭证');

  if (deleteHash === '__repeated__') {
    await KV.delete(`${SMMS_DELETE_PREFIX}${imageUrl}`);
    return;
  }

  const res = await fetch(`https://s.ee/api/v1/file/delete/${deleteHash}`, {
    method: 'GET',
    headers: { 'Authorization': config.token },
  });
  const data = await res.json();
  if (!data.success && data.code !== 'not_exists') throw new Error(data.message || 'S.EE 删除失败');
  await KV.delete(`${SMMS_DELETE_PREFIX}${imageUrl}`);
}

// Imgur 删除：通过 deletehash
export async function deleteFromImgur(config: { clientId: string }, imageUrl: string): Promise<void> {
  if (!config?.clientId) throw new Error('Imgur 图床未配置');
  const deleteHash = await KV.get(`${IMGUR_DELETE_PREFIX}${imageUrl}`);
  if (!deleteHash) throw new Error('未找到该图片的删除凭证');

  const res = await fetch(`https://api.imgur.com/3/image/${deleteHash}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Client-ID ${config.clientId}` },
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.data?.error || 'Imgur 删除失败');
  }
  await KV.delete(`${IMGUR_DELETE_PREFIX}${imageUrl}`);
}

// 清理 KV 中的哈希记录
export async function cleanupHashRecords(pathOrUrl: string): Promise<void> {
  try {
    const providerHash = await KV.get(`${IMAGE_PATH_PREFIX}${pathOrUrl}`);
    if (providerHash) {
      await KV.delete(`${IMAGE_HASH_PREFIX}${providerHash}`);
      await KV.delete(`${IMAGE_PATH_PREFIX}${pathOrUrl}`);
    }
  } catch {
    // 清理失败不影响主流程
  }
}

// 清理图片注册表记录（meta + index）
export async function cleanupRegistryRecords(imageId: string): Promise<void> {
  try {
    await KV.delete(`${IMAGE_META_PREFIX}${imageId}`);
    const indexRaw = await KV.get(IMAGE_INDEX_KEY, 'json');
    if (Array.isArray(indexRaw)) {
      const updated = indexRaw.filter((item: any) => {
        const id = typeof item === 'string' ? item : item.id;
        return id !== imageId;
      });
      await KV.put(IMAGE_INDEX_KEY, JSON.stringify(updated));
    }
  } catch {
    // 清理失败不影响主流程
  }
}
