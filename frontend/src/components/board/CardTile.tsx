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
  EyeOutlined,
  ExportOutlined,
  LinkOutlined,
  MessageOutlined,
  SwapOutlined,
  TagsOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { Card, User } from '../../api/types';
import { useCardActions, type DuePreset } from '../../hooks/useCardActions';
import { findCard } from '../../utils/board';
import { formatDueDate, getDueStatus } from '../../utils/dates';
import { ContextMenu, KEEP_OPEN } from '../ContextMenu';
import { LabelTag } from '../LabelTag';
import { UserAvatar, UserAvatarGroup } from '../UserAvatar';
import { useBoardView } from './BoardViewContext';

type Props = {
  card: Card;
  index: number;
  inDoneColumn: boolean;
  onOpen: (cardId: number) => void;
};

const DUE_TOOLTIP = { overdue: 'Overdue', soon: 'Due soon', normal: 'Due date' } as const;

/**
 * People for an Assignees/Reviewers submenu: the current user first ("(me)"), then the other board
 * members alphabetically. People already on the card who are no longer members stay listed (checked)
 * so they can still be removed.
 */
function peopleOptions(members: User[], current: User[], meId: number): User[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  for (const p of current) if (!byId.has(p.id)) byId.set(p.id, p);
  const all = [...byId.values()];
  const me = all.filter((u) => u.id === meId);
  const others = all.filter((u) => u.id !== meId).sort((a, b) => a.name.localeCompare(b.name));
  return [...me, ...others];
}

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
    const peopleItems = (role: 'assignee' | 'reviewer', current: User[]): MenuProps['items'] => {
      const checked = new Set(current.map((u) => u.id));
      return peopleOptions(board.members, current, actions.userId).map((u) => ({
        key: `${role}:${u.id}`,
        label: (
          <span className="menu-check-item" aria-checked={checked.has(u.id)} role="menuitemcheckbox">
            <CheckOutlined style={{ visibility: checked.has(u.id) ? 'visible' : 'hidden' }} />
            <UserAvatar user={u} size={20} tooltip={false} />
            <span>{u.id === actions.userId ? `${u.name} (me)` : u.name}</span>
          </span>
        ),
      }));
    };
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
        key: 'assignees',
        icon: <UserOutlined />,
        label: 'Assignees',
        popupClassName: 'context-menu people-submenu',
        children: peopleItems('assignee', fresh.assignees),
      },
      {
        key: 'reviewers',
        icon: <EyeOutlined />,
        label: 'Reviewers',
        popupClassName: 'context-menu people-submenu',
        children: peopleItems('reviewer', fresh.reviewers),
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
      case 'assignee':
      case 'reviewer':
        actions.togglePerson(fresh, kind, Number(arg));
        return KEEP_OPEN; // checkable, like labels
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
