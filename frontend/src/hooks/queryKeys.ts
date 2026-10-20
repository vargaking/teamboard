export const queryKeys = {
  boards: ['boards'] as const,
  board: (boardId: number) => ['board', boardId] as const,
  users: ['users'] as const,
  comments: (cardId: number) => ['comments', cardId] as const,
  mcpInfo: ['mcp-info'] as const,
  tokens: ['tokens'] as const,
  consent: (req: string) => ['oauth-consent', req] as const,
  invites: ['invites'] as const,
  inviteInfo: (token: string) => ['invite-info', token] as const,
};
