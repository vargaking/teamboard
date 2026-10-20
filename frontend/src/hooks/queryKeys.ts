export const queryKeys = {
  boards: ['boards'] as const,
  board: (boardId: number) => ['board', boardId] as const,
  users: ['users'] as const,
  comments: (cardId: number) => ['comments', cardId] as const,
};
