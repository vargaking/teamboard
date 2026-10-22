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
import type { ReviewCount } from '../../utils/board';
import { EditableText } from './EditableText';
import { LabelsModal } from './LabelsModal';
import { MembersModal } from './MembersModal';

/** People filter value: 'all' | 'me' | 'none' (nobody in that role) | user id. */
export type PersonFilter = 'all' | 'me' | 'none' | number;

type Props = {
  board: BoardDetail;
  liveStatus: LiveStatus;
  assigneeFilter: PersonFilter;
  onAssigneeFilterChange: (value: PersonFilter) => void;
  reviewerFilter: PersonFilter;
  onReviewerFilterChange: (value: PersonFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  /** Per-member review counts, shown in the member avatar tooltips. */
  reviewCounts: ReviewCount[];
};

type PersonFilterSelectProps = {
  board: BoardDetail;
  currentUserId: number;
  value: PersonFilter;
  onChange: (value: PersonFilter) => void;
  allLabel: string;
  meLabel: string;
  noneLabel: string;
  ariaLabel: string;
};

function PersonFilterSelect({
  board,
  currentUserId,
  value,
  onChange,
  allLabel,
  meLabel,
  noneLabel,
  ariaLabel,
}: PersonFilterSelectProps) {
  return (
    <Select<PersonFilter>
      aria-label={ariaLabel}
      style={{ width: 200 }}
      value={value}
      onChange={onChange}
      showSearch
      optionFilterProp="label"
      options={[
        { value: 'all', label: allLabel },
        { value: 'me', label: meLabel },
        { value: 'none', label: noneLabel },
        ...board.members.filter((m) => m.id !== currentUserId).map((m) => ({ value: m.id, label: m.name })),
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
  );
}

export function BoardHeader({
  board,
  liveStatus,
  assigneeFilter,
  onAssigneeFilterChange,
  reviewerFilter,
  onReviewerFilterChange,
  search,
  onSearchChange,
  reviewCounts,
}: Props) {
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
          <UserAvatarGroup
            users={board.members}
            size="default"
            max={6}
            tooltipFor={(u) => {
              const c = reviewCounts.find((r) => r.user.id === u.id);
              return c && (c.inProgress > 0 || c.done > 0)
                ? `${u.name} · reviewing ${c.inProgress} · ${c.done} reviewed`
                : u.name;
            }}
          />
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
        <PersonFilterSelect
          board={board}
          currentUserId={user.id}
          value={assigneeFilter}
          onChange={onAssigneeFilterChange}
          ariaLabel="Filter by assignee"
          allLabel="Any assignee"
          meLabel="Assigned to me"
          noneLabel="Unassigned"
        />
        <PersonFilterSelect
          board={board}
          currentUserId={user.id}
          value={reviewerFilter}
          onChange={onReviewerFilterChange}
          ariaLabel="Filter by reviewer"
          allLabel="Any reviewer"
          meLabel="Reviewed by me"
          noneLabel="No reviewer"
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
