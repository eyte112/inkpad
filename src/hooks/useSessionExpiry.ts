import { useEffect } from 'react';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';

const CHECK_INTERVAL = 60 * 1000; // 每分钟检查一次

export function useSessionExpiry() {
  const { logout } = useAuthStore();

  useEffect(() => {
    const checkExpiry = () => {
      // 从 cookie 中无法直接读取 HttpOnly cookie
      // 所以我们通过 API 验证来检查
      // 这里简化处理，实际可以通过后端返回过期时间
    };

    const interval = setInterval(checkExpiry, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [logout]);
}

// 简化版：在 API 返回 401 时自动处理
export function handleSessionExpired() {
  toast.warning('登录已过期', '请重新登录');
  setTimeout(() => {
    window.location.href = '/login';
  }, 2000);
}
