export const queryKeys = {
  boards: ['boards'] as const,
  board: (boardId: number) => ['board', boardId] as const,
  users: ['users'] as const,
  comments: (cardId: number) => ['comments', cardId] as const,
  aiSettings: ['ai', 'settings'] as const,
  aiModels: (provider: string) => ['ai', 'models', provider] as const,
};
