import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Input, Select, Space, Typography } from 'antd';
import { DeleteOutlined, MoreOutlined, SearchOutlined, TagsOutlined, TeamOutlined } from '@ant-design/icons';
import type { BoardDetail } from '../../api/types';
import { getErrorMessage } from '../../api/client';
import { useCurrentUser } from '../../auth/AuthContext';
import { useDeleteBoard, useUpdateBoard } from '../../hooks/useBoards';
import type { LiveStatus } from '../../hooks/useLiveSocket';
import { LiveIndicator } from '../LiveIndicator';
import { UserAvatar, UserAvatarGroup } from '../UserAvatar';
import { DangerMenu } from './DangerMenu';
import { EditableText } from './EditableText';
import { LabelsModal } from './LabelsModal';
import { MembersModal } from './MembersModal';

/** Assignee filter value: 'all' | 'me' | 'unassigned' | user id. */
export type AssigneeFilter = 'all' | 'me' | 'unassigned' | number;

type Props = {
  board: BoardDetail;
  liveStatus: LiveStatus;
  assigneeFilter: AssigneeFilter;
  onAssigneeFilterChange: (value: AssigneeFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
};

export function BoardHeader({ board, liveStatus, assigneeFilter, onAssigneeFilterChange, search, onSearchChange }: Props) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const updateBoard = useUpdateBoard(board.id);
  const deleteBoard = useDeleteBoard();
  const [membersOpen, setMembersOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);

  const canDelete = board.owner_id === user.id || user.is_admin;

  const saveField = (field: 'title' | 'description', value: string) =>
    updateBoard.mutate(
      { [field]: value },
      { onError: (err) => void message.error(getErrorMessage(err, 'Could not update board')) },
    );

  return (
    <div className="board-header">
      <div className="board-header-top">
        <div className="board-header-titles">
          <Space align="center" size={12} wrap>
            <Typography.Title level={4} style={{ margin: 0 }}>
              <EditableText
                value={board.title}
                onSave={(v) => saveField('title', v)}
                inputClassName="board-title-input"
                maxLength={200}
              />
            </Typography.Title>
            <LiveIndicator status={liveStatus} />
          </Space>
          <Typography.Text type="secondary" className="board-description">
            <EditableText
              value={board.description}
              onSave={(v) => saveField('description', v)}
              placeholder="Add a description"
              allowEmpty
              maxLength={1000}
              size="small"
            />
          </Typography.Text>
        </div>
        <Space size={8} wrap>
          <UserAvatarGroup users={board.members} size="default" max={6} />
          <Button icon={<TeamOutlined />} onClick={() => setMembersOpen(true)}>
            Members
          </Button>
          <Button icon={<TagsOutlined />} onClick={() => setLabelsOpen(true)}>
            Labels
          </Button>
          {canDelete && (
            <DangerMenu
              ariaLabel="Board menu"
              trigger={<Button icon={<MoreOutlined />} aria-label="Board menu" />}
              actions={[
                {
                  key: 'delete',
                  label: 'Delete board',
                  icon: <DeleteOutlined />,
                  confirmTitle: `Delete board "${board.title}"?`,
                  confirmDescription: 'All columns, cards and comments will be deleted.',
                  onConfirm: () =>
                    deleteBoard
                      .mutateAsync(board.id)
                      .then(() => {
                        void message.success('Board deleted');
                        navigate('/', { replace: true });
                      })
                      .catch((err: unknown) => {
                        void message.error(getErrorMessage(err, 'Could not delete board'));
                      }),
                },
              ]}
            />
          )}
        </Space>
      </div>
      <div className="board-filters">
        <Select<AssigneeFilter>
          style={{ width: 220 }}
          value={assigneeFilter}
          onChange={onAssigneeFilterChange}
          showSearch
          optionFilterProp="label"
          options={[
            { value: 'all', label: 'All cards' },
            { value: 'me', label: 'Assigned to me' },
            { value: 'unassigned', label: 'Unassigned' },
            ...board.members
              .filter((m) => m.id !== user.id)
              .map((m) => ({ value: m.id, label: m.name })),
          ]}
          optionRender={(option) => {
            const member = typeof option.value === 'number' ? board.members.find((m) => m.id === option.value) : undefined;
            return member ? (
              <Space>
                <UserAvatar user={member} size="small" tooltip={false} />
                {member.name}
              </Space>
            ) : (
              option.label
            );
          }}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search cards"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ width: 240 }}
        />
      </div>
      <MembersModal board={board} open={membersOpen} onClose={() => setMembersOpen(false)} />
      <LabelsModal board={board} open={labelsOpen} onClose={() => setLabelsOpen(false)} />
    </div>
  );
}
