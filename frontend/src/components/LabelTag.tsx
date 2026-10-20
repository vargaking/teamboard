import { Tag } from 'antd';
import type { ReactNode } from 'react';

/** Pick black or white text for a hex background. */
export function readableTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return '#fff';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? 'rgba(0,0,0,0.85)' : '#fff';
}

type Props = {
  color: string;
  children: ReactNode;
  closable?: boolean;
  onClose?: () => void;
  small?: boolean;
};

export function LabelTag({ color, children, closable, onClose, small }: Props) {
  return (
    <Tag
      color={color}
      closable={closable}
      onClose={onClose}
      style={{
        color: readableTextColor(color),
        marginInlineEnd: 4,
        border: 'none',
        ...(small ? { fontSize: 11, lineHeight: '18px', paddingInline: 6 } : {}),
      }}
    >
      {children}
    </Tag>
  );
}
