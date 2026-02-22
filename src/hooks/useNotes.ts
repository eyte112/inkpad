import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '@/services/notes';
import type { CreateNoteInput, UpdateNoteInput } from '@/types/note';

// 获取笔记列表
export function useNotes(params?: { search?: string }) {
  return useQuery({
    queryKey: ['notes', params],
    queryFn: () => notesApi.list(params),
  });
}

// 获取单篇笔记
export function useNote(id: string) {
  return useQuery({
    queryKey: ['note', id],
    queryFn: () => notesApi.get(id),
    enabled: !!id,
  });
}

// 创建笔记
export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateNoteInput) => notesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

// 更新笔记
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateNoteInput) => notesApi.update(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['note', variables.id] });
    },
  });
}

// 删除笔记
export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}
