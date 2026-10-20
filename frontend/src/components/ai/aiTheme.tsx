import type { ReactNode } from 'react';
import { ConfigProvider, Tag } from 'antd';
import type { ThemeConfig } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';

/** Neutral dark-grey palette so AI actions are visually distinct from normal (blue) actions. */
export const AI_COLOR = '#3a3a3c';

const aiThemeConfig: ThemeConfig = {
  token: { colorPrimary: AI_COLOR, colorLink: AI_COLOR, colorInfo: AI_COLOR },
};

/** Wrap AI surfaces (modals, drawers, panels) so primary buttons/inputs use the AI palette. */
export function AITheme({ children }: { children: ReactNode }) {
  return <ConfigProvider theme={aiThemeConfig}>{children}</ConfigProvider>;
}

/** Small "AI" label used on every AI entry point. */
export function AIBadge() {
  return (
    <Tag className="ai-badge" bordered={false} icon={<ThunderboltOutlined />}>
      AI
    </Tag>
  );
}

export function AITitle({ children }: { children: ReactNode }) {
  return (
    <span className="ai-title">
      <AIBadge />
      <span>{children}</span>
    </span>
  );
}
