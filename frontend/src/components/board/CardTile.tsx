import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Space, Tooltip, Typography } from 'antd';
import { AlignLeftOutlined, ClockCircleOutlined, EyeOutlined, MessageOutlined } from '@ant-design/icons';
import type { Card } from '../../api/types';
import { formatDueDate, getDueStatus } from '../../utils/dates';
import { LabelTag } from '../LabelTag';
import { UserAvatarGroup } from '../UserAvatar';

type Props = {
  card: Card;
  index: number;
  inDoneColumn: boolean;
  onOpen: (cardId: number) => void;
};

const DUE_TOOLTIP = { overdue: 'Overdue', soon: 'Due soon', normal: 'Due date' } as const;

function CardTileInner({ card, index, inDoneColumn, onOpen }: Props) {
  const dueStatus = card.due_date ? getDueStatus(card.due_date, inDoneColumn) : null;

  return (
    <Draggable draggableId={String(card.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`card-tile${snapshot.isDragging ? ' is-dragging' : ''}`}
          onClick={() => onOpen(card.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onOpen(card.id);
          }}
        >
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
        </div>
      )}
    </Draggable>
  );
}

export const CardTile = memo(CardTileInner);
