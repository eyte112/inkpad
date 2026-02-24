// Passkey 复杂处理函数 — 需要 WebAuthn 验证的路由
import { json, error, jsonWithCookie, createAuthCookie, isSecureRequest } from './types.ts';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  base64URLEncode,
  base64URLDecode,
} from './webauthn.ts';

// @ts-ignore
declare const KV: any;

const CREDENTIALS_KEY = 'passkey:credentials';
const PASSKEY_MAX_ATTEMPTS = 5;
const PASSKEY_LOCKOUT_DURATION = 15 * 60;

interface StoredCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  createdAt: string;
  deviceName: string;
}

function getRpConfig(request: Request) {
  const url = new URL(request.url);
  return { rpName: 'InkPad', rpID: url.hostname, origin: url.origin };
}

async function getStoredCredentials(): Promise<StoredCredential[]> {
  return (await KV.get(CREDENTIALS_KEY, { type: 'json' })) || [];
}

async function saveCredentials(creds: StoredCredential[]): Promise<void> {
  await KV.put(CREDENTIALS_KEY, JSON.stringify(creds));
}

async function checkPasskeyLimit(): Promise<{ blocked: boolean; remaining?: number }> {
  const attempts = await KV.get('auth:passkey_attempts', { type: 'json' }) || { count: 0, lastAttempt: 0 };
  const now = Date.now() / 1000;
  if (attempts.count >= PASSKEY_MAX_ATTEMPTS) {
    const elapsed = now - attempts.lastAttempt;
    if (elapsed < PASSKEY_LOCKOUT_DURATION) {
      return { blocked: true, remaining: Math.ceil(PASSKEY_LOCKOUT_DURATION - elapsed) };
    }
    await KV.put('auth:passkey_attempts', JSON.stringify({ count: 0, lastAttempt: 0 }));
  }
  return { blocked: false };
}

async function recordPasskeyFailure(): Promise<void> {
  const attempts = await KV.get('auth:passkey_attempts', { type: 'json' }) || { count: 0, lastAttempt: 0 };
  await KV.put('auth:passkey_attempts', JSON.stringify({ count: attempts.count + 1, lastAttempt: Date.now() / 1000 }));
}

async function resetPasskeyLimit(): Promise<void> {
  await KV.put('auth:passkey_attempts', JSON.stringify({ count: 0, lastAttempt: 0 }));
}

export async function handleRegisterOptions(request: Request): Promise<Response> {
  try {
    const { rpName, rpID } = getRpConfig(request);
    const credentials = await getStoredCredentials();
    const options = generateRegistrationOptions({
      rpName, rpID, userName: 'owner',
      excludeCredentialIDs: credentials.map(c => c.id),
    });
    const challengeId = crypto.randomUUID();
    await KV.put(`passkey:challenge:${challengeId}`, options.challenge, { expirationTtl: 60 });
    return json({ options, challengeId });
  } catch (err) {
    console.error('Passkey register options error:', err);
    return error(500, '生成注册选项失败');
  }
}

export async function handleRegisterVerify(request: Request): Promise<Response> {
  try {
    const { rpID, origin } = getRpConfig(request);
    const { challengeId, response: regResponse, deviceName } = await request.json() as any;
    const expectedChallenge = await KV.get(`passkey:challenge:${challengeId}`);
    if (!expectedChallenge) return error(400, '挑战已过期，请重试');
    await KV.delete(`passkey:challenge:${challengeId}`);

    const verification = await verifyRegistrationResponse({
      response: regResponse, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID,
    });
    if (!verification.verified || !verification.credential) return error(400, '注册验证失败');

    const credentials = await getStoredCredentials();
    const newCred: StoredCredential = {
      id: verification.credential.id,
      publicKey: base64URLEncode(verification.credential.publicKey),
      counter: verification.credential.counter,
      transports: regResponse.response?.transports,
      createdAt: new Date().toISOString(),
      deviceName: deviceName || `Passkey ${credentials.length + 1}`,
    };
    credentials.push(newCred);
    await saveCredentials(credentials);
    return json({ success: true, credential: { id: newCred.id, deviceName: newCred.deviceName, createdAt: newCred.createdAt } });
  } catch (err) {
    console.error('Passkey register verify error:', err);
    return error(500, '注册验证失败');
  }
}

export async function handleAuthOptions(request: Request): Promise<Response> {
  try {
    const limit = await checkPasskeyLimit();
    if (limit.blocked) return error(429, `请求过于频繁，请 ${limit.remaining} 秒后重试`);
    const { rpID } = getRpConfig(request);
    const credentials = await getStoredCredentials();
    if (credentials.length === 0) return error(404, '未注册任何 Passkey');
    const options = generateAuthenticationOptions({
      rpID, allowCredentialIDs: credentials.map(c => c.id),
    });
    const challengeId = crypto.randomUUID();
    await KV.put(`passkey:challenge:${challengeId}`, options.challenge, { expirationTtl: 60 });
    return json({ options, challengeId });
  } catch (err) {
    console.error('Passkey auth options error:', err);
    return error(500, '生成认证选项失败');
  }
}

export async function handleAuthVerify(request: Request): Promise<Response> {
  try {
    const limit = await checkPasskeyLimit();
    if (limit.blocked) return error(429, `请求过于频繁，请 ${limit.remaining} 秒后重试`);
    const { rpID, origin } = getRpConfig(request);
    const { challengeId, response: authResponse, duration = '7days' } = await request.json() as any;
    const expectedChallenge = await KV.get(`passkey:challenge:${challengeId}`);
    if (!expectedChallenge) return error(400, '挑战已过期，请重试');
    await KV.delete(`passkey:challenge:${challengeId}`);

    const credentials = await getStoredCredentials();
    const matched = credentials.find(c => c.id === authResponse.id);
    if (!matched) return error(400, '未找到匹配的凭证');

    const verification = await verifyAuthenticationResponse({
      response: authResponse, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID,
      credential: { publicKey: base64URLDecode(matched.publicKey), counter: matched.counter },
    });
    if (!verification.verified) {
      await recordPasskeyFailure();
      return error(401, 'Passkey 验证失败');
    }
    await resetPasskeyLimit();
    matched.counter = verification.newCounter;
    await saveCredentials(credentials);

    const durationMap: Record<string, number> = { 'session': 86400, '7days': 604800, '30days': 2592000 };
    const maxAge = durationMap[duration] || 604800;
    const now = Math.floor(Date.now() / 1000);
    const token = crypto.randomUUID();
    await KV.put(`session:${token}`, JSON.stringify({ sub: 'user', iat: now, exp: now + maxAge, duration }), { expirationTtl: maxAge });
    return jsonWithCookie({ success: true }, createAuthCookie(token, maxAge, isSecureRequest(request)));
  } catch (err) {
    console.error('Passkey auth verify error:', err);
    return error(500, 'Passkey 认证失败');
  }
}

// --- 以下为从 [[path]].ts 提取的内联 handler ---

export async function handlePasskeyCheck(): Promise<Response> {
  try {
    const creds = await getStoredCredentials();
    return json({ hasPasskey: creds.length > 0 });
  } catch {
    return json({ hasPasskey: false });
  }
}

export async function handlePasskeyList(): Promise<Response> {
  const creds = await getStoredCredentials();
  return json(creds.map((c) => ({ id: c.id, deviceName: c.deviceName, createdAt: c.createdAt })));
}

export async function handlePasskeyDelete(request: Request): Promise<Response> {
  const { id } = (await request.json()) as { id: string };
  if (!id) return error(400, '缺少凭证 ID');
  const creds = await getStoredCredentials();
  const filtered = creds.filter((c) => c.id !== id);
  if (filtered.length === creds.length) return error(404, '凭证不存在');
  await saveCredentials(filtered);
  return json({ success: true });
}
