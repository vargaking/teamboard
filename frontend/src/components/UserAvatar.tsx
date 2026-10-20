import { Avatar, Tooltip } from 'antd';
import type { AvatarProps } from 'antd';
import type { User } from '../api/types';

type Props = {
  user: Pick<User, 'name' | 'initials' | 'color'>;
  size?: AvatarProps['size'];
  tooltip?: boolean;
};

export function UserAvatar({ user, size = 'default', tooltip = true }: Props) {
  const avatar = (
    <Avatar size={size} style={{ backgroundColor: user.color, color: '#fff', fontWeight: 600, flexShrink: 0 }}>
      {user.initials}
    </Avatar>
  );
  return tooltip ? <Tooltip title={user.name}>{avatar}</Tooltip> : avatar;
}

type GroupProps = {
  users: Array<Pick<User, 'id' | 'name' | 'initials' | 'color'>>;
  size?: AvatarProps['size'];
  max?: number;
  /** per-avatar name tooltips (default true) */
  tooltips?: boolean;
};

export function UserAvatarGroup({ users, size = 'small', max = 4, tooltips = true }: GroupProps) {
  return (
    <Avatar.Group size={size} max={{ count: max, style: { backgroundColor: 'var(--badge-bg)', color: 'var(--badge-text)' } }}>
      {users.map((u) => (
        <UserAvatar key={u.id} user={u} size={size} tooltip={tooltips} />
      ))}
    </Avatar.Group>
  );
}
