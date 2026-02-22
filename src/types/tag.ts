// 标签类型定义
export interface Tag {
  id: string;
  name: string;
  color: string;
  groupId: string | null;
  noteCount: number;
  createdAt: string;
}

export interface TagGroup {
  id: string;
  name: string;
  color?: string;
  children: (Tag | TagGroup)[];
  noteCount: number;
}

export interface CreateTagInput {
  name: string;
  color: string;
  groupId?: string;
}

export interface UpdateTagInput {
  id: string;
  name?: string;
  color?: string;
  groupId?: string;
}

export interface MoveTagInput {
  tagId: string;
  targetGroupId: string | null;
}

export interface MergeTagsInput {
  sourceId: string; // 被合并的标签
  targetId: string; // 合并到的目标标签
}

export interface CreateTagGroupInput {
  name: string;
  color?: string;
}
