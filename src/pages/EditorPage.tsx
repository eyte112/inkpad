import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '@/services/notes';
import { suggestionsApi } from '@/services/suggestions';
import { MarkdownEditor } from '@/components/editor';
import { HistoryDrawer } from '@/components/editor/HistoryDrawer';
import { SuggestionDrawer } from '@/components/editor/SuggestionDrawer';
import { Button, Loading, ShareDialog } from '@/components/ui';
import { ChevronLeft, Save, Share2, Check, AlertCircle, History, MessageSquare } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { toast } from '@/stores/toastStore';

type SaveStatusType = 'idle' | 'saved' | 'saving' | 'unsaved' | 'error';

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
  const [compareState, setCompareState] = useState<{ content: string; compareText: string; labels: { left: string; right: string } } | null>(null);
  // 用 ref 存最新值，避免 doSave 依赖 state 导致频繁重建
  const latestRef = useRef({ title, content, version, noteId });
  latestRef.current = { title, content, version, noteId };
  const isSavingRef = useRef(false);
  const skipNoteEffectRef = useRef(false);

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

  // 冲突处理：合并并重试
  const mergeAndRetry = useCallback(async (
    localChanges: { title?: string; content?: string },
    isFullSave: boolean
  ) => {
    const { title: curTitle, content: curContent, noteId: curNoteId } = latestRef.current;
    const serverData = await notesApi.get(curNoteId!);
    const serverTitle = serverData.title || '';
    const serverContent = serverData.content || '';
    const serverVersion = serverData.version || 0;

    let mergedTitle = curTitle;
    let mergedContent = curContent;
    let hasConflict = false;

    if (localChanges.title !== undefined) {
      if (serverTitle !== serverContentRef.current.title) hasConflict = true;
    } else {
      mergedTitle = serverTitle;
    }

    if (localChanges.content !== undefined) {
      if (serverContent !== serverContentRef.current.content) hasConflict = true;
    } else {
      mergedContent = serverContent;
    }

    serverContentRef.current = { title: serverTitle, content: serverContent, version: serverVersion };
    if (hasConflict) toast.info('检测到冲突，已保留本地修改');

    const retryData = isFullSave
      ? { id: curNoteId!, title: mergedTitle, content: mergedContent, version: serverVersion }
      : { id: curNoteId!, ...localChanges, version: serverVersion };

    return await notesApi.partialUpdate(retryData);
  }, []);

  // 执行保存（通过 latestRef 读取最新值，避免依赖 state 频繁重建）
  const doSave = useCallback(async (isFullSave: boolean, createSnapshot = false) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    const { title: t, content: c, version: v, noteId: nId } = latestRef.current;
    const prev = prevContentRef.current;
    const titleChanged = t !== prev.title;
    const contentChanged = c !== prev.content;

    if (!titleChanged && !contentChanged) {
      // 无内容变化但需要创建快照时，仍发送请求
      if (createSnapshot && nId) {
        setSaveStatus('saving');
        try {
          const savedNote = await notesApi.partialUpdate({ id: nId, version: v, createSnapshot: true });
          if (savedNote) {
            skipNoteEffectRef.current = true;
            queryClient.setQueryData(['note', nId], savedNote);
            if (savedNote.version) {
              setVersion(savedNote.version);
              serverContentRef.current = { ...serverContentRef.current, version: savedNote.version };
            }
          }
          setSaveStatus('saved');
        } catch {
          setSaveStatus('error');
        }
      }
      isSavingRef.current = false;
      return;
    }

    setSaveStatus('saving');
    let saveSucceeded = false;

    try {
      let savedNote;

      if (!nId) {
        savedNote = await notesApi.create({ title: t, content: c, tags: [] });
        queryClient.setQueryData(['note', savedNote.id], savedNote);
        queryClient.invalidateQueries({ queryKey: ['notes'] });
        setNoteId(savedNote.id);
        window.history.replaceState(null, '', `/note/${savedNote.id}`);
      } else if (isFullSave) {
        savedNote = await notesApi.update({ id: nId, title: t, content: c, version: v, createSnapshot });
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
      saveSucceeded = true;
      prevContentRef.current = { title: t, content: c };
      if (savedNote?.version) {
        setVersion(savedNote.version);
        serverContentRef.current = { title: t, content: c, version: savedNote.version };
      }
    } catch (err: any) {
      if (err?.message?.includes('409') || err?.message?.includes('版本冲突')) {
        try {
          const changes: { title?: string; content?: string } = {};
          if (titleChanged) changes.title = t;
          if (contentChanged) changes.content = c;

          const savedNote = await mergeAndRetry(changes, isFullSave);
          if (savedNote) {
            skipNoteEffectRef.current = true;
            queryClient.setQueryData(['note', nId!], savedNote);
            queryClient.invalidateQueries({ queryKey: ['notes'] });
          }
          setSaveStatus('saved');
          saveSucceeded = true;
          prevContentRef.current = { title: t, content: c };
          if (savedNote?.version) setVersion(savedNote.version);
          return;
        } catch {
          setSaveStatus('error');
          toast.error('保存失败', '冲突解决失败，请刷新页面');
          return;
        }
      }

      setSaveStatus('error');
      toast.error('保存失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      isSavingRef.current = false;
      if (saveSucceeded) {
        const cur = latestRef.current;
        if (cur.title !== prevContentRef.current.title || cur.content !== prevContentRef.current.content) {
          setTimeout(() => doSave(false, false), 500);
        }
      }
    }
  }, [mergeAndRetry, queryClient]);

  // 手动保存（全量 + 快照）
  const handleManualSave = useCallback(() => {
    doSave(true, true);
  }, [doSave]);

  // 自动保存（增量，不创建快照）
  const handleAutoSave = useCallback(() => {
    doSave(false, false);
  }, [doSave]);

  // 初始化内容（跳过自身保存触发的更新）
  useEffect(() => {
    if (note) {
      if (skipNoteEffectRef.current) {
        skipNoteEffectRef.current = false;
        return;
      }
      setTitle(note.title || '');
      setContent(note.content || '');
      setVersion(note.version || 0);
      prevContentRef.current = { title: note.title || '', content: note.content || '' };
      serverContentRef.current = { title: note.title || '', content: note.content || '', version: note.version || 0 };
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
      handleAutoSave();
    }, 2000);

    return () => clearTimeout(timer);
  }, [title, content, isNew, handleAutoSave]);

  // 关闭页面前带快照保存
  useEffect(() => {
    const onBeforeUnload = () => { doSave(false, true); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [doSave]);

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
            'flex-1 bg-transparent',
            'text-lg font-medium text-on-surface',
            'placeholder:text-on-surface-muted',
            'focus:outline-none'
          )}
        />

        <SaveStatus status={saveStatus} />

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
    </div>
  );
}

// 保存状态指示器
function SaveStatus({ status }: { status: SaveStatusType }) {
  if (status === 'idle') return null;

  return (
    <span className="text-xs text-on-surface-muted flex items-center gap-1">
      {status === 'saving' && '保存中...'}
      {status === 'saved' && (
        <>
          <Check className="w-3 h-3 text-green-500" />
          已保存
        </>
      )}
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
