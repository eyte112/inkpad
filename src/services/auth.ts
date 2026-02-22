import { api } from './api';
import type { LoginResponse, SetupInput, LoginDuration } from '@/types/auth';

export const authApi = {
  // 首次设置密码
  async setup(data: SetupInput) {
    return api.post<{ success: boolean }>('/auth/setup', data);
  },

  // 登录
  async login(password: string, duration: LoginDuration = '7days') {
    return api.post<LoginResponse>('/auth/login', { password, duration });
  },

  // 登出
  async logout() {
    return api.post<void>('/auth/logout', {});
  },

  // 验证会话
  async verify() {
    return api.post<{ valid: boolean }>('/auth/verify', {});
  },

  // 检查是否已设置密码
  async checkSetup() {
    return api.get<{ hasSetup: boolean }>('/auth/check-setup');
  },

  // 修改密码
  async changePassword(oldPassword: string, newPassword: string) {
    return api.post<{ success: boolean }>('/auth/change-password', {
      oldPassword,
      newPassword,
    });
  },

  // 重置系统（两步确认）
  async resetRequest(password: string) {
    return api.post<{ token: string }>('/auth/reset-request', { password });
  },

  async resetConfirm(token: string) {
    return api.post<{ success: boolean; deleted: number }>('/auth/reset-confirm', { token });
  },
};
