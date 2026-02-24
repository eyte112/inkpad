import { json, error, ImageMeta, IMAGE_META_PREFIX, IMAGE_INDEX_KEY, IMAGE_HASH_PREFIX, IMAGE_PATH_PREFIX, SMMS_DELETE_PREFIX, IMGUR_DELETE_PREFIX, SETTINGS_KEY } from '../../shared/types.ts';
import { signR2Request, sha256Hex, getAmzDate } from '../../shared/r2-signature.ts';
import { authMiddleware } from '../../shared/auth-middleware.ts';

// @ts-ignore - KV 是 EdgeOne Pages 的全局变量
declare const KV: any;

// 安全提取文件扩展名
function getSafeExt(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return 'jpg';
  const ext = parts.pop()!.toLowerCase();
  const valid = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  return valid.includes(ext) ? ext : 'jpg';
}

// EdgeOne 文件路由兼容
export async function onRequest(context: any): Promise<Response> {
  const authError = await authMiddleware(context.request);
  if (authError) return authError;
  return handleUpload(context.request);
}

// POST /api/images/upload - 上传图片
export async function handleUpload(request: Request): Promise<Response> {
  try {
    // 获取图床配置
    const settings = await KV.get(SETTINGS_KEY, 'json');
    const provider = settings?.provider || 'github';

    // 解析上传的图片
    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return error(400, '请选择图片');
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return error(400, '不支持的图片格式');
    }

    // 验证文件大小 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return error(400, '图片大小不能超过 5MB');
    }

    // 读取文件内容并计算哈希
    const buffer = await file.arrayBuffer();
    const hash = await sha256Hex(buffer);

    // 检查是否已存在相同哈希的图片（hash key 包含 provider，切换图床后不会误命中旧 URL）
    const existingValue = await KV.get(`${IMAGE_HASH_PREFIX}${provider}:${hash}`);
    if (existingValue) {
      // 值格式：url|imageId（新格式）或纯 url（旧格式）
      const pipeIdx = existingValue.indexOf('|');
      const existingUrl = pipeIdx >= 0 ? existingValue.slice(0, pipeIdx) : existingValue;
      const existingId = pipeIdx >= 0 ? existingValue.slice(pipeIdx + 1) : '';
      return json({ success: true, url: existingUrl, id: existingId, cached: true });
    }

    let url: string;

    // 根据提供商上传
    if (provider === 'github') {
      if (!settings?.github?.token) {
        return error(400, '请先配置 GitHub 图床');
      }
      url = await uploadToGithub(settings.github, file, buffer);
    } else if (provider === 'r2') {
      if (!settings?.r2?.accessKeyId) {
        return error(400, '请先配置 Cloudflare R2');
      }
      url = await uploadToR2(settings.r2, file, buffer);
    } else if (provider === 'smms') {
      if (!settings?.smms?.token) {
        return error(400, '请先配置 S.EE');
      }
      url = await uploadToSmms(settings.smms, file, buffer);
    } else if (provider === 'imgur') {
      if (!settings?.imgur?.clientId) {
        return error(400, '请先配置 Imgur');
      }
      url = await uploadToImgur(settings.imgur, file, buffer);
    } else {
      return error(400, '不支持的图床提供商');
    }

    // 写入图片注册表
    const imageId = crypto.randomUUID();

    // 保存哈希与 URL|imageId 的映射（含 provider 前缀）+ 反向映射（用于删除时清理）
    await KV.put(`${IMAGE_HASH_PREFIX}${provider}:${hash}`, `${url}|${imageId}`);
    await KV.put(`${IMAGE_PATH_PREFIX}${url}`, `${provider}:${hash}`);
    const meta: ImageMeta = {
      id: imageId,
      url,
      filename: file.name || 'unknown',
      size: file.size,
      type: file.type,
      provider: provider as ImageMeta['provider'],
      hash,
      uploadedAt: new Date().toISOString(),
    };
    await KV.put(`${IMAGE_META_PREFIX}${imageId}`, JSON.stringify(meta));

    // 更新索引（头部插入，存储 { id, filename } 对象）
    const indexRaw = await KV.get(IMAGE_INDEX_KEY, 'json');
    const index: Array<string | { id: string; filename: string }> = indexRaw || [];
    index.unshift({ id: imageId, filename: file.name || 'unknown' });
    await KV.put(IMAGE_INDEX_KEY, JSON.stringify(index));

    return json({ success: true, url, id: imageId });
  } catch (err) {
    console.error('上传失败:', err);
    return error(500, '上传失败');
  }
}

// 上传到 GitHub
async function uploadToGithub(
  config: { token: string; repo: string; branch: string; path: string; customDomain?: string; urlTemplate?: string },
  file: File,
  buffer: ArrayBuffer
): Promise<string> {
  const { token, repo, branch, path, customDomain, urlTemplate } = config;

  // 生成文件名
  const ext = getSafeExt(file.name);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = `${path}/${filename}`.replace(/\/+/g, '/');

  // 转为 Base64（分块处理避免栈溢出）
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  const base64 = btoa(binary);

  // 调用 GitHub API
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'InkPad/1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Upload: ${filename}`,
        content: base64,
        branch,
      }),
    }
  );

  if (!res.ok) {
    let msg = 'GitHub 上传失败';
    try {
      const data = await res.json();
      msg = data.message || msg;
    } catch {
      msg = `GitHub API 返回异常 (HTTP ${res.status})`;
    }
    throw new Error(msg);
  }

  // 生成返回URL
  if (customDomain && urlTemplate) {
    // 使用自定义加速域名
    const url = urlTemplate
      .replace('{repo}', repo)
      .replace('{branch}', branch)
      .replace('{path}', filePath);
    return `https://${customDomain}${url}`;
  }

  // 默认返回 jsDelivr CDN URL（国内访问稳定）
  return `https://cdn.jsdelivr.net/gh/${repo}@${branch}/${filePath}`;
}

// 上传到 Cloudflare R2
async function uploadToR2(
  config: { accountId: string; accessKeyId: string; secretAccessKey: string; bucketName: string; publicDomain: string; path?: string },
  file: File,
  buffer: ArrayBuffer
): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucketName, publicDomain, path = 'uploads' } = config;

  // 生成文件名
  const ext = getSafeExt(file.name);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = `${path}/${filename}`.replace(/\/+/g, '/').replace(/^\//, '');

  // 构建 R2 请求
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucketName}/${filePath}`;
  const url = `https://${host}${canonicalUri}`;

  // AWS Signature V4 签名
  const { amzDate, dateStamp } = getAmzDate();
  const payloadHash = await sha256Hex(buffer);

  const headers = await signR2Request({
    method: 'PUT',
    host,
    canonicalUri,
    payloadHash,
    amzDate,
    dateStamp,
    region: 'auto',
    service: 's3',
    accessKeyId,
    secretAccessKey,
    contentType: file.type,
  });

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: buffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 上传失败: ${text}`);
  }

  // 返回公开访问 URL
  const domain = publicDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${domain}/${filePath}`;
}

// 上传到 S.EE（原 SM.MS）
async function uploadToSmms(
  config: { token: string },
  file: File,
  buffer: ArrayBuffer
): Promise<string> {
  const { token } = config;

  // 生成文件名和 MIME 类型
  const ext = getSafeExt(file.name);
  const filename = `${Date.now()}.${ext}`;
  const mimeType = file.type || getMimeType(ext);

  // 手动构建 multipart/form-data
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).slice(2)}`;

  // 构建请求体各部分
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  // 合并为完整的请求体
  const headerBytes = new TextEncoder().encode(header);
  const footerBytes = new TextEncoder().encode(footer);
  const bodyBytes = new Uint8Array(buffer);

  const body = new Uint8Array(headerBytes.length + bodyBytes.length + footerBytes.length);
  body.set(headerBytes, 0);
  body.set(bodyBytes, headerBytes.length);
  body.set(footerBytes, headerBytes.length + bodyBytes.length);

  // 调用 S.EE API（原 SM.MS）
  const res = await fetch('https://s.ee/api/v1/file/upload', {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: body,
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`S.EE 返回了非预期响应 (HTTP ${res.status})，请检查 Token 是否正确`);
  }

  if (data.code !== 0) {
    // 如果是重复图片，返回已存在的 URL
    if (data.code === 'image_repeated' && data.images) {
      await KV.put(`${SMMS_DELETE_PREFIX}${data.images}`, '__repeated__');
      return data.images;
    }
    throw new Error(data.message || 'S.EE 上传失败');
  }

  const url = data.data.url;

  // 存储 S.EE 的 delete key，用于后续删除
  if (data.data.delete) {
    await KV.put(`${SMMS_DELETE_PREFIX}${url}`, data.data.delete);
  } else if (data.data.hash) {
    await KV.put(`${SMMS_DELETE_PREFIX}${url}`, data.data.hash);
  }

  return url;
}

// 根据扩展名获取 MIME 类型
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

// 上传到 Imgur
async function uploadToImgur(
  config: { clientId: string },
  file: File,
  buffer: ArrayBuffer
): Promise<string> {
  const { clientId } = config;

  const ext = getSafeExt(file.name);
  const filename = `${Date.now()}.${ext}`;
  const mimeType = file.type || getMimeType(ext);

  // 手动构建 multipart/form-data
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).slice(2)}`;
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const headerBytes = new TextEncoder().encode(header);
  const footerBytes = new TextEncoder().encode(footer);
  const bodyBytes = new Uint8Array(buffer);

  const body = new Uint8Array(headerBytes.length + bodyBytes.length + footerBytes.length);
  body.set(headerBytes, 0);
  body.set(bodyBytes, headerBytes.length);
  body.set(footerBytes, headerBytes.length + bodyBytes.length);

  const res = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: {
      'Authorization': `Client-ID ${clientId}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: body,
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Imgur 返回了非预期响应 (HTTP ${res.status})`);
  }

  if (!data.success) {
    throw new Error(data.data?.error || 'Imgur 上传失败');
  }

  const url = data.data.link;

  // 保存 deletehash 用于后续删除
  if (data.data.deletehash) {
    await KV.put(`${IMGUR_DELETE_PREFIX}${url}`, data.data.deletehash);
  }

  return url;
}
