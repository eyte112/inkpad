import { useState, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { sharesApi } from '@/services/shares';
import { Loading } from '@/components/ui';
import { SmartImage } from '@/components/common/SmartImage';
import { VideoPlayer } from '@/components/common/VideoPlayer';
import { formatRelativeTime } from '@/utils/date';
import { useTheme } from '@/hooks';
import { Lock, Sun, Moon, Pencil, Send, X, Upload, ImageIcon, Video } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { toast } from '@/stores/toastStore';
import { computePatches } from '@/utils/diff';
import { ImageUploader } from '@/components/editor/ImageUploader';
import { ImagePicker } from '@/components/editor/ImagePicker';

const MDEditor = lazy(() => import('@uiw/react-md-editor'));

// 中文工具栏命令
import { commands as cmd } from '@uiw/react-md-editor';

const t = (c: typeof cmd.bold, title: string) => ({ ...c, buttonProps: { ...c.buttonProps, 'aria-label': title, title } });
const zhBaseCommands = [
  t(cmd.bold, '加粗 (Ctrl+B)'), t(cmd.italic, '斜体 (Ctrl+I)'),
  t(cmd.strikethrough, '删除线 (Ctrl+Shift+X)'), t(cmd.hr, '分割线 (Ctrl+H)'),
  t(cmd.title, '标题'), cmd.divider,
  t(cmd.link, '链接 (Ctrl+L)'), t(cmd.quote, '引用 (Ctrl+Q)'),
  t(cmd.code, '行内代码 (Ctrl+J)'), t(cmd.codeBlock, '代码块 (Ctrl+Shift+J)'),
  t(cmd.comment, '注释 (Ctrl+/)'), cmd.divider,
  t(cmd.image, '图片 (Ctrl+K)'),
];
const zhAfterCommands = [
  t(cmd.table, '表格'), cmd.divider,
  t(cmd.unorderedListCommand, '无序列表 (Ctrl+Shift+U)'),
  t(cmd.orderedListCommand, '有序列表 (Ctrl+Shift+O)'),
  t(cmd.checkedListCommand, '任务列表 (Ctrl+Shift+C)'),
  cmd.divider, t(cmd.help, '帮助'),
];
const zhExtra = [
  t(cmd.codeEdit, '源码 (Ctrl+7)'), t(cmd.codeLive, '实时预览 (Ctrl+8)'),
  t(cmd.codePreview, '仅预览 (Ctrl+9)'), cmd.divider,
  t(cmd.fullscreen, '全屏 (Ctrl+0)'),
];

// XSS 防护：扩展默认 schema 允许 video 标签
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'video', 'iframe', 'style'],
  attributes: {
    ...defaultSchema.attributes,
    video: ['src', 'autoPlay', 'controls', 'width', 'height'],
    iframe: ['src', 'width', 'height', 'frameBorder', 'scrolling', 'allowFullScreen', 'allow', 'style'],
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const markdownComponents = {
  img: ({ src, alt }: any) => <SmartImage src={src || ''} alt={alt} className="max-w-full h-auto" />,
  video: ({ src, autoPlay }: any) => src ? <VideoPlayer src={src} autoPlay={autoPlay} /> : null,
  p: ({ node, children, ...props }: any) => <div {...props} className="md-p">{children}</div>,
  iframe: ({ node, allowFullScreen, ...props }: any) => <iframe {...props} allowFullScreen={allowFullScreen != null} />,
};

export function SharePage() {
  const { slug } = useParams();
  const [password, setPassword] = useState('');
  const [submittedPassword, setSubmittedPassword] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState('');
  const { theme, setTheme } = useTheme();

  // 编辑模式
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // 提交弹窗
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [nickname, setNickname] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 图片/视频工具
  const [showImageUploader, setShowImageUploader] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoAutoPlay, setVideoAutoPlay] = useState(false);

  const insertAtCursor = (markdown: string) => {
    const textarea = document.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement;
    if (textarea) {
      const pos = textarea.selectionStart ?? editContent.length;
      const before = editContent.slice(0, pos);
      const after = editContent.slice(pos);
      const sep = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      setEditContent(before + sep + markdown + after);
    } else {
      setEditContent(editContent + '\n' + markdown);
    }
  };

  const customCommands = [
    { name: 'upload-image', keyCommand: 'upload-image', buttonProps: { 'aria-label': '上传图片', title: '上传图片' }, icon: <Upload className="w-3 h-3" />, execute: () => setShowImageUploader(true) },
    { name: 'pick-image', keyCommand: 'pick-image', buttonProps: { 'aria-label': '从图库选择', title: '从图库选择' }, icon: <ImageIcon className="w-3 h-3" />, execute: () => setShowImagePicker(true) },
    { name: 'insert-video', keyCommand: 'insert-video', buttonProps: { 'aria-label': '插入视频', title: '插入视频' }, icon: <Video className="w-3 h-3" />, execute: () => { setVideoUrl(''); setVideoAutoPlay(false); setShowVideoInput(true); } },
  ];

  const { data: checkData, isLoading: isChecking } = useQuery({
    queryKey: ['share-check', slug],
    queryFn: () => sharesApi.checkShare(slug!),
    enabled: !!slug,
    retry: false,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['share', slug, submittedPassword],
    queryFn: () => sharesApi.getBySlug(slug!, submittedPassword || undefined),
    enabled: !!slug && (checkData?.isPublic || submittedPassword !== null),
    retry: false,
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) { setPasswordError('请输入密码'); return; }
    setPasswordError('');
    setSubmittedPassword(password);
  };

  const enterEditMode = () => {
    if (!data) return;
    setEditTitle(data.title || '');
    setEditContent(data.content || '');
    setEditing(true);
  };

  const exitEditMode = () => {
    setEditing(false);
    setShowSubmitModal(false);
  };

  const handleSubmit = async () => {
    if (!nickname.trim()) { toast.error('请输入昵称'); return; }
    if (!EMAIL_RE.test(contact)) { toast.error('请输入有效的邮箱'); return; }
    if (!data) return;

    const titleChanged = editTitle !== (data.title || '');
    const contentChanged = editContent !== (data.content || '');
    if (!titleChanged && !contentChanged) { toast.error('内容未修改'); return; }

    setSubmitting(true);
    try {
      const patches = contentChanged ? computePatches(data.content || '', editContent) : undefined;
      await sharesApi.submitSuggestion(slug!, {
        nickname: nickname.trim(),
        contact: contact.trim(),
        newTitle: titleChanged ? editTitle : undefined,
        patches,
        password: submittedPassword || undefined,
      });
      toast.success('建议已提交，等待作者审核');
      setShowSubmitModal(false);
      setEditing(false);
      setNickname(''); setContact('');
    } catch (err) {
      toast.error('提交失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  if (isChecking) return <div className="w-screen min-h-screen flex items-center justify-center"><Loading /></div>;

  if (!checkData) return (
    <div className="w-screen min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-on-surface mb-2">页面不存在</h1>
        <p className="text-on-surface-muted">该分享链接无效或已过期</p>
      </div>
    </div>
  );

  if (checkData.requiresPassword && !data) {
    const hasError = error && submittedPassword !== null;
    return (
      <div className="w-screen min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm mx-4">
          <div className="bg-surface-card backdrop-blur-xl rounded-2xl shadow-xl border border-border p-8">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
                <Lock className="w-6 h-6 text-white" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-center text-on-surface mb-2">此分享需要密码</h2>
            <p className="text-sm text-on-surface-muted text-center mb-6">请输入密码以查看内容</p>
            <form onSubmit={handlePasswordSubmit}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码"
                className={cn("w-full px-4 py-2.5 rounded-xl border bg-surface-card text-on-surface placeholder-on-surface-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500", hasError ? "border-red-500 dark:border-red-400" : "border-border")} />
              {(passwordError || hasError) && <p className="mt-2 text-sm text-red-500">{passwordError || '密码错误，请重试'}</p>}
              <button type="submit" disabled={isLoading} className="w-full mt-4 px-4 py-2.5 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer btn-glow">
                {isLoading ? '验证中...' : '确认'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="w-screen min-h-screen flex items-center justify-center"><Loading /></div>;
  if (error || !data) return (
    <div className="w-screen min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-on-surface mb-2">加载失败</h1>
        <p className="text-on-surface-muted">无法获取分享内容</p>
      </div>
    </div>
  );

  const inputCls = cn('w-full px-3 py-2 rounded-lg border border-border', 'bg-surface-card text-on-surface text-sm', 'placeholder:text-on-surface-muted', 'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500');

  return (
    <div className={cn("fixed inset-0", editing ? "flex flex-col overflow-hidden" : "overflow-auto")}>
      <header className="w-full h-14 sticky top-0 z-20 px-4 flex items-center justify-between bg-surface-header backdrop-blur-xl border-b border-border">
        <span className="text-sm text-on-surface-muted">
          {editing ? '编辑模式' : 'InkPad 分享'}
        </span>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button onClick={exitEditMode} className="p-2 rounded-xl hover:bg-surface-card transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <button onClick={() => setShowSubmitModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-sm font-medium btn-glow cursor-pointer">
                <Send className="w-4 h-4" /> 提交
              </button>
            </>
          ) : (
            <>
              {checkData.allowSuggestion && (
                <button onClick={enterEditMode} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-sm font-medium btn-glow cursor-pointer">
                  <Pencil className="w-4 h-4" /> 编辑
                </button>
              )}
              <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-surface-card transition-colors cursor-pointer">
                {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </button>
            </>
          )}
        </div>
      </header>

      {editing ? (
        <>
          <div className="px-4 py-2">
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="标题"
              className={cn(inputCls, 'text-2xl font-bold !py-3')} />
          </div>
          <main className="flex-1 overflow-hidden md-editor-wrapper">
            <Suspense fallback={<div className="h-full flex items-center justify-center text-on-surface-muted text-sm">加载编辑器...</div>}>
              <MDEditor value={editContent} onChange={(v) => setEditContent(v || '')} height="100%" commands={[...zhBaseCommands, ...customCommands, ...zhAfterCommands]} extraCommands={zhExtra} />
            </Suspense>
          </main>
        </>
      ) : (
        <main className="w-full max-w-3xl mx-auto px-4 py-8">
          <article>
            <h1 className="text-3xl font-bold text-on-surface mb-4">{data.title || '无标题笔记'}</h1>
            <div className="text-sm text-on-surface-muted mb-8">分享于 {formatRelativeTime(data.createdAt)}</div>
            <div className="prose dark:prose-invert max-w-none">
              <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} components={markdownComponents}>
                {data.content}
              </ReactMarkdown>
            </div>
          </article>
        </main>
      )}

      {/* 提交弹窗 */}
      {showSubmitModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowSubmitModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-surface-card rounded-2xl shadow-xl border border-border p-6 space-y-4">
              <h3 className="text-lg font-semibold text-on-surface">提交修改建议</h3>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="昵称 *" className={inputCls} />
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="邮箱 *" className={inputCls} />
              <div className="flex gap-2">
                <button onClick={() => setShowSubmitModal(false)}
                  className="flex-1 py-2 rounded-lg border border-border text-sm text-on-surface hover:bg-surface-card transition-colors cursor-pointer">
                  取消
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-2 rounded-lg text-white text-sm font-medium btn-glow disabled:opacity-50 cursor-pointer">
                  {submitting ? '提交中...' : '提交'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showImageUploader && (
        <ImageUploader
          onUpload={(url) => { insertAtCursor(`![image](${url})`); setShowImageUploader(false); }}
          onClose={() => setShowImageUploader(false)}
        />
      )}

      {showImagePicker && (
        <ImagePicker
          onSelect={(image) => { insertAtCursor(`![${image.filename}](${image.url})`); setShowImagePicker(false); }}
          onClose={() => setShowImagePicker(false)}
        />
      )}

      {showVideoInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowVideoInput(false)}>
          <form className="bg-surface-card border border-border rounded-2xl shadow-xl p-5 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); if (videoUrl.trim()) { const attrs = videoAutoPlay ? ' autoplay' : ''; insertAtCursor(`<video src="${videoUrl.trim()}"${attrs}></video>`); setShowVideoInput(false); } }}>
            <h3 className="text-base font-semibold text-on-surface mb-3">插入视频</h3>
            <input autoFocus type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="输入视频直链 URL"
              className="w-full px-3 py-2 rounded-xl border border-border bg-surface-card text-on-surface placeholder-on-surface-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
            <label className="flex items-center gap-2 mt-3 text-sm text-on-surface cursor-pointer select-none">
              <input type="checkbox" checked={videoAutoPlay} onChange={e => setVideoAutoPlay(e.target.checked)} className="accent-primary-600" />
              自动播放
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setShowVideoInput(false)} className="px-4 py-1.5 text-sm text-on-surface-muted hover:bg-surface-menu rounded-xl transition-colors">取消</button>
              <button type="submit" disabled={!videoUrl.trim()} className="px-4 py-1.5 text-sm text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-40 rounded-xl transition-colors">插入</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
