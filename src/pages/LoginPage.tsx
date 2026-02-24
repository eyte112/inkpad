import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '@/components/ui';
import { Lock, Fingerprint } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { authApi } from '@/services/auth';
import { passkeyApi } from '@/services/passkey';
import { toast } from '@/stores/toastStore';
import type { LoginDuration } from '@/types/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [duration, setDuration] = useState<LoginDuration>('7days');
  const [isLoading, setIsLoading] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

  useEffect(() => {
    // 检查是否已设置密码，未设置则跳转 setup
    authApi.checkSetup().then(({ hasSetup }) => {
      if (!hasSetup) navigate('/setup', { replace: true });
    }).catch(() => {});

    // 检测是否支持 Passkey 且已注册
    if (window.PublicKeyCredential) {
      passkeyApi.check().then(({ hasPasskey }) => {
        setHasPasskey(hasPasskey);
      }).catch(() => {});
    }
  }, []);

  const handlePasskeyLogin = async () => {
    setIsPasskeyLoading(true);
    try {
      await passkeyApi.login(duration);
      toast.success('登录成功');
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '验证失败';
      if (msg.includes('cancelled') || msg.includes('AbortError')) {
        toast.warning('已取消验证');
      } else {
        toast.error('Passkey 登录失败', msg);
      }
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.warning('请输入密码');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.login(password, duration);
      toast.success('登录成功');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error('登录失败', err instanceof Error ? err.message : '请检查密码');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">

      <div className="relative w-full max-w-sm">
        {/* 卡片容器 */}
        <div className="bg-surface-card backdrop-blur-2xl rounded-2xl border border-border shadow-xl shadow-black/5 dark:shadow-black/20 p-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-on-surface">
              InkPad
            </h1>
            <p className="mt-1.5 text-sm text-on-surface-muted">
              {hasPasskey ? '选择登录方式' : '请输入密码登录'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />

            <div className="space-y-2.5">
              <label className="text-sm font-medium text-on-surface-muted">
                保持登录状态
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'session', label: '临时' },
                  { value: '7days', label: '7 天' },
                  { value: '30days', label: '30 天' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDuration(option.value as LoginDuration)}
                    className={cn(
                      'flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer',
                      duration === option.value
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800'
                        : 'bg-surface-card text-on-surface-muted border border-transparent hover:bg-surface-menu'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full btn-glow" disabled={isLoading}>
              {isLoading ? '登录中...' : '登录'}
            </Button>
          </form>

          {/* Passkey 登录 */}
          {hasPasskey && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-surface-card text-on-surface-muted">
                    或
                  </span>
                </div>
              </div>

              <Button
                variant="secondary"
                className="w-full"
                onClick={handlePasskeyLogin}
                disabled={isPasskeyLoading}
                icon={<Fingerprint className="w-5 h-5" />}
              >
                {isPasskeyLoading ? '验证中...' : '使用 Passkey 登录'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
