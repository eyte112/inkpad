import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { imagesApi } from '@/services/images';

// 获取图片列表（加载更多模式）
export function useImages(params?: { search?: string; limit?: number }) {
  const limit = params?.limit || 20;

  return useInfiniteQuery({
    queryKey: ['images', params?.search, limit],
    queryFn: ({ pageParam = 1 }) =>
      imagesApi.list({ page: pageParam, limit, search: params?.search }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  });
}

// 删除图片
export function useDeleteImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ path, id }: { path: string; id?: string }) =>
      imagesApi.delete(path, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
  });
}

// 批量删除图片
export function useBatchDeleteImages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => imagesApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
  });
}
