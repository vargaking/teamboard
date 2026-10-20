import { Select, Space } from 'antd';
import type { User } from '../../api/types';
import { UserAvatar } from '../UserAvatar';

type Props = {
  members: User[];
  value: number[];
  onChange: (ids: number[]) => void;
  placeholder: string;
  ariaLabel: string;
};

/** Multi-select over board members with avatar options (used for assignees and reviewers). */
export function MemberSelect({ members, value, onChange, placeholder, ariaLabel }: Props) {
  return (
    <Select<number[]>
      mode="multiple"
      aria-label={ariaLabel}
      style={{ width: '100%' }}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      optionFilterProp="label"
      options={members.map((m) => ({ value: m.id, label: m.name, user: m }))}
      optionRender={(option) => (
        <Space>
          <UserAvatar user={option.data.user} size="small" tooltip={false} />
          {option.data.user.name}
        </Space>
      )}
      maxTagCount="responsive"
    />
  );
}
