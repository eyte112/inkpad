import { useState, useEffect } from 'react';
import { Dialog, Input, Button } from '@/components/ui';
import { toast } from '@/stores/toastStore';
import { Image, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { PasskeyManager } from '@/components/settings/PasskeyManager';

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
}

// 图床提供商类型
type ImageBedProvider = 'github' | 'r2' | 'smms' | 'imgur';

interface ImageBedSettings {
  provider: ImageBedProvider;
  github?: {
    token: string;
    repo: string;
    branch: string;
    path: string;
    customDomain?: string;
    urlTemplate?: string;
  };
  r2?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    publicDomain: string;
    path?: string;
  };
  smms?: {
    token: string;
  };
  imgur?: {
    clientId: string;
  };
}

const providerOptions: { value: ImageBedProvider; label: string; available: boolean }[] = [
  { value: 'github', label: 'GitHub', available: true },
  { value: 'r2', label: 'Cloudflare R2', available: true },
  { value: 'smms', label: 'S.EE', available: true },
  { value: 'imgur', label: 'Imgur', available: true },
];

export function AdminPanel({ open, onClose }: AdminPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [provider, setProvider] = useState<ImageBedProvider>('github');
  const [showProviderMenu, setShowProviderMenu] = useState(false);

  // GitHub 配置
  const [githubToken, setGithubToken] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [githubBranch, setGithubBranch] = useState('main');
  const [githubPath, setGithubPath] = useState('img/uploads');
  const [githubCustomDomain, setGithubCustomDomain] = useState('');
  const [githubUrlTemplate, setGithubUrlTemplate] = useState('/gh/{repo}@{branch}/{path}');

  // Cloudflare R2 配置
  const [r2AccountId, setR2AccountId] = useState('');
  const [r2AccessKeyId, setR2AccessKeyId] = useState('');
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState('');
  const [r2BucketName, setR2BucketName] = useState('');
  const [r2PublicDomain, setR2PublicDomain] = useState('');
  const [r2Path, setR2Path] = useState('uploads');

  // S.EE 配置
  const [smmsToken, setSmmsToken] = useState('');

  // Imgur 配置
  const [imgurClientId, setImgurClientId] = useState('');

  // 加载配置
  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings/imagebed', {
        credentials: 'include',
      });
      if (res.ok) {
        const response = await res.json();
        const data: ImageBedSettings = response.data;
        if (data) {
          setProvider(data.provider || 'github');
          if (data.github) {
            setGithubToken(data.github.token || '');
            setGithubRepo(data.github.repo || '');
            setGithubBranch(data.github.branch || 'main');
            setGithubPath(data.github.path || 'img/uploads');
            setGithubCustomDomain(data.github.customDomain || '');
            setGithubUrlTemplate(data.github.urlTemplate || '/gh/{repo}@{branch}/{path}');
          }
          if (data.r2) {
            setR2AccountId(data.r2.accountId || '');
            setR2AccessKeyId(data.r2.accessKeyId || '');
            setR2SecretAccessKey(data.r2.secretAccessKey || '');
            setR2BucketName(data.r2.bucketName || '');
            setR2PublicDomain(data.r2.publicDomain || '');
            setR2Path(data.r2.path || 'uploads');
          }
          if (data.smms) {
            setSmmsToken(data.smms.token || '');
          }
          if (data.imgur) {
            setImgurClientId(data.imgur.clientId || '');
          }
        }
      }
    } catch (err) {
      console.error('加载配置失败:', err);
    }
  };

  const handleSave = async () => {
    if (provider === 'github') {
      if (!githubToken || !githubRepo) {
        toast.warning('请填写 Token 和仓库地址');
        return;
      }
    } else if (provider === 'r2') {
      if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName || !r2PublicDomain) {
        toast.warning('请填写完整的 R2 配置');
        return;
      }
    } else if (provider === 'smms') {
      if (!smmsToken) {
        toast.warning('请填写 S.EE Token');
        return;
      }
    } else if (provider === 'imgur') {
      if (!imgurClientId) {
        toast.warning('请填写 Imgur Client ID');
        return;
      }
    }

    setIsLoading(true);
    try {
      const settings: ImageBedSettings = {
        provider,
        github: {
          token: githubToken,
          repo: githubRepo,
          branch: githubBranch,
          path: githubPath,
          customDomain: githubCustomDomain,
          urlTemplate: githubUrlTemplate,
        },
        r2: {
          accountId: r2AccountId,
          accessKeyId: r2AccessKeyId,
          secretAccessKey: r2SecretAccessKey,
          bucketName: r2BucketName,
          publicDomain: r2PublicDomain,
          path: r2Path,
        },
        smms: {
          token: smmsToken,
        },
        imgur: {
          clientId: imgurClientId,
        },
      };

      const res = await fetch('/api/settings/imagebed', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error('保存失败');
      toast.success('配置已保存');
    } catch (err) {
      toast.error('保存失败', err instanceof Error ? err.message : '请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    if (provider === 'github' && (!githubToken || !githubRepo)) {
      toast.warning('请先填写配置');
      return;
    }
    if (provider === 'r2' && (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName)) {
      toast.warning('请先填写配置');
      return;
    }
    if (provider === 'smms' && !smmsToken) {
      toast.warning('请先填写配置');
      return;
    }
    if (provider === 'imgur' && !imgurClientId) {
      toast.warning('请先填写配置');
      return;
    }

    setIsTesting(true);
    try {
      const body: Record<string, unknown> = { provider };
      if (provider === 'github') {
        body.github = { token: githubToken, repo: githubRepo, branch: githubBranch };
      } else if (provider === 'r2') {
        body.r2 = { accountId: r2AccountId, accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey, bucketName: r2BucketName };
      } else if (provider === 'smms') {
        body.smms = { token: smmsToken };
      } else if (provider === 'imgur') {
        body.imgur = { clientId: imgurClientId };
      }

      const res = await fetch('/api/settings/imagebed/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '连接失败');
      }
      toast.success('连接成功');
    } catch (err) {
      toast.error('连接失败', err instanceof Error ? err.message : '请检查配置');
    } finally {
      setIsTesting(false);
    }
  };

  const handleClose = () => {
    setShowProviderMenu(false);
    onClose();
  };

  const currentProvider = providerOptions.find(p => p.value === provider);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && handleClose()}
      title="管理面板"
      size="lg"
    >
      <div className="space-y-6">
        {/* 图床配置 */}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-on-surface mb-4">
            <Image className="w-4 h-4" />
            图床配置
          </div>

          {/* 提供商选择 */}
          <div className="mb-4">
            <label className="block text-sm text-on-surface-muted mb-1">
              图床提供商
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProviderMenu(!showProviderMenu)}
                className={cn(
                  'w-full px-3 py-2 text-left rounded-lg border',
                  'bg-surface-card',
                  'border-border',
                  'text-on-surface',
                  'flex items-center justify-between'
                )}
              >
                <span>{currentProvider?.label}</span>
                <ChevronDown className="w-4 h-4 text-on-surface-muted" />
              </button>

              {showProviderMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowProviderMenu(false)}
                  />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface-menu backdrop-blur-xl border border-border rounded-lg shadow-lg z-20">
                    {providerOptions.map((opt) => (
                      <button
                        key={opt.value}
                        disabled={!opt.available}
                        onClick={() => {
                          if (opt.available) {
                            setProvider(opt.value);
                            setShowProviderMenu(false);
                          }
                        }}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm',
                          'hover:bg-surface-card',
                          opt.value === provider && 'bg-primary-50 dark:bg-primary-900/30',
                          !opt.available && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {opt.label}
                        {!opt.available && (
                          <span className="ml-2 text-xs text-on-surface-muted">(即将支持)</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* GitHub 配置表单 */}
          {provider === 'github' && (
            <div className="space-y-3 p-4 bg-surface-card rounded-lg">
              <div>
                <label className="block text-sm text-on-surface-muted mb-1">
                  GitHub Token
                </label>
                <Input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                />
                <p className="mt-1 text-xs text-on-surface-muted">
                  需要 repo 权限的 Personal Access Token
                </p>
              </div>

              <div>
                <label className="block text-sm text-on-surface-muted mb-1">
                  仓库地址
                </label>
                <Input
                  placeholder="username/repo"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-on-surface-muted mb-1">
                    分支
                  </label>
                  <Input
                    placeholder="main"
                    value={githubBranch}
                    onChange={(e) => setGithubBranch(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-on-surface-muted mb-1">
                    上传路径
                  </label>
                  <Input
                    placeholder="img/uploads"
                    value={githubPath}
                    onChange={(e) => setGithubPath(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-on-surface-muted mb-1">
                  自定义加速域名（可选）
                </label>
                <Input
                  placeholder="cdn.jsdelivr.net"
                  value={githubCustomDomain}
                  onChange={(e) => setGithubCustomDomain(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm text-on-surface-muted mb-1">
                  URL 路径模板
                </label>
                <Input
                  placeholder="/gh/{repo}@{branch}/{path}"
                  value={githubUrlTemplate}
                  onChange={(e) => setGithubUrlTemplate(e.target.value)}
                />
                <p className="mt-1 text-xs text-on-surface-muted">
                  支持变量：{'{repo}'} {'{branch}'} {'{path}'}
                </p>
              </div>

              <p className="text-xs text-amber-600 dark:text-amber-400">
                单张图片最大 5MB（受边缘函数请求体限制）
              </p>
            </div>
          )}

          {/* Cloudflare R2 配置表单 */}
          {provider === 'r2' && (
            <div className="space-y-3 p-4 bg-surface-card rounded-lg">
              <div>
                <label className="block text-sm text-on-surface-muted mb-1">
                  Account ID
                </label>
                <Input
                  placeholder="your-account-id"
                  value={r2AccountId}
                  onChange={(e) => setR2AccountId(e.target.value)}
                />
                <p className="mt-1 text-xs text-on-surface-muted">
                  在 Cloudflare Dashboard 右侧可找到
                </p>
              </div>

              <div>
                <label className="block text-sm text-on-surface-muted mb-1">
                  Access Key ID
                </label>
                <Input
                  placeholder="your-access-key-id"
                  value={r2AccessKeyId}
                  onChange={(e) => setR2AccessKeyId(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm text-on-surface-muted mb-1">
                  Secret Access Key
                </label>
                <Input
                  type="password"
                  placeholder="your-secret-access-key"
                  value={r2SecretAccessKey}
                  onChange={(e) => setR2SecretAccessKey(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-on-surface-muted mb-1">
                    Bucket 名称
                  </label>
                  <Input
                    placeholder="my-bucket"
                    value={r2BucketName}
                    onChange={(e) => setR2BucketName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-on-surface-muted mb-1">
                    上传路径
                  </label>
                  <Input
                    placeholder="uploads"
                    value={r2Path}
                    onChange={(e) => setR2Path(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-on-surface-muted mb-1">
                  公开访问域名
                </label>
                <Input
                  placeholder="pub-xxx.r2.dev 或自定义域名"
                  value={r2PublicDomain}
                  onChange={(e) => setR2PublicDomain(e.target.value)}
                />
                <p className="mt-1 text-xs text-on-surface-muted">
                  需在 R2 设置中开启公开访问或绑定自定义域名
                </p>
              </div>

              <p className="text-xs text-amber-600 dark:text-amber-400">
                单张图片最大 5MB（受边缘函数请求体限制）
              </p>
            </div>
          )}

          {/* S.EE 配置表单 */}
          {provider === 'smms' && (
            <div className="space-y-3 p-4 bg-surface-card rounded-lg">
              <div>
                <label className="block text-sm text-on-surface-muted mb-1">
                  API Token
                </label>
                <Input
                  type="password"
                  placeholder="your-see-token"
                  value={smmsToken}
                  onChange={(e) => setSmmsToken(e.target.value)}
                />
                <p className="mt-1 text-xs text-on-surface-muted">
                  在 s.ee 用户中心 - API Token 获取
                </p>
              </div>

              <p className="text-xs text-amber-600 dark:text-amber-400">
                免费用户单张图片最大 5MB，每分钟限制 20 次上传
              </p>
            </div>
          )}

          {/* Imgur 配置表单 */}
          {provider === 'imgur' && (
            <div className="space-y-3 p-4 bg-surface-card rounded-lg">
              <div>
                <label className="block text-sm text-on-surface-muted mb-1">
                  Client ID
                </label>
                <Input
                  placeholder="your-imgur-client-id"
                  value={imgurClientId}
                  onChange={(e) => setImgurClientId(e.target.value)}
                />
                <p className="mt-1 text-xs text-on-surface-muted">
                  在 api.imgur.com 注册应用后获取
                </p>
              </div>

              <p className="text-xs text-amber-600 dark:text-amber-400">
                免费额度：12,500 请求/天，单张图片最大 20MB
              </p>
            </div>
          )}
        </div>

        {/* Passkey 管理 */}
        <div className="border-t border-border pt-4">
          <PasskeyManager />
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={handleTest}
            disabled={isTesting}
          >
            {isTesting ? '测试中...' : '测试连接'}
          </Button>
          <Button onClick={handleSave} disabled={isLoading} className="btn-glow">
            {isLoading ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
