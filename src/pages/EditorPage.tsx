import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '@/services/notes';
import { suggestionsApi } from '@/services/suggestions';
import { MarkdownEditor } from '@/components/editor';
import { HistoryDrawer } from '@/components/editor/HistoryDrawer';
import { SuggestionDrawer } from '@/components/editor/SuggestionDrawer';
import { Button, Loading, ShareDialog } from '@/components/ui';
import { ChevronLeft, Save, Share2, Check, AlertCircle, History, MessageSquare, MoreVertical } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { toast } from '@/stores/toastStore';
import { saveNoteDraft, getNoteDraft, clearNoteDraft } from '@/utils/storage';
import { ConflictDialog } from '@/components/editor/ConflictDialog';
import type { ConflictData } from '@/components/editor/ConflictDialog';
import { NOTE_CONFIG } from '@/constants';

type SaveStatusType = 'idle' | 'saved' | 'saving' | 'unsaved' | 'error' | 'local';

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [version, setVersion] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatusType>('idle');
  const [noteId, setNoteId] = useState<string | null>(id || null);

  // 追踪内容变化
  const prevContentRef = useRef({ title: '', content: '' });
  const serverContentRef = useRef({ title: '', content: '', version: 0 });
  const isInitialMount = useRef(true);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showSuggestionDrawer, setShowSuggestionDrawer] = useState(false);
  const [showEditorMenu, setShowEditorMenu] = useState(false);
  const editorMenuRef = useRef<HTMLDivElement>(null);
  const [compareState, setCompareState] = useState<{ content: string; compareText: string; labels: { left: string; right: string } } | null>(null);
  // 用 ref 存最新值，避免 doSave 依赖 state 导致频繁重建
  const latestRef = useRef({ title, content, version, noteId });
  latestRef.current = { title, content, version, noteId };
  const isSavingRef = useRef(false);
  const skipNoteEffectRef = useRef(false);
  const cloudSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);

  const isNew = !noteId;

  // 计算统计信息（单次遍历，零临时数组分配）
  const stats = useMemo(() => {
    const text = content || '';
    const len = text.length;
    let chars = 0, chineseChars = 0, englishWords = 0, lines = 0, paragraphs = 0;
    let inWord = false, lineHasContent = false;
    for (let i = 0; i < len; i++) {
      const c = text.charCodeAt(i);
      if (c === 10) {
        lines++;
        if (lineHasContent) paragraphs++;
        lineHasContent = false;
        inWord = false;
      } else {
        if (c !== 32 && c !== 9 && c !== 13) { chars++; lineHasContent = true; }
        if (c >= 0x4e00 && c <= 0x9fa5) chineseChars++;
        const isAlpha = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
        if (isAlpha) { if (!inWord) { englishWords++; inWord = true; } }
        else { inWord = false; }
      }
    }
    if (len > 0) lines++;
    if (lineHasContent) paragraphs++;
    return { chars, charsWithSpaces: len, chineseChars, englishWords, lines, paragraphs };
  }, [content]);

  // 获取笔记
  const { data: note, isLoading } = useQuery({
    queryKey: ['note', noteId],
    queryFn: () => notesApi.get(noteId!),
    enabled: !!noteId,
  });

  // 获取待审核建议数量
  const { data: pendingSuggestions = [] } = useQuery({
    queryKey: ['suggestions', noteId, 'pending'],
    queryFn: () => suggestionsApi.list(noteId!, 'pending'),
    enabled: !!noteId,
    refetchInterval: 30000,
  });

  // 保存本地草稿
  const saveLocal = useCallback(() => {
    const { title: t, content: c, version: v, noteId: nId } = latestRef.current;
    if (!nId) return;
    const prev = prevContentRef.current;
    if (t === prev.title && c === prev.content) return;
    saveNoteDraft(nId, t, c, v, false);
    setSaveStatus('local');
  }, []);

  // 云端同步（API 写入 + 快照）
  const doCloudSync = useCallback(async (createSnapshot = true) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    const { title: t, content: c, version: v, noteId: nId } = latestRef.current;
    const prev = prevContentRef.current;
    const titleChanged = t !== prev.title;
    const contentChanged = c !== prev.content;

    if (!titleChanged && !contentChanged) {
      isSavingRef.current = false;
      return;
    }

    setSaveStatus('saving');
    try {
      let savedNote;
      if (!nId) {
        savedNote = await notesApi.create({ title: t, content: c, tags: [] });
        queryClient.setQueryData(['note', savedNote.id], savedNote);
        queryClient.invalidateQueries({ queryKey: ['notes'] });
        setNoteId(savedNote.id);
        window.history.replaceState(null, '', `/note/${savedNote.id}`);
      } else {
        const changes: { id: string; title?: string; content?: string; version: number; createSnapshot?: boolean } = { id: nId, version: v };
        if (titleChanged) changes.title = t;
        if (contentChanged) changes.content = c;
        if (createSnapshot) changes.createSnapshot = true;
        savedNote = await notesApi.partialUpdate(changes);
      }

      if (savedNote && nId) {
        skipNoteEffectRef.current = true;
        queryClient.setQueryData(['note', nId], savedNote);
        queryClient.invalidateQueries({ queryKey: ['notes'] });
      }

      setSaveStatus('saved');
      prevContentRef.current = { title: t, content: c };
      if (savedNote?.version) {
        setVersion(savedNote.version);
        serverContentRef.current = { title: t, content: c, version: savedNote.version };
      }
      // 同步成功，标记草稿已同步
      if (nId) saveNoteDraft(nId, t, c, savedNote?.version ?? v, true);
    } catch (err: any) {
      if (err?.message?.includes('409') || err?.message?.includes('版本冲突')) {
        // 409 冲突：拉取最新版本重试
        try {
          const serverData = await notesApi.get(nId!);
          const sv = serverData.version || 0;
          serverContentRef.current = { title: serverData.title || '', content: serverData.content || '', version: sv };
          const retryData: { id: string; title?: string; content?: string; version: number; createSnapshot?: boolean } = { id: nId!, version: sv };
          if (titleChanged) retryData.title = t;
          if (contentChanged) retryData.content = c;
          if (createSnapshot) retryData.createSnapshot = true;
          const savedNote = await notesApi.partialUpdate(retryData);
          if (savedNote) {
            skipNoteEffectRef.current = true;
            queryClient.setQueryData(['note', nId!], savedNote);
            queryClient.invalidateQueries({ queryKey: ['notes'] });
          }
          setSaveStatus('saved');
          prevContentRef.current = { title: t, content: c };
          if (savedNote?.version) {
            setVersion(savedNote.version);
            serverContentRef.current = { title: t, content: c, version: savedNote.version };
          }
          if (nId) saveNoteDraft(nId, t, c, savedNote?.version ?? sv, true);
          toast.info('检测到版本冲突，已自动合并');
        } catch {
          setSaveStatus('error');
          toast.error('保存失败', '冲突解决失败，请刷新页面');
        }
      } else {
        setSaveStatus('error');
        toast.error('同步失败', err instanceof Error ? err.message : '请稍后重试');
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [queryClient]);

  // 手动保存（立即云端同步 + 快照）
  const handleManualSave = useCallback(() => {
    doCloudSync(true);
  }, [doCloudSync]);

  // 初始化内容 + 冲突检测
  useEffect(() => {
    if (note) {
      if (skipNoteEffectRef.current) {
        skipNoteEffectRef.current = false;
        return;
      }
      const cloudTitle = note.title || '';
      const cloudContent = note.content || '';
      const cloudVersion = note.version || 0;

      // 检查本地是否有未同步草稿
      const draft = note.id ? getNoteDraft(note.id) : null;
      if (draft && !draft.synced && (draft.title !== cloudTitle || draft.content !== cloudContent)) {
        // 有冲突，显示弹窗
        setConflictData({
          localTitle: draft.title,
          localContent: draft.content,
          localSavedAt: draft.savedAt,
          cloudTitle,
          cloudContent,
          cloudUpdatedAt: note.updatedAt || note.createdAt || '',
        });
        // 先用云端数据填充编辑器，等用户选择
        serverContentRef.current = { title: cloudTitle, content: cloudContent, version: cloudVersion };
        setVersion(cloudVersion);
        setSaveStatus('saved');
        return;
      }

      // 无冲突，正常初始化
      if (draft && draft.synced) clearNoteDraft(note.id!);
      setTitle(cloudTitle);
      setContent(cloudContent);
      setVersion(cloudVersion);
      prevContentRef.current = { title: cloudTitle, content: cloudContent };
      serverContentRef.current = { title: cloudTitle, content: cloudContent, version: cloudVersion };
      setSaveStatus('saved');
    }
  }, [note]);

  // 自动保存
  useEffect(() => {
    // 跳过初始渲染
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // 新笔记且无内容时不触发
    if (isNew && !title.trim() && !content.trim()) {
      return;
    }

    // 检查内容是否真的变化
    if (title === prevContentRef.current.title &&
        content === prevContentRef.current.content) {
      return;
    }

    setSaveStatus('unsaved');
    const timer = setTimeout(() => {
      saveLocal();
    }, NOTE_CONFIG.AUTO_SAVE_DELAY);

    return () => clearTimeout(timer);
  }, [title, content, isNew, saveLocal]);

  // 云端定时同步（30s interval）
  useEffect(() => {
    cloudSyncTimerRef.current = setInterval(() => {
      const { noteId: nId } = latestRef.current;
      if (!nId) return;
      const draft = getNoteDraft(nId);
      if (draft && !draft.synced) doCloudSync(true);
    }, NOTE_CONFIG.CLOUD_SYNC_INTERVAL);
    return () => {
      if (cloudSyncTimerRef.current) clearInterval(cloudSyncTimerRef.current);
    };
  }, [doCloudSync]);

  // 关闭页面前保存到 localStorage 兜底
  useEffect(() => {
    const onBeforeUnload = () => {
      const { title: t, content: c, version: v, noteId: nId } = latestRef.current;
      if (nId) saveNoteDraft(nId, t, c, v, false);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Ctrl+S 快捷键：立即云端同步
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        doCloudSync(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doCloudSync]);

  // 移动端菜单：点击外部关闭
  useEffect(() => {
    if (!showEditorMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (editorMenuRef.current && !editorMenuRef.current.contains(e.target as Node)) {
        setShowEditorMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEditorMenu]);

  // 冲突解决：使用本地版本
  const handleUseLocal = useCallback(() => {
    if (!conflictData) return;
    setTitle(conflictData.localTitle);
    setContent(conflictData.localContent);
    // 不更新 prevContentRef，让 doCloudSync 能检测到与云端的差异
    setSaveStatus('unsaved');
    setConflictData(null);
    setTimeout(() => doCloudSync(true), 100);
  }, [conflictData, doCloudSync]);

  // 冲突解决：使用云端版本
  const handleUseCloud = useCallback(() => {
    if (!conflictData) return;
    setTitle(conflictData.cloudTitle);
    setContent(conflictData.cloudContent);
    prevContentRef.current = { title: conflictData.cloudTitle, content: conflictData.cloudContent };
    setSaveStatus('saved');
    setConflictData(null);
    if (noteId) clearNoteDraft(noteId);
  }, [conflictData, noteId]);

  if (isLoading && !isNew) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Toolbar */}
      <header className={cn(
        'sticky top-0 z-20 h-13',
        'px-4 flex items-center gap-2',
        'bg-surface-header backdrop-blur-xl',
        'border-b border-border'
      )}>
        <button
          onClick={() => navigate('/')}
          className="p-2 -ml-2 rounded-xl hover:bg-surface-card transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="无标题笔记"
          className={cn(
            'flex-1 min-w-0 bg-transparent',
            'text-lg font-medium text-on-surface',
            'placeholder:text-on-surface-muted',
            'focus:outline-none'
          )}
        />

        <SaveStatus status={saveStatus} />

        {/* 桌面端：保持原有按钮（容器控制响应式可见性，避免 Button 基础类 inline-flex 覆盖 hidden） */}
        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleManualSave}>
            <Save className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={() => noteId && setShowHistoryDrawer(true)} disabled={!noteId}>
            <History className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={() => noteId && setShowSuggestionDrawer(true)} disabled={!noteId} className="relative">
            <MessageSquare className="w-4 h-4" />
            {pendingSuggestions.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                {pendingSuggestions.length}
              </span>
            )}
          </Button>

          <Button variant="ghost" size="sm" onClick={() => noteId && setShowShareDialog(true)} disabled={!noteId}>
            <Share2 className="w-4 h-4" />
          </Button>
        </div>

        {/* 移动端：收进下拉菜单 */}
        <div className="relative md:hidden" ref={editorMenuRef}>
          <button
            onClick={() => setShowEditorMenu(!showEditorMenu)}
            className="p-2 rounded-xl hover:bg-surface-card transition-colors cursor-pointer relative"
          >
            <MoreVertical className="w-5 h-5 text-on-surface-muted" />
            {pendingSuggestions.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
            )}
          </button>

          {showEditorMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-surface-menu backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-border py-1.5 z-50">
              <button
                onClick={() => { handleManualSave(); setShowEditorMenu(false); }}
                className="w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-surface-card flex items-center gap-3 cursor-pointer"
              >
                <Save className="w-4 h-4 text-on-surface-muted" />
                保存
                <span className="ml-auto text-xs text-on-surface-muted">Ctrl+S</span>
              </button>
              <button
                onClick={() => { if (noteId) { setShowHistoryDrawer(true); setShowEditorMenu(false); } }}
                disabled={!noteId}
                className="w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-surface-card flex items-center gap-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <History className="w-4 h-4 text-on-surface-muted" />
                历史版本
              </button>
              <button
                onClick={() => { if (noteId) { setShowSuggestionDrawer(true); setShowEditorMenu(false); } }}
                disabled={!noteId}
                className="w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-surface-card flex items-center gap-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MessageSquare className="w-4 h-4 text-on-surface-muted" />
                修改建议
                {pendingSuggestions.length > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] leading-none">
                    {pendingSuggestions.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { if (noteId) { setShowShareDialog(true); setShowEditorMenu(false); } }}
                disabled={!noteId}
                className="w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-surface-card flex items-center gap-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Share2 className="w-4 h-4 text-on-surface-muted" />
                分享
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Editor */}
      <main className="flex-1 overflow-hidden">
        {compareState ? (
          <MarkdownEditor
            mode="compare"
            content={compareState.content}
            compareText={compareState.compareText}
            compareLabels={compareState.labels}
            onExitCompare={() => setCompareState(null)}
            className="h-full"
          />
        ) : (
          <MarkdownEditor
            content={content}
            onChange={setContent}
            placeholder="开始写作..."
            className="h-full"
          />
        )}
      </main>

      {/* 底栏统计 */}
      <footer className={cn(
        'h-8 px-4 flex items-center gap-4',
        'bg-surface-card',
        'border-t border-border',
        'text-xs text-on-surface-muted'
      )}>
        <span>{stats.chineseChars} 字</span>
        <span>{stats.englishWords} 词</span>
        <span>{stats.chars} 字符</span>
        <span>{stats.paragraphs} 段</span>
        <span>{stats.lines} 行</span>
      </footer>

      {/* 分享弹窗 */}
      {noteId && (
        <ShareDialog
          noteId={noteId}
          noteTitle={title}
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
        />
      )}

      {/* 历史版本抽屉 */}
      {noteId && (
        <HistoryDrawer
          noteId={noteId}
          currentVersion={version}
          open={showHistoryDrawer}
          onOpenChange={setShowHistoryDrawer}
          onRollback={() => queryClient.invalidateQueries({ queryKey: ['note', noteId] })}
          onCompare={(hist) => { setCompareState({ content, compareText: hist, labels: { left: '当前内容', right: '历史版本' } }); setShowHistoryDrawer(false); }}
        />
      )}

      {/* 建议审核抽屉 */}
      {noteId && (
        <SuggestionDrawer
          noteId={noteId}
          noteContent={content}
          open={showSuggestionDrawer}
          onOpenChange={setShowSuggestionDrawer}
          onApproved={() => queryClient.invalidateQueries({ queryKey: ['note', noteId] })}
          onCompare={(newText) => { setCompareState({ content, compareText: newText, labels: { left: '当前内容', right: '建议修改' } }); setShowSuggestionDrawer(false); }}
        />
      )}

      {/* 冲突检测弹窗 */}
      {conflictData && (
        <ConflictDialog
          open
          data={conflictData}
          onUseLocal={handleUseLocal}
          onUseCloud={handleUseCloud}
        />
      )}
    </div>
  );
}

// 保存状态指示器
function SaveStatus({ status }: { status: SaveStatusType }) {
  if (status === 'idle') return null;

  return (
    <span className="text-xs text-on-surface-muted flex items-center gap-1">
      {status === 'saving' && '同步中...'}
      {status === 'saved' && (
        <>
          <Check className="w-3 h-3 text-green-500" />
          已同步
        </>
      )}
      {status === 'local' && '已本地保存'}
      {status === 'unsaved' && '未保存'}
      {status === 'error' && (
        <>
          <AlertCircle className="w-3 h-3 text-red-500" />
          保存失败
        </>
      )}
    </span>
  );
}
