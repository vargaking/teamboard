import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Space, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  AlignLeftOutlined,
  CalendarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ExportOutlined,
  LinkOutlined,
  MessageOutlined,
  SwapOutlined,
  TagsOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
} from '@ant-design/icons';
import type { Card } from '../../api/types';
import { useCardActions, type DuePreset } from '../../hooks/useCardActions';
import { findCard } from '../../utils/board';
import { formatDueDate, getDueStatus } from '../../utils/dates';
import { ContextMenu, KEEP_OPEN } from '../ContextMenu';
import { LabelTag } from '../LabelTag';
import { UserAvatarGroup } from '../UserAvatar';
import { useBoardView } from './BoardViewContext';

type Props = {
  card: Card;
  index: number;
  inDoneColumn: boolean;
  onOpen: (cardId: number) => void;
};

const DUE_TOOLTIP = { overdue: 'Overdue', soon: 'Due soon', normal: 'Due date' } as const;

const DUE_PRESETS: { key: DuePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'next_monday', label: 'Next Monday' },
  { key: 'clear', label: 'Clear' },
];

function CardTileInner({ card, index, inDoneColumn, onOpen }: Props) {
  const view = useBoardView();
  const actions = useCardActions(view.boardId);
  const dueStatus = card.due_date ? getDueStatus(card.due_date, inDoneColumn) : null;

  const buildItems = (): MenuProps['items'] => {
    const board = view.getBoard();
    if (!board) return [];
    const current = findCard(board, card.id);
    const fresh = current?.card ?? card;
    const isMember = board.members.some((m) => m.id === actions.userId);
    const assigned = fresh.assignees.some((a) => a.id === actions.userId);
    const reviewing = fresh.reviewers.some((r) => r.id === actions.userId);
    const labelIds = new Set(fresh.labels.map((l) => l.id));
    const otherColumns = board.columns.filter((c) => c.id !== current?.column.id);

    return [
      { key: 'open', icon: <ExportOutlined />, label: 'Open' },
      {
        key: 'move',
        icon: <SwapOutlined />,
        label: 'Move to',
        disabled: otherColumns.length === 0,
        children: otherColumns.map((c) => ({ key: `move:${c.id}`, label: c.title })),
      },
      { type: 'divider' },
      {
        key: 'assign',
        icon: assigned ? <UserDeleteOutlined /> : <UserAddOutlined />,
        label: assigned ? 'Unassign me' : 'Assign to me',
        disabled: !isMember && !assigned,
      },
      {
        key: 'review',
        icon: reviewing ? <EyeInvisibleOutlined /> : <EyeOutlined />,
        label: reviewing ? 'Remove me as reviewer' : 'Set me as reviewer',
        disabled: !isMember && !reviewing,
      },
      {
        key: 'due',
        icon: <CalendarOutlined />,
        label: 'Due date',
        children: DUE_PRESETS.map((p) => ({
          key: `due:${p.key}`,
          label: p.label,
          disabled: p.key === 'clear' && !fresh.due_date,
        })),
      },
      {
        key: 'labels',
        icon: <TagsOutlined />,
        label: 'Labels',
        disabled: board.labels.length === 0,
        children: board.labels.map((l) => ({
          key: `label:${l.id}`,
          label: (
            <span className="menu-check-item" aria-checked={labelIds.has(l.id)} role="menuitemcheckbox">
              <CheckOutlined style={{ visibility: labelIds.has(l.id) ? 'visible' : 'hidden' }} />
              <LabelTag color={l.color} small>
                {l.name}
              </LabelTag>
            </span>
          ),
        })),
      },
      { type: 'divider' },
      { key: 'link', icon: <LinkOutlined />, label: 'Copy link' },
      { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true },
    ];
  };

  const onSelect = (key: string) => {
    const board = view.getBoard();
    const fresh = (board && findCard(board, card.id)?.card) ?? card;
    const [kind, arg] = key.split(':');
    switch (kind) {
      case 'open':
        view.openCard(card.id);
        return;
      case 'move':
        if (board) actions.moveToColumnEnd(board, fresh, Number(arg));
        return;
      case 'assign':
        actions.toggleMe(fresh, 'assignee');
        return;
      case 'review':
        actions.toggleMe(fresh, 'reviewer');
        return;
      case 'due':
        actions.setDue(fresh, arg as DuePreset);
        return;
      case 'label':
        actions.toggleLabel(fresh, Number(arg));
        return KEEP_OPEN; // checkable: keep the menu open for multiple toggles
      case 'link':
        void actions.copyLink(fresh);
        return;
      case 'delete':
        actions.confirmDelete(fresh);
        return;
    }
  };

  return (
    <Draggable draggableId={String(card.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`card-tile${snapshot.isDragging ? ' is-dragging' : ''}`}
          data-card-id={card.id}
          // React events bubble through portals: ignore clicks/keys from the context menu popup.
          onClick={(e) => {
            if (e.currentTarget.contains(e.target as Node)) onOpen(card.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(card.id);
          }}
        >
          <ContextMenu buildItems={buildItems} onSelect={onSelect} className="card-tile-body">
            {card.labels.length > 0 && (
              <div className="card-tile-labels">
                {card.labels.map((label) => (
                  <LabelTag key={label.id} color={label.color} small>
                    {label.name}
                  </LabelTag>
                ))}
              </div>
            )}
            <Typography.Text className="card-tile-title">{card.title}</Typography.Text>
            {(card.due_date ||
              card.comment_count > 0 ||
              card.description ||
              card.assignees.length > 0 ||
              card.reviewers.length > 0) && (
              <div className="card-tile-meta">
                <Space size={8} wrap>
                  {card.due_date && dueStatus && (
                    <Tooltip title={DUE_TOOLTIP[dueStatus]}>
                      <span className={`due-badge due-${dueStatus}`}>
                        <ClockCircleOutlined /> {formatDueDate(card.due_date)}
                      </span>
                    </Tooltip>
                  )}
                  {card.description.trim() !== '' && (
                    <Tooltip title="Has description">
                      <AlignLeftOutlined className="card-tile-icon" />
                    </Tooltip>
                  )}
                  {card.comment_count > 0 && (
                    <Tooltip title={`${card.comment_count} comment${card.comment_count === 1 ? '' : 's'}`}>
                      <span className="card-tile-icon">
                        <MessageOutlined /> {card.comment_count}
                      </span>
                    </Tooltip>
                  )}
                  {card.reviewers.length > 0 && (
                    <Tooltip title={`Reviewers: ${card.reviewers.map((r) => r.name).join(', ')}`}>
                      <span className="card-tile-reviewers">
                        <EyeOutlined className="card-tile-icon" />
                        <UserAvatarGroup users={card.reviewers} size={20} max={2} tooltips={false} />
                      </span>
                    </Tooltip>
                  )}
                </Space>
                {card.assignees.length > 0 && (
                  <span className="card-tile-assignees">
                    <UserAvatarGroup users={card.assignees} size={24} max={3} />
                  </span>
                )}
              </div>
            )}
          </ContextMenu>
        </div>
      )}
    </Draggable>
  );
}

export const CardTile = memo(CardTileInner);
