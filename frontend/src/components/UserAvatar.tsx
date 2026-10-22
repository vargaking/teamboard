import { Avatar, Tooltip } from 'antd';
import type { AvatarProps } from 'antd';
import type { ReactNode } from 'react';
import type { User } from '../api/types';

type Props = {
  user: Pick<User, 'name' | 'initials' | 'color'>;
  size?: AvatarProps['size'];
  tooltip?: boolean;
  /** Custom tooltip content (defaults to the user's name). */
  tooltipTitle?: ReactNode;
};

export function UserAvatar({ user, size = 'default', tooltip = true, tooltipTitle }: Props) {
  const avatar = (
    <Avatar size={size} style={{ backgroundColor: user.color, color: '#fff', fontWeight: 600, flexShrink: 0 }}>
      {user.initials}
    </Avatar>
  );
  return tooltip ? <Tooltip title={tooltipTitle ?? user.name}>{avatar}</Tooltip> : avatar;
}

type GroupProps = {
  users: Array<Pick<User, 'id' | 'name' | 'initials' | 'color'>>;
  size?: AvatarProps['size'];
  max?: number;
  /** per-avatar name tooltips (default true) */
  tooltips?: boolean;
  /** Custom per-user tooltip content. */
  tooltipFor?: (user: Pick<User, 'id' | 'name'>) => ReactNode;
};

export function UserAvatarGroup({ users, size = 'small', max = 4, tooltips = true, tooltipFor }: GroupProps) {
  return (
    <Avatar.Group size={size} max={{ count: max, style: { backgroundColor: 'var(--badge-bg)', color: 'var(--badge-text)' } }}>
      {users.map((u) => (
        <UserAvatar key={u.id} user={u} size={size} tooltip={tooltips} tooltipTitle={tooltipFor?.(u)} />
      ))}
    </Avatar.Group>
  );
}
