import { create } from 'zustand';
import { authApi } from '@/services/auth';

const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  hasSetup: boolean;
  lastCheckedAt: number;
  checkAuth: (force?: boolean) => Promise<void>;
  setUnauthenticated: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  hasSetup: false,
  lastCheckedAt: 0,

  checkAuth: async (force = false) => {
    const state = get();
    // 缓存未过期且非强制刷新时，跳过请求
    if (!force && state.lastCheckedAt > 0 && Date.now() - state.lastCheckedAt < AUTH_CACHE_TTL) {
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true });
    try {
      const setupResult = await authApi.checkSetup();
      if (!setupResult.hasSetup) {
        set({ isAuthenticated: false, hasSetup: false, isLoading: false, lastCheckedAt: Date.now() });
        return;
      }

      const verifyResult = await authApi.verify();
      set({
        isAuthenticated: verifyResult.valid,
        hasSetup: true,
        isLoading: false,
        lastCheckedAt: Date.now(),
      });
    } catch {
      set({ isAuthenticated: false, isLoading: false });
    }
  },

  setUnauthenticated: () => {
    set({ isAuthenticated: false, lastCheckedAt: 0 });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ isAuthenticated: false, lastCheckedAt: 0 });
      window.location.href = '/login';
    }
  },
}));
