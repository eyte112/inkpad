import { create } from 'zustand';

type ViewMode = 'card' | 'list';

interface NoteListState {
  // 视图模式
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // 选中状态
  selectedIds: Set<string>;
  isSelectMode: boolean;
  toggleSelectMode: () => void;
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;

  // 重命名状态
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
}

export const useNoteListStore = create<NoteListState>((set, get) => ({
  // 视图模式
  viewMode: 'card',
  setViewMode: (mode) => set({ viewMode: mode }),

  // 选中状态
  selectedIds: new Set(),
  isSelectMode: false,
  toggleSelectMode: () => {
    const { isSelectMode } = get();
    set({
      isSelectMode: !isSelectMode,
      selectedIds: new Set()
    });
  },
  toggleSelect: (id) => {
    const { selectedIds } = get();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    set({ selectedIds: newSet });
  },
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),

  // 重命名状态
  renamingId: null,
  setRenamingId: (id) => set({ renamingId: id }),
}));
