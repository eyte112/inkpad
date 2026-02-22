import type { ContentPatch } from '@/types/share';

export type { ContentPatch };

// Performance thresholds to prevent O(m×n) blowup
const MAX_LCS_LINES = 2000;  // Skip LCS if both sides exceed this
const MAX_CHAR_DIFF_LEN = 200; // Skip char-level diff for long lines

// LCS-based line diff → compact patches
export function computePatches(oldText: string, newText: string): ContentPatch[] {
  if (oldText === newText) return [];
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const ops = lcsOps(oldLines, newLines);

  const patches: ContentPatch[] = [];
  let idx = 0;
  while (idx < ops.length) {
    const op = ops[idx];
    if (op.type === 'keep') { idx++; continue; }

    const offset = op.type === 'del' ? op.oldIdx! : (idx > 0 ? (ops[idx - 1].oldIdx ?? 0) + 1 : 0);
    let deleteCount = 0;
    const insertLines: string[] = [];

    while (idx < ops.length && ops[idx].type !== 'keep') {
      if (ops[idx].type === 'del') deleteCount++;
      if (ops[idx].type === 'add') insertLines.push(newLines[ops[idx].newIdx!]);
      idx++;
    }

    patches.push({ offset, deleteCount, insert: insertLines.join('\n') });
  }
  return patches;
}

// LCS-based edit script (shared by lineDiff and sideBySideDiff)
function lcsOps(oldLines: string[], newLines: string[]) {
  const m = oldLines.length, n = newLines.length;

  // Guard: skip O(m×n) LCS for very large texts
  if (m > MAX_LCS_LINES && n > MAX_LCS_LINES) {
    const ops: { type: 'keep' | 'del' | 'add'; oldIdx?: number; newIdx?: number }[] = [];
    for (let i = 0; i < m; i++) ops.push({ type: 'del', oldIdx: i });
    for (let j = 0; j < n; j++) ops.push({ type: 'add', newIdx: j });
    return ops;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const ops: { type: 'keep' | 'del' | 'add'; oldIdx?: number; newIdx?: number }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({ type: 'keep', oldIdx: i - 1, newIdx: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'add', newIdx: j - 1 });
      j--;
    } else {
      ops.push({ type: 'del', oldIdx: i - 1 });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

// LCS-based line diff for display
export function lineDiff(oldText: string, newText: string) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const ops = lcsOps(oldLines, newLines);
  const result: { type: 'same' | 'add' | 'del'; text: string }[] = [];
  for (const op of ops) {
    if (op.type === 'keep') result.push({ type: 'same', text: oldLines[op.oldIdx!] });
    else if (op.type === 'del') result.push({ type: 'del', text: oldLines[op.oldIdx!] });
    else result.push({ type: 'add', text: newLines[op.newIdx!] });
  }
  return result;
}

// Side-by-side diff for split view
export interface CharSpan { text: string; highlight: boolean }
export interface SideBySideLine {
  type: 'same' | 'add' | 'del' | 'empty';
  text: string;
  spans?: CharSpan[];
}

// Character-level LCS diff between two strings
function charDiff(oldStr: string, newStr: string): { oldSpans: CharSpan[]; newSpans: CharSpan[] } {
  const a = [...oldStr], b = [...newStr];
  const m = a.length, n = b.length;

  if (m > MAX_CHAR_DIFF_LEN || n > MAX_CHAR_DIFF_LEN) {
    return {
      oldSpans: oldStr ? [{ text: oldStr, highlight: true }] : [],
      newSpans: newStr ? [{ text: newStr, highlight: true }] : [],
    };
  }

  const dp = new Uint32Array((m + 1) * (n + 1));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i * (n + 1) + j] = a[i - 1] === b[j - 1]
        ? dp[(i - 1) * (n + 1) + (j - 1)] + 1
        : Math.max(dp[(i - 1) * (n + 1) + j], dp[i * (n + 1) + (j - 1)]);

  const oldSpans: CharSpan[] = [];
  const newSpans: CharSpan[] = [];
  let i = m, j = n;
  const ops: ('keep' | 'del' | 'add')[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { ops.push('keep'); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i * (n + 1) + (j - 1)] >= dp[(i - 1) * (n + 1) + j])) { ops.push('add'); j--; }
    else { ops.push('del'); i--; }
  }
  ops.reverse();

  let oi = 0, ni = 0;
  for (const op of ops) {
    if (op === 'keep') { oldSpans.push({ text: a[oi++], highlight: false }); newSpans.push({ text: b[ni++], highlight: false }); }
    else if (op === 'del') { oldSpans.push({ text: a[oi++], highlight: true }); }
    else { newSpans.push({ text: b[ni++], highlight: true }); }
  }
  return { oldSpans, newSpans };
}

function mergeSpans(spans: CharSpan[]): CharSpan[] {
  const result: CharSpan[] = [];
  for (const s of spans) {
    if (result.length && result[result.length - 1].highlight === s.highlight)
      result[result.length - 1] = { text: result[result.length - 1].text + s.text, highlight: s.highlight };
    else result.push({ ...s });
  }
  return result;
}

export function sideBySideDiff(oldText: string, newText: string): { left: SideBySideLine; right: SideBySideLine }[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const ops = lcsOps(oldLines, newLines);
  const rows: { left: SideBySideLine; right: SideBySideLine }[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.type === 'keep') {
      rows.push({ left: { type: 'same', text: oldLines[op.oldIdx!] }, right: { type: 'same', text: oldLines[op.oldIdx!] } });
      i++;
    } else {
      const dels: string[] = [];
      const adds: string[] = [];
      while (i < ops.length && ops[i].type !== 'keep') {
        if (ops[i].type === 'del') dels.push(oldLines[ops[i].oldIdx!]);
        else adds.push(newLines[ops[i].newIdx!]);
        i++;
      }
      const max = Math.max(dels.length, adds.length);
      for (let k = 0; k < max; k++) {
        if (k < dels.length && k < adds.length) {
          const { oldSpans, newSpans } = charDiff(dels[k], adds[k]);
          rows.push({
            left: { type: 'del', text: dels[k], spans: mergeSpans(oldSpans) },
            right: { type: 'add', text: adds[k], spans: mergeSpans(newSpans) },
          });
        } else {
          rows.push({
            left: k < dels.length ? { type: 'del', text: dels[k] } : { type: 'empty', text: '' },
            right: k < adds.length ? { type: 'add', text: adds[k] } : { type: 'empty', text: '' },
          });
        }
      }
    }
  }
  return rows;
}

// Apply patches to reconstruct new content
export function applyPatches(oldText: string, patches: ContentPatch[]): string {
  if (!patches.length) return oldText;
  const lines = oldText.split('\n');
  const sorted = [...patches].sort((a, b) => b.offset - a.offset);
  for (const p of sorted) {
    const insertLines = p.insert ? p.insert.split('\n') : [];
    lines.splice(p.offset, p.deleteCount, ...insertLines);
  }
  return lines.join('\n');
}
