import { json, error } from './types.ts';
import { saveHistory } from './history.ts';
import { updateIndex } from './note-index.ts';

// @ts-ignore
declare const KV: any;

export async function handleSuggestionDetail(request: Request, id: string): Promise<Response> {
  try {
    const suggestion = await KV.get(`suggestion:${id}`, { type: 'json' });
    if (!suggestion) return error(404, '建议不存在');
    return json(suggestion);
  } catch (err) {
    console.error('Get suggestion error:', err);
    return error(500, '获取建议详情失败');
  }
}

export async function handleSuggestionReview(request: Request, id: string): Promise<Response> {
  try {
    const { action } = await request.json();
    if (action !== 'approve' && action !== 'reject') return error(400, '无效的操作');

    const suggestion = await KV.get(`suggestion:${id}`, { type: 'json' });
    if (!suggestion) return error(404, '建议不存在');
    if (suggestion.status !== 'pending') return error(400, '该建议已处理');

    const now = new Date().toISOString();

    if (action === 'approve') {
      const note = await KV.get(`note:${suggestion.noteId}`, { type: 'json' });
      if (!note) return error(404, '笔记不存在');

      await saveHistory(suggestion.noteId, note.version, note.title, note.content, 'merge');

      let newContent = note.content;
      if (suggestion.patches?.length) {
        const lines = newContent.split('\n');
        const sorted = [...suggestion.patches].sort((a: any, b: any) => b.offset - a.offset);
        for (const p of sorted) {
          const insertLines = p.insert ? p.insert.split('\n') : [];
          lines.splice(p.offset, p.deleteCount, ...insertLines);
        }
        newContent = lines.join('\n');
      }

      const updated = {
        ...note,
        title: suggestion.newTitle || note.title,
        content: newContent,
        version: note.version + 1,
        updatedAt: now,
      };
      await KV.put(`note:${suggestion.noteId}`, JSON.stringify(updated));
      await updateIndex(updated);
    }

    suggestion.status = action === 'approve' ? 'approved' : 'rejected';
    suggestion.reviewedAt = now;
    await KV.put(`suggestion:${id}`, JSON.stringify(suggestion));

    const sugIndex: any[] =
      (await KV.get(`suggestion:index:${suggestion.noteId}`, { type: 'json' })) || [];
    const idx = sugIndex.findIndex((s: any) => s.id === id);
    if (idx >= 0) {
      sugIndex[idx].status = suggestion.status;
      await KV.put(`suggestion:index:${suggestion.noteId}`, JSON.stringify(sugIndex));
    }

    return json({ success: true });
  } catch (err) {
    console.error('Review suggestion error:', err);
    return error(500, '审核建议失败');
  }
}
