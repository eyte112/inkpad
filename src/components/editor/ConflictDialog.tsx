import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { sideBySideDiff } from '@/utils/diff';
import type { CharSpan } from '@/utils/diff';
import { cn } from '@/utils/helpers';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export interface ConflictData {
  localTitle: string;
  localContent: string;
  localSavedAt: string;
  cloudTitle: string;
  cloudContent: string;
  cloudUpdatedAt: string;
}

interface ConflictDialogProps {
  open: boolean;
  data: ConflictData;
  onUseLocal: () => void;
  onUseCloud: () => void;
}

export function ConflictDialog({ open, data, onUseLocal, onUseCloud }: ConflictDialogProps) {
  const [showDiff, setShowDiff] = useState(false);

  const fmtTime = (iso: string) => {
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: zhCN });
    } catch {
      return iso;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={() => {}}
      size="xl"
      title="检测到内容冲突"
      description="本地有未同步的修改，与云端版本不一致"
      showCloseButton={false}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setShowDiff((v) => !v)}>
            {showDiff ? '收起对比' : '查看对比'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onUseCloud}>
            使用云端版本
          </Button>
          <Button variant="primary" size="sm" onClick={onUseLocal}>
            使用本地版本
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex gap-4">
          <div className="flex-1 p-3 rounded-xl bg-surface-card border border-border">
            <div className="font-medium text-on-surface">本地版本</div>
            <div className="text-on-surface-muted">{fmtTime(data.localSavedAt)}</div>
            {data.localTitle !== data.cloudTitle && (
              <div className="mt-1 text-on-surface truncate">标题: {data.localTitle || '(无标题)'}</div>
            )}
          </div>
          <div className="flex-1 p-3 rounded-xl bg-surface-card border border-border">
            <div className="font-medium text-on-surface">云端版本</div>
            <div className="text-on-surface-muted">{fmtTime(data.cloudUpdatedAt)}</div>
            {data.localTitle !== data.cloudTitle && (
              <div className="mt-1 text-on-surface truncate">标题: {data.cloudTitle || '(无标题)'}</div>
            )}
          </div>
        </div>

        {showDiff && <DiffView oldText={data.cloudContent} newText={data.localContent} />}
      </div>
    </Dialog>
  );
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const rows = sideBySideDiff(oldText, newText);

  return (
    <div className="max-h-64 overflow-auto rounded-xl border border-border text-xs font-mono">
      <div className="grid grid-cols-2 divide-x divide-border">
        <div className="px-2 py-1 font-semibold text-on-surface-muted bg-surface-card">云端</div>
        <div className="px-2 py-1 font-semibold text-on-surface-muted bg-surface-card">本地</div>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-2 divide-x divide-border">
          <DiffCell line={row.left} side="left" />
          <DiffCell line={row.right} side="right" />
        </div>
      ))}
    </div>
  );
}

function DiffCell({ line, side }: { line: { type: string; text: string; spans?: CharSpan[] }; side: 'left' | 'right' }) {
  const bg =
    line.type === 'del' ? 'bg-red-500/10' :
    line.type === 'add' ? 'bg-green-500/10' :
    line.type === 'empty' ? 'bg-surface-card/50' : '';

  return (
    <div className={cn('px-2 py-0.5 whitespace-pre-wrap break-all min-h-5', bg)}>
      {line.spans
        ? line.spans.map((s, j) => (
            <span key={j} className={s.highlight ? (side === 'left' ? 'bg-red-500/25' : 'bg-green-500/25') : ''}>
              {s.text}
            </span>
          ))
        : line.text}
    </div>
  );
}
