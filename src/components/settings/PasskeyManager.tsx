import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { toast } from '@/stores/toastStore';
import { passkeyApi } from '@/services/passkey';
import { Fingerprint, Trash2, Plus, Smartphone } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface Credential {
  id: string;
  deviceName: string;
  createdAt: string;
}

export function PasskeyManager() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [showNameInput, setShowNameInput] = useState(false);
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    // 检测浏览器是否支持 Passkey
    if (!window.PublicKeyCredential) {
      setSupported(false);
      return;
    }
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    setIsLoading(true);
    try {
      const list = await passkeyApi.list();
      setCredentials(list);
    } catch (err) {
      console.error('加载 Passkey 列表失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartRegister = () => {
    setCustomName(getDeviceName());
    setShowNameInput(true);
  };

  const handleRegister = async () => {
    setIsRegistering(true);
    try {
      const deviceName = customName.trim() || getDeviceName();
      const result = await passkeyApi.register(deviceName);
      setCredentials(prev => [...prev, result.credential]);
      setShowNameInput(false);
      setCustomName('');
      toast.success('Passkey 注册成功');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '注册失败';
      if (msg.includes('cancelled') || msg.includes('AbortError')) {
        toast.warning('已取消注册');
      } else {
        toast.error('注册失败', msg);
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await passkeyApi.delete(id);
      setCredentials(prev => prev.filter(c => c.id !== id));
      toast.success('已删除 Passkey');
    } catch (err) {
      toast.error('删除失败', err instanceof Error ? err.message : '请重试');
    } finally {
      setDeletingId(null);
    }
  };

  if (!supported) {
    return (
      <div className="text-sm text-on-surface-muted">
        当前浏览器不支持 Passkey
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-on-surface mb-4">
        <Fingerprint className="w-4 h-4" />
        Passkey 管理
      </div>

      <div className="space-y-3">
        {/* 已注册的 Passkey 列表 */}
        {isLoading ? (
          <div className="text-sm text-on-surface-muted py-2">
            加载中...
          </div>
        ) : credentials.length === 0 ? (
          <div className="text-sm text-on-surface-muted py-2">
            尚未注册任何 Passkey，注册后可使用指纹/面容快速登录
          </div>
        ) : (
          <div className="space-y-2">
            {credentials.map((cred) => (
              <CredentialItem
                key={cred.id}
                credential={cred}
                deleting={deletingId === cred.id}
                onDelete={() => handleDelete(cred.id)}
              />
            ))}
          </div>
        )}

        {/* 注册区域 */}
        {showNameInput ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="设备名称"
              className={cn(
                'flex-1 px-3 py-1.5 text-sm rounded-lg border',
                'bg-surface-card',
                'border-border',
                'text-on-surface',
                'placeholder-on-surface-muted',
                'focus:outline-none focus:ring-2 focus:ring-primary-500'
              )}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
            />
            <Button
              size="sm"
              onClick={handleRegister}
              disabled={isRegistering}
            >
              {isRegistering ? '注册中...' : '确认'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowNameInput(false); setCustomName(''); }}
              disabled={isRegistering}
            >
              取消
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleStartRegister}
            icon={<Plus className="w-4 h-4" />}
          >
            注册新 Passkey
          </Button>
        )}
      </div>
    </div>
  );
}

function CredentialItem({
  credential,
  deleting,
  onDelete,
}: {
  credential: Credential;
  deleting: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const formattedDate = new Date(credential.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-lg',
        'bg-surface-card',
        'border border-border',
        confirming && 'border-red-300 dark:border-red-800'
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Smartphone className="w-4 h-4 text-on-surface-muted shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-on-surface truncate">
            {credential.deviceName}
          </div>
          <div className="text-xs text-on-surface-muted">
            {confirming ? (
              <span className="text-red-500 dark:text-red-400">确认删除此 Passkey？</span>
            ) : (
              <>注册于 {formattedDate}</>
            )}
          </div>
        </div>
      </div>
      {confirming ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { setConfirming(false); onDelete(); }}
            disabled={deleting}
            className={cn(
              'px-2 py-1 text-xs rounded-md',
              'bg-red-500 text-white hover:bg-red-600',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {deleting ? '删除中...' : '确认'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-2 py-1 text-xs rounded-md text-on-surface-muted hover:bg-surface-card"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className={cn(
            'p-1.5 rounded-md shrink-0',
            'text-on-surface-muted hover:text-red-500 hover:bg-red-50',
            'dark:hover:text-red-400 dark:hover:bg-red-900/30',
            'transition-colors'
          )}
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/** 根据 UA 生成设备名称 */
function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Passkey';
}
