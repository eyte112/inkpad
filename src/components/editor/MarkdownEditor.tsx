import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import MDEditor, { commands } from '@uiw/react-md-editor';

// 中文提示 helper
const t = <T extends object>(c: T, title: string): T => ({ ...c, buttonProps: { ...(c as any).buttonProps, 'aria-label': title, title } });
import { useTheme } from '@/hooks';
import { cn } from '@/utils/helpers';
import { ChevronDown, ChevronUp, Upload, ImageIcon, Video, X } from 'lucide-react';
import { sideBySideDiff } from '@/utils/diff';
import { ImageUploader } from './ImageUploader';
import { ImagePicker } from './ImagePicker';
const SmartImage = lazy(() => import('@/components/common/SmartImage').then(m => ({ default: m.SmartImage })));
const VideoPlayer = lazy(() => import('@/components/common/VideoPlayer').then(m => ({ default: m.VideoPlayer })));

// 模块级常量：不依赖任何 state/props，避免每次渲染重建
const customComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <Suspense><SmartImage src={src || ''} alt={alt} className="max-w-full h-auto" /></Suspense>
  ),
  video: ({ src, autoPlay }: { src?: string; autoPlay?: boolean }) => src ? <Suspense><VideoPlayer src={src} autoPlay={autoPlay} /></Suspense> : null,
  // 防止块级元素（VideoPlayer/iframe）嵌套在 <p> 内导致 hydration 错误
  p: ({ node, children, ...props }: any) => <div {...props} className="md-p">{children}</div>,
  iframe: ({ node, allowFullScreen, ...props }: any) => <iframe {...props} allowFullScreen={allowFullScreen != null} />,
};

const titleIconStyle = {
  fontSize: '9px',
  fontWeight: 700,
  width: '12px',
  height: '12px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center'
} as const;

const title1 = t({ ...commands.title1, icon: <span style={titleIconStyle}>H1</span> }, '标题1 (Ctrl+1)');
const title2 = t({ ...commands.title2, icon: <span style={titleIconStyle}>H2</span> }, '标题2 (Ctrl+2)');
const title3 = t({ ...commands.title3, icon: <span style={titleIconStyle}>H3</span> }, '标题3 (Ctrl+3)');

const staticBasicCommands = [
  t(commands.bold, '加粗 (Ctrl+B)'),
  t(commands.italic, '斜体 (Ctrl+I)'),
  t(commands.strikethrough, '删除线 (Ctrl+Shift+X)'),
  commands.divider,
  t(commands.link, '链接 (Ctrl+L)'),
  t(commands.image, '图片 (Ctrl+K)'),
];

const staticExpandedCommands = [
  t(commands.bold, '加粗 (Ctrl+B)'),
  t(commands.italic, '斜体 (Ctrl+I)'),
  t(commands.strikethrough, '删除线 (Ctrl+Shift+X)'),
  commands.divider,
  title1, title2, title3,
  commands.divider,
  t(commands.link, '链接 (Ctrl+L)'),
  t(commands.image, '图片 (Ctrl+K)'),
];

const staticExpandedCommandsTail = [
  t(commands.quote, '引用 (Ctrl+Q)'),
  t(commands.code, '行内代码 (Ctrl+J)'),
  t(commands.codeBlock, '代码块 (Ctrl+Shift+J)'),
  commands.divider,
  t(commands.unorderedListCommand, '无序列表 (Ctrl+Shift+U)'),
  t(commands.orderedListCommand, '有序列表 (Ctrl+Shift+O)'),
  t(commands.checkedListCommand, '任务列表 (Ctrl+Shift+C)'),
  commands.divider,
  t(commands.hr, '分割线 (Ctrl+H)'),
  t(commands.table, '表格'),
];

const staticBasicCommandsTail = [
  t(commands.unorderedListCommand, '无序列表 (Ctrl+Shift+U)'),
  t(commands.orderedListCommand, '有序列表 (Ctrl+Shift+O)'),
  t(commands.checkedListCommand, '任务列表 (Ctrl+Shift+C)'),
];

const extraCommandsBase = [
  t(commands.codeEdit, '源码 (Ctrl+7)'),
  t(commands.codeLive, '实时预览 (Ctrl+8)'),
  t(commands.codePreview, '仅预览 (Ctrl+9)'),
];

interface MarkdownEditorProps {
  content: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  mode?: 'edit' | 'preview' | 'compare';
  compareText?: string;
  compareLabels?: { left: string; right: string };
  onExitCompare?: () => void;
}

export function MarkdownEditor({
  content,
  onChange,
  placeholder = '开始写作...',
  readOnly = false,
  className,
  mode,
  compareText,
  compareLabels,
  onExitCompare,
}: MarkdownEditorProps) {
  const { resolvedTheme } = useTheme();
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showImageUploader, setShowImageUploader] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoAutoPlay, setVideoAutoPlay] = useState(false);
  const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedMode = mode ?? (readOnly ? 'preview' : 'edit');

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    const handler = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(checkMobile, 150);
    };
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('resize', handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // 缓存 diff 计算结果
  const diffResult = useMemo(() => {
    if (resolvedMode !== 'compare') return null;
    if (content === (compareText ?? '')) return null;
    const rows = sideBySideDiff(content, compareText ?? '');
    const adds = rows.filter(r => r.right.type === 'add').length;
    const dels = rows.filter(r => r.left.type === 'del').length;
    return { rows, adds, dels };
  }, [resolvedMode, content, compareText]);

  if (resolvedMode === 'compare') {
    const labels = compareLabels ?? { left: '修改前', right: '修改后' };

    if (!diffResult) {
      return <div className={cn('flex-1 flex items-center justify-center text-on-surface-muted text-sm', className)}>内容无变化</div>;
    }

    const { rows, adds, dels } = diffResult;
    let leftLine = 0, rightLine = 0;

    return (
      <div className={cn('flex-1 flex flex-col min-h-0', className)}>
        <div className="px-4 py-2 flex items-center gap-3 border-b border-border bg-surface-card shrink-0 text-xs">
          <span className="text-green-600 dark:text-green-400">+{adds}</span>
          <span className="text-red-600 dark:text-red-400">-{dels}</span>
          <div className="flex-1" />
          {onExitCompare && (
            <button onClick={onExitCompare} className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-surface-menu transition-colors text-on-surface-muted cursor-pointer">
              <X className="w-3.5 h-3.5" />退出对比
            </button>
          )}
        </div>
        <div className="flex border-b border-border bg-surface-card shrink-0 text-sm font-semibold text-on-surface">
          <div className="flex-1 px-4 py-1.5 border-r border-border">{labels.left}</div>
          <div className="flex-1 px-4 py-1.5">{labels.right}</div>
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-sm">
          <div className="flex min-h-full">
            <div className="flex-1 border-r border-border">
              {rows.map((row, i) => {
                const { type, text, spans } = row.left;
                if (type !== 'empty') leftLine++;
                return (
                  <div key={i} className={cn('flex', type === 'del' && (spans ? 'bg-red-50 dark:bg-red-900/10' : 'bg-red-100 dark:bg-red-900/30'), type === 'empty' && 'bg-surface-card opacity-40')}>
                    <span className="w-10 shrink-0 text-right pr-2 select-none text-on-surface-muted opacity-50 border-r border-border text-xs leading-5">
                      {type !== 'empty' ? leftLine : ''}
                    </span>
                    <span className={cn('flex-1 whitespace-pre-wrap break-all px-2 leading-5', type === 'del' && !spans && 'text-red-700 dark:text-red-300', type === 'same' && 'text-on-surface')}>
                      {spans ? spans.map((s, j) => s.highlight ? <mark key={j} className="bg-red-200 dark:bg-red-800/50 text-red-700 dark:text-red-300 rounded-sm">{s.text}</mark> : s.text) : (text || '\u00A0')}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex-1">
              {rows.map((row, i) => {
                const { type, text, spans } = row.right;
                if (type !== 'empty') rightLine++;
                return (
                  <div key={i} className={cn('flex', type === 'add' && (spans ? 'bg-green-50 dark:bg-green-900/10' : 'bg-green-100 dark:bg-green-900/30'), type === 'empty' && 'bg-surface-card opacity-40')}>
                    <span className="w-10 shrink-0 text-right pr-2 select-none text-on-surface-muted opacity-50 border-r border-border text-xs leading-5">
                      {type !== 'empty' ? rightLine : ''}
                    </span>
                    <span className={cn('flex-1 whitespace-pre-wrap break-all px-2 leading-5', type === 'add' && !spans && 'text-green-700 dark:text-green-300', type === 'same' && 'text-on-surface')}>
                      {spans ? spans.map((s, j) => s.highlight ? <mark key={j} className="bg-green-200 dark:bg-green-800/50 text-green-700 dark:text-green-300 rounded-sm">{s.text}</mark> : s.text) : (text || '\u00A0')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 在光标位置插入 Markdown 文本
  const insertAtCursor = (markdown: string) => {
    const textarea = document.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement;
    if (textarea) {
      const pos = textarea.selectionStart ?? content.length;
      const before = content.slice(0, pos);
      const after = content.slice(pos);
      const sep = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      onChange?.(before + sep + markdown + after);
    } else {
      onChange?.(content + '\n' + markdown);
    }
  };

  const handleImageUpload = (url: string) => {
    insertAtCursor(`![image](${url})`);
    setShowImageUploader(false);
  };

  const uploadImageCommand = {
    name: 'upload-image',
    keyCommand: 'upload-image',
    buttonProps: { 'aria-label': '上传图片' },
    icon: <Upload className="w-3 h-3" />,
    execute: () => setShowImageUploader(true),
  };

  const pickImageCommand = {
    name: 'pick-image',
    keyCommand: 'pick-image',
    buttonProps: { 'aria-label': '从图库选择' },
    icon: <ImageIcon className="w-3 h-3" />,
    execute: () => setShowImagePicker(true),
  };

  const insertVideoCommand = {
    name: 'insert-video',
    keyCommand: 'insert-video',
    buttonProps: { 'aria-label': '插入视频' },
    icon: <Video className="w-3 h-3" />,
    execute: () => { setVideoUrl(''); setVideoAutoPlay(false); setShowVideoInput(true); },
  };

  if (resolvedMode === 'preview') {
    return (
      <div data-color-mode={colorMode} className={className}>
        <MDEditor.Markdown source={content} components={customComponents} />
      </div>
    );
  }

  const basicCommands = [...staticBasicCommands, uploadImageCommand, pickImageCommand, insertVideoCommand, commands.divider, ...staticBasicCommandsTail];
  const expandedCommands = [...staticExpandedCommands, uploadImageCommand, pickImageCommand, insertVideoCommand, ...staticExpandedCommandsTail];

  const toggleCommand = {
    name: 'toggle-toolbar',
    keyCommand: 'toggle-toolbar',
    buttonProps: { 'aria-label': toolbarExpanded ? '收起工具栏' : '展开工具栏' },
    icon: toolbarExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />,
    execute: () => setToolbarExpanded(!toolbarExpanded),
  };

  const toolbarCommands = isMobile ? (toolbarExpanded ? expandedCommands : basicCommands) : expandedCommands;
  const extraToolbarCommands = isMobile
    ? [...extraCommandsBase, commands.divider, toggleCommand]
    : extraCommandsBase;

  return (
    <div data-color-mode={colorMode} className={cn('md-editor-wrapper', className)}>
      <MDEditor
        value={content}
        onChange={(val) => onChange?.(val || '')}
        preview={isMobile ? "edit" : "live"}
        height="100%"
        visibleDragbar={false}
        commands={toolbarCommands}
        extraCommands={extraToolbarCommands}
        textareaProps={{ placeholder }}
        previewOptions={{ components: customComponents }}
      />

      {showImageUploader && (
        <ImageUploader onUpload={handleImageUpload} onClose={() => setShowImageUploader(false)} />
      )}

      {showImagePicker && (
        <ImagePicker
          onSelect={(image) => { insertAtCursor(`![${image.filename}](${image.url})`); setShowImagePicker(false); }}
          onClose={() => setShowImagePicker(false)}
        />
      )}

      {showVideoInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowVideoInput(false)}>
          <form
            className="bg-surface-card border border-border rounded-2xl shadow-xl p-5 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
            onSubmit={e => {
              e.preventDefault();
              if (videoUrl.trim()) {
                const attrs = videoAutoPlay ? ' autoplay' : '';
                insertAtCursor(`<video src="${videoUrl.trim()}"${attrs}></video>`);
                setShowVideoInput(false);
              }
            }}
          >
            <h3 className="text-base font-semibold text-on-surface mb-3">插入视频</h3>
            <input
              autoFocus
              type="url"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="输入视频直链 URL"
              className="w-full px-3 py-2 rounded-xl border border-border bg-surface-card text-on-surface placeholder-on-surface-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
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