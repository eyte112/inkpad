import { useState, useRef, useEffect, memo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '@/services/notes';
import { Button, Input, Loading, Dialog } from '@/components/ui';
import {
  Plus, Search, FileText, Sun, Moon, Monitor, Settings, Key, LogOut,
  LayoutGrid, List, MoreVertical, Trash2, Edit3, CheckSquare, Square, X, RotateCcw, ImageIcon
} from 'lucide-react';
import { cn } from '@/utils/helpers';
import { formatRelativeTime } from '@/utils/date';
import { useTheme } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import { useNoteListStore } from '@/stores/noteListStore';
const ChangePasswordDialog = lazy(() => import('@/components/ChangePasswordDialog').then(m => ({ default: m.ChangePasswordDialog })));
const AdminPanel = lazy(() => import('@/components/AdminPanel').then(m => ({ default: m.AdminPanel })));
import { toast } from '@/stores/toastStore';
import { authApi } from '@/services/auth';

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const { logout } = useAuthStore();
  const {
    viewMode, setViewMode,
    selectedIds, isSelectMode, toggleSelectMode, toggleSelect, selectAll, clearSelection
  } = useNoteListStore();

  // 点击外部关闭设置菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['notes', { search }],
    queryFn: () => notesApi.list({ search }),
  });

  // 删除笔记
  const deleteMutation = useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success('删除成功');
    },
    onError: () => {
      toast.error('删除失败');
    },
  });

  // 批量删除
  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map(id => notesApi.delete(id)));
    const failCount = results.filter(r => r.status === 'rejected').length;
    const successCount = results.length - failCount;

    queryClient.invalidateQueries({ queryKey: ['notes'] });
    clearSelection();
    toggleSelectMode();
    setBatchDeleteConfirm(false);

    if (failCount === 0) {
      toast.success(`已删除 ${successCount} 篇笔记`);
    } else {
      toast.error(`删除完成：成功 ${successCount}，失败 ${failCount}`);
    }
  };

  // 调试：打印错误信息
  if (error) {
    console.error('获取笔记列表失败:', error);
  }

  const handleCreateNote = () => {
    navigate('/note/new');
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-20 h-14 px-4 lg:px-6 bg-surface-header backdrop-blur-xl border-b border-border">
        <div className="h-full flex items-center justify-between gap-4">
          <h1 className="text-lg font-bold text-on-surface tracking-tight">
            InkPad
          </h1>

          {/* Desktop Search */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <Input
              size="sm"
              placeholder="搜索笔记..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              prefixIcon={<Search className="w-4 h-4" />}
            />
          </div>

          <div className="flex items-center gap-2">
            {/* 图片库 */}
            <button
              onClick={() => navigate('/images')}
              className="p-2 rounded-xl hover:bg-surface-card transition-colors cursor-pointer"
              title="图片库"
            >
              <ImageIcon className="w-5 h-5 text-on-surface-muted" />
            </button>

            {/* 视图切换 */}
            <button
              onClick={() => setViewMode(viewMode === 'card' ? 'list' : 'card')}
              className="p-2 rounded-xl hover:bg-surface-card transition-colors cursor-pointer"
              title={viewMode === 'card' ? '切换到列表视图' : '切换到卡片视图'}
            >
              {viewMode === 'card' ? (
                <List className="w-5 h-5 text-on-surface-muted" />
              ) : (
                <LayoutGrid className="w-5 h-5 text-on-surface-muted" />
              )}
            </button>

            {/* 批量选择 */}
            <button
              onClick={toggleSelectMode}
              className={cn(
                'p-2 rounded-xl transition-colors cursor-pointer',
                isSelectMode
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600'
                  : 'hover:bg-surface-card text-on-surface-muted'
              )}
              title={isSelectMode ? '退出选择' : '批量选择'}
            >
              <CheckSquare className="w-5 h-5" />
            </button>

            {/* 设置菜单 */}
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-xl hover:bg-surface-card transition-colors cursor-pointer"
                title="设置"
              >
                <Settings className="w-5 h-5 text-on-surface-muted" />
              </button>

              {showSettings && (
                <div className="absolute right-0 mt-2 w-56 bg-surface-menu backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-border py-1.5 z-50">
                  {/* 主题选项 */}
                  <div className="px-4 py-2 text-xs font-medium text-on-surface-muted uppercase tracking-wider">主题</div>
                  {/* 跟随系统开关 */}
                  <div className="px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-on-surface">
                      <Monitor className="w-4 h-4" />
                      <span>跟随系统</span>
                    </div>
                    <button
                      onClick={() => setTheme(theme === 'system' ? 'light' : 'system')}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors duration-300",
                        theme === 'system' ? "bg-primary-500" : "bg-border"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-[#3A3A3C] rounded-full shadow transition-transform duration-300",
                          theme === 'system' ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                  {/* 深色模式开关 - 仅在跟随系统关闭时显示 */}
                  {theme !== 'system' && (
                    <div className="px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-on-surface">
                        {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                        <span>深色模式</span>
                      </div>
                      <button
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        className={cn(
                          "relative w-11 h-6 rounded-full transition-colors duration-300",
                          theme === 'dark' ? "bg-primary-500" : "bg-border"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-[#3A3A3C] rounded-full shadow transition-transform duration-300",
                            theme === 'dark' ? "translate-x-5" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>
                  )}
                  <div className="border-t border-border my-1" />
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={() => {
                      setShowAdminPanel(true);
                      setShowSettings(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-on-surface hover:bg-surface-card flex items-center gap-2 rounded-lg mx-0 cursor-pointer"
                  >
                    <Settings className="w-4 h-4" />
                    管理面板
                  </button>
                  <button
                    onClick={() => {
                      setShowChangePassword(true);
                      setShowSettings(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-on-surface hover:bg-surface-card flex items-center gap-2 rounded-lg mx-0 cursor-pointer"
                  >
                    <Key className="w-4 h-4" />
                    修改密码
                  </button>
                  <button
                    onClick={() => {
                      setShowResetConfirm(true);
                      setShowSettings(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 rounded-lg mx-0 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    重置系统
                  </button>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={() => {
                      logout();
                      setShowSettings(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 rounded-lg mx-0 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                </div>
              )}
            </div>

            <Button onClick={handleCreateNote} icon={<Plus className="w-4 h-4" />} className="btn-glow">
              <span className="hidden sm:inline">新建笔记</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Search */}
      <div className="md:hidden px-4 py-3 bg-surface-header backdrop-blur-xl border-b border-border">
        <Input
          size="sm"
          placeholder="搜索笔记..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefixIcon={<Search className="w-4 h-4" />}
        />
      </div>

      {/* 批量操作栏 */}
      {isSelectMode && data?.notes?.length && (
        <div className="sticky top-14 z-10 px-4 lg:px-6 py-3 bg-primary-50/80 dark:bg-primary-900/20 backdrop-blur-sm border-b border-primary-100 dark:border-primary-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (selectedIds.size === data.notes.length) {
                    clearSelection();
                  } else {
                    selectAll(data.notes.map(n => n.id));
                  }
                }}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                {selectedIds.size === data.notes.length ? '取消全选' : '全选'}
              </button>
              <span className="text-sm text-on-surface-muted">
                已选择 {selectedIds.size} 项
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setBatchDeleteConfirm(true)}
                icon={<Trash2 className="w-4 h-4" />}
              >
                删除
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { toggleSelectMode(); clearSelection(); }}
                icon={<X className="w-4 h-4" />}
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="px-4 lg:px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loading />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-lg font-medium text-on-surface mb-2">
              加载失败
            </h3>
            <p className="text-on-surface-muted mb-4">
              {error instanceof Error ? error.message : '获取笔记列表失败'}
            </p>
          </div>
        ) : !data?.notes?.length ? (
          <EmptyState onCreateNote={handleCreateNote} />
        ) : viewMode === 'card' ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                isSelectMode={isSelectMode}
                isSelected={selectedIds.has(note.id)}
                onSelect={() => toggleSelect(note.id)}
                onClick={() => navigate(`/note/${note.id}`)}
                onDelete={() => setDeleteConfirm({ id: note.id, title: note.title })}
              />
            ))}
          </div>
        ) : (
          <div className="bg-surface-card backdrop-blur-xl rounded-2xl border border-border overflow-hidden">
            {/* 表头 */}
            <div className="flex items-center gap-4 px-4 py-2.5 bg-surface-card border-b border-border text-xs font-semibold text-on-surface-muted uppercase tracking-wider">
              {isSelectMode && <div className="w-6" />}
              <div className="w-48 lg:w-64">标题</div>
              <div className="flex-1 hidden sm:block">内容预览</div>
              <div className="hidden md:block w-24">标签</div>
              <div className="w-24 text-right">更新时间</div>
              {!isSelectMode && <div className="w-8" />}
            </div>
            {/* 列表 */}
            {data.notes.map((note) => (
              <NoteListItem
                key={note.id}
                note={note}
                isSelectMode={isSelectMode}
                isSelected={selectedIds.has(note.id)}
                onSelect={() => toggleSelect(note.id)}
                onClick={() => navigate(`/note/${note.id}`)}
                onDelete={() => setDeleteConfirm({ id: note.id, title: note.title })}
              />
            ))}
          </div>
        )}
      </main>

      {/* 修改密码弹窗 */}
      {showChangePassword && (
        <Suspense>
          <ChangePasswordDialog
            open={showChangePassword}
            onClose={() => setShowChangePassword(false)}
          />
        </Suspense>
      )}

      {/* 管理面板 */}
      {showAdminPanel && (
        <Suspense>
          <AdminPanel
            open={showAdminPanel}
            onClose={() => setShowAdminPanel(false)}
          />
        </Suspense>
      )}

      {/* 删除确认弹窗 */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        title="确认删除"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteConfirm) {
                  deleteMutation.mutate(deleteConfirm.id);
                  setDeleteConfirm(null);
                }
              }}
            >
              删除
            </Button>
          </>
        }
      >
        <p className="text-on-surface-muted">
          确定要删除「{deleteConfirm?.title || '无标题笔记'}」吗？此操作不可恢复。
        </p>
      </Dialog>

      {/* 批量删除确认弹窗 */}
      <Dialog
        open={batchDeleteConfirm}
        onOpenChange={setBatchDeleteConfirm}
        title="确认批量删除"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBatchDeleteConfirm(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleBatchDelete}>
              删除 {selectedIds.size} 项
            </Button>
          </>
        }
      >
        <p className="text-on-surface-muted">
          确定要删除选中的 {selectedIds.size} 篇笔记吗？此操作不可恢复。
        </p>
      </Dialog>

      {/* 重置系统确认弹窗 */}
      <Dialog
        open={showResetConfirm}
        onOpenChange={(open) => {
          setShowResetConfirm(open);
          if (!open) setResetPassword('');
        }}
        title="重置系统"
        description="此操作将删除所有数据，恢复到初始状态"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => {
              setShowResetConfirm(false);
              setResetPassword('');
            }}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={!resetPassword || resetLoading}
              onClick={async () => {
                setResetLoading(true);
                try {
                  const { token } = await authApi.resetRequest(resetPassword);
                  await authApi.resetConfirm(token);
                  toast.success('重置成功');
                  window.location.href = '/setup';
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : '重置失败');
                } finally {
                  setResetLoading(false);
                }
              }}
            >
              {resetLoading ? '重置中...' : '确认重置'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">
            警告：此操作将删除所有笔记、标签、分享链接和配置，不可恢复！
          </p>
          <Input
            type="password"
            placeholder="请输入密码确认"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}

// 笔记卡片
interface NoteCardProps {
  note: {
    id: string;
    title: string;
    preview?: string;
    updatedAt: string;
    tags?: string[];
  };
  isSelectMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onClick: () => void;
  onDelete: () => void;
}

const NoteCard = memo(function NoteCard({ note, isSelectMode, isSelected, onSelect, onClick, onDelete }: NoteCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleClick = () => {
    if (isSelectMode) {
      onSelect();
    } else {
      onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative cursor-pointer',
        'bg-surface-card backdrop-blur-xl',
        'border border-border',
        'rounded-2xl',
        'p-4 min-h-[160px] flex flex-col',
        'transition-all duration-200',
        'hover:shadow-lg hover:shadow-primary-500/10 hover:border-primary-300 dark:hover:border-primary-700',
        isSelected && 'ring-2 ring-primary-500 border-primary-500'
      )}
    >
      {/* 选择框 */}
      {isSelectMode && (
        <div className="absolute top-3 left-3">
          {isSelected ? (
            <CheckSquare className="w-5 h-5 text-primary-500" />
          ) : (
            <Square className="w-5 h-5 text-on-surface-muted" />
          )}
        </div>
      )}

      {/* 操作菜单 */}
      {!isSelectMode && (
        <div className="absolute top-3 right-3" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-surface-card transition-opacity cursor-pointer"
          >
            <MoreVertical className="w-4 h-4 text-on-surface-muted" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-32 bg-surface-menu backdrop-blur-xl rounded-xl shadow-lg border border-border py-1 z-10">
              <button
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                className="w-full px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-card flex items-center gap-2 cursor-pointer"
              >
                <Edit3 className="w-4 h-4" /> 编辑
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(); }}
                className="w-full px-3 py-2 text-left text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> 删除
              </button>
            </div>
          )}
        </div>
      )}

      <h3 className={cn(
        "text-base font-semibold text-on-surface line-clamp-1",
        isSelectMode && "pl-6"
      )}>
        {note.title || '无标题笔记'}
      </h3>

      <p className="mt-2 flex-1 text-sm text-on-surface-muted line-clamp-3">
        {note.preview || '暂无内容'}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-on-surface-muted">
          {formatRelativeTime(note.updatedAt)}
        </span>

        {note.tags && note.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {note.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// 笔记列表项 - PC 端优化
const NoteListItem = memo(function NoteListItem({ note, isSelectMode, isSelected, onSelect, onClick, onDelete }: NoteCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleClick = () => {
    if (isSelectMode) {
      onSelect();
    } else {
      onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative cursor-pointer',
        'bg-transparent',
        'border-b border-border',
        'px-4 py-3',
        'transition-all duration-150',
        'hover:bg-surface-card',
        isSelected && 'bg-primary-50 dark:bg-primary-900/20'
      )}
    >
      <div className="flex items-center gap-4">
        {/* 选择框 */}
        {isSelectMode && (
          <div className="flex-shrink-0 w-6">
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-primary-500" />
            ) : (
              <Square className="w-5 h-5 text-on-surface-muted" />
            )}
          </div>
        )}

        {/* 标题 - 固定宽度 */}
        <div className="w-48 lg:w-64 flex-shrink-0">
          <h3 className="text-sm font-medium text-on-surface truncate">
            {note.title || '无标题笔记'}
          </h3>
        </div>

        {/* 预览内容 - 自适应 */}
        <div className="flex-1 min-w-0 hidden sm:block">
          <p className="text-sm text-on-surface-muted truncate">
            {note.preview || '暂无内容'}
          </p>
        </div>

        {/* 标签 */}
        {note.tags && note.tags.length > 0 && (
          <div className="hidden md:flex gap-1.5 flex-shrink-0">
            {note.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 时间 */}
        <span className="flex-shrink-0 w-24 text-right text-xs text-on-surface-muted">
          {formatRelativeTime(note.updatedAt)}
        </span>

        {/* 操作菜单 */}
        {!isSelectMode && (
          <div className="relative flex-shrink-0 w-8" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="p-1.5 rounded-xl hover:bg-surface-card cursor-pointer"
            >
              <MoreVertical className="w-4 h-4 text-on-surface-muted" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-surface-menu backdrop-blur-xl rounded-xl shadow-lg border border-border py-1 z-20">
                <button
                  onClick={(e) => { e.stopPropagation(); onClick(); }}
                  className="w-full px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-card flex items-center gap-2 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" /> 编辑
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(); }}
                  className="w-full px-3 py-2 text-left text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// 空状态
function EmptyState({ onCreateNote }: { onCreateNote: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-80 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900/30 dark:to-primary-800/20 flex items-center justify-center mb-5">
        <FileText className="w-8 h-8 text-primary-500" />
      </div>
      <h3 className="text-lg font-semibold text-on-surface mb-1.5">
        还没有任何笔记
      </h3>
      <p className="text-sm text-on-surface-muted mb-6">
        点击下方按钮创建第一篇笔记
      </p>
      <Button onClick={onCreateNote} icon={<Plus className="w-4 h-4" />} className="btn-glow">
        新建笔记
      </Button>
    </div>
  );
}
