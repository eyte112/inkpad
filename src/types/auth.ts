// 认证类型定义
export interface User {
  id: string;
  createdAt: string;
}

// 登录时长选项
export type LoginDuration = 'session' | '7days' | '30days';

export interface LoginResponse {
  success: boolean;
  message?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  hasSetup: boolean;
}

export interface LoginInput {
  password: string;
  duration: LoginDuration;
}

export interface SetupInput {
  password: string;
  confirmPassword: string;
}

export interface ChangePasswordInput {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface APIResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}
