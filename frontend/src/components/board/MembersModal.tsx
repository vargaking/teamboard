import { useEffect, useState } from 'react';
import { Alert, App, Modal, Select, Space, Typography } from 'antd';
import type { BoardDetail } from '../../api/types';
import { getErrorMessage } from '../../api/client';
import { useSetBoardMembers } from '../../hooks/useBoards';
import { useUsers } from '../../hooks/useUsers';
import { UserAvatar } from '../UserAvatar';

type Props = { board: BoardDetail; open: boolean; onClose: () => void };

export function MembersModal({ board, open, onClose }: Props) {
  const { message } = App.useApp();
  const users = useUsers();
  const setMembers = useSetBoardMembers(board.id);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    if (open) setSelected(board.members.map((m) => m.id));
  }, [open, board.members]);

  const onSave = () => {
    const ids = selected.includes(board.owner_id) ? selected : [board.owner_id, ...selected];
    setMembers.mutate(ids, {
      onSuccess: () => {
        void message.success('Members updated');
        onClose();
      },
      onError: (err) => void message.error(getErrorMessage(err, 'Could not update members')),
    });
  };

  return (
    <Modal
      title="Board members"
      open={open}
      onCancel={onClose}
      onOk={onSave}
      okText="Save"
      confirmLoading={setMembers.isPending}
      destroyOnHidden
    >
      {users.isError ? (
        <Alert type="error" showIcon message="Could not load users" description={getErrorMessage(users.error)} />
      ) : (
        <>
          <Select<number[]>
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Select members"
            loading={users.isPending}
            value={selected}
            onChange={(ids) => setSelected(ids.includes(board.owner_id) ? ids : [board.owner_id, ...ids])}
            optionFilterProp="label"
            options={(users.data ?? []).map((u) => ({
              value: u.id,
              label: u.name,
              disabled: u.id === board.owner_id,
              user: u,
            }))}
            optionRender={(option) => {
              const u = option.data.user;
              return (
                <Space>
                  <UserAvatar user={u} size="small" tooltip={false} />
                  <span>{u.name}</span>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {u.email}
                    {u.id === board.owner_id ? ' (owner)' : ''}
                  </Typography.Text>
                </Space>
              );
            }}
          />
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
            The board owner is always a member.
          </Typography.Paragraph>
        </>
      )}
    </Modal>
  );
}
