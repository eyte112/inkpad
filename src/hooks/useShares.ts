import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sharesApi } from '@/services/shares';
import type { CreateShareInput, UpdateShareInput } from '@/types/share';

// 获取分享列表
export function useShares() {
  return useQuery({
    queryKey: ['shares'],
    queryFn: () => sharesApi.list(),
  });
}

// 创建分享
export function useCreateShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateShareInput) => sharesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] });
    },
  });
}

// 删除分享
export function useDeleteShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) => sharesApi.delete(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] });
    },
  });
}

// 更新分享
export function useUpdateShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: UpdateShareInput }) =>
      sharesApi.update(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] });
    },
  });
}
