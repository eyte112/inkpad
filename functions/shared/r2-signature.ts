// Cloudflare R2 AWS Signature V4 签名工具

// SHA256 哈希（返回十六进制字符串）
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// HMAC-SHA256
export async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

// HMAC-SHA256（返回十六进制字符串）
export async function hmacSha256Hex(key: ArrayBuffer, data: string): Promise<string> {
  const result = await hmacSha256(key, data);
  return Array.from(new Uint8Array(result))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 生成 AWS Signature V4 签名密钥
export async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(
    new TextEncoder().encode('AWS4' + secretKey),
    dateStamp
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

// 生成 R2 请求签名
export async function signR2Request(params: {
  method: string;
  host: string;
  canonicalUri: string;
  queryString?: string;
  payloadHash: string;
  amzDate: string;
  dateStamp: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  contentType?: string;
}): Promise<Record<string, string>> {
  const {
    method,
    host,
    canonicalUri,
    queryString = '',
    payloadHash,
    amzDate,
    dateStamp,
    region,
    service,
    accessKeyId,
    secretAccessKey,
    contentType,
  } = params;

  // 构建 canonical headers
  let canonicalHeaders = `host:${host}\n`;
  let signedHeaders = 'host';

  if (contentType) {
    canonicalHeaders = `content-type:${contentType}\n` + canonicalHeaders;
    signedHeaders = 'content-type;' + signedHeaders;
  }

  canonicalHeaders += `x-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  signedHeaders += ';x-amz-content-sha256;x-amz-date';

  // 构建 canonical request
  const canonicalRequest = [
    method,
    canonicalUri,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // 构建 string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  // 计算签名
  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  // 构建 Authorization header
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    'Host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    'Authorization': authorization,
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return headers;
}

// 获取当前时间的 AWS 格式
export function getAmzDate(): { amzDate: string; dateStamp: string } {
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  return { amzDate, dateStamp };
}
