import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

const BASE = '/api/auth/passkey';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.message || '请求失败');
  return data.data as T;
}

export const passkeyApi = {
  // 检查是否有已注册的 Passkey
  async check() {
    return fetchJSON<{ hasPasskey: boolean }>(`${BASE}/check`);
  },

  // 列出已注册凭证
  async list() {
    return fetchJSON<{ id: string; deviceName: string; createdAt: string }[]>(`${BASE}/list`);
  },

  // 注册 Passkey
  async register(deviceName?: string) {
    // 1. 获取注册选项
    const { options, challengeId } = await fetchJSON<{ options: any; challengeId: string }>(
      `${BASE}/register-options`,
      { method: 'POST' }
    );

    // 2. 调用浏览器 Passkey API
    const attResp = await startRegistration({ optionsJSON: options });

    // 3. 验证注册
    return fetchJSON<{ success: boolean; credential: { id: string; deviceName: string; createdAt: string } }>(
      `${BASE}/register-verify`,
      { method: 'POST', body: JSON.stringify({ challengeId, response: attResp, deviceName }) }
    );
  },

  // Passkey 登录
  async login(duration = '7days') {
    // 1. 获取认证选项
    const { options, challengeId } = await fetchJSON<{ options: any; challengeId: string }>(
      `${BASE}/auth-options`,
      { method: 'POST' }
    );

    // 2. 调用浏览器 Passkey API
    const assertResp = await startAuthentication({ optionsJSON: options });

    // 3. 验证认证
    return fetchJSON<{ success: boolean }>(
      `${BASE}/auth-verify`,
      { method: 'POST', body: JSON.stringify({ challengeId, response: assertResp, duration }) }
    );
  },

  // 删除凭证
  async delete(id: string) {
    return fetchJSON<{ success: boolean }>(
      `${BASE}/delete`,
      { method: 'DELETE', body: JSON.stringify({ id }) }
    );
  },
};
