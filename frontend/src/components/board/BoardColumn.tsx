import { memo } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { App, Badge } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { Card, Column } from '../../api/types';
import { getErrorMessage } from '../../api/client';
import { DND_TYPE_CARD } from '../../hooks/useBoardDnd';
import { useDeleteColumn, useUpdateColumn } from '../../hooks/useBoards';
import { useCreateCard } from '../../hooks/useCards';
import { isDoneColumnTitle } from '../../utils/dates';
import { CardTile } from './CardTile';
import { DangerMenu } from './DangerMenu';
import { EditableText } from './EditableText';
import { InlineAddInput } from './InlineAddInput';

type Props = {
  boardId: number;
  column: Column;
  /** cards to render (may be filtered) */
  visibleCards: Card[];
  index: number;
  filtered: boolean;
  onOpenCard: (cardId: number) => void;
};

function BoardColumnInner({ boardId, column, visibleCards, index, filtered, onOpenCard }: Props) {
  const { message } = App.useApp();
  const updateColumn = useUpdateColumn(boardId);
  const deleteColumn = useDeleteColumn(boardId);
  const createCard = useCreateCard(boardId);
  const inDone = isDoneColumnTitle(column.title);

  const cardCount = column.cards.length;
  const deleteDescription =
    cardCount > 0 ? `Its ${cardCount} card${cardCount === 1 ? '' : 's'} will be deleted too.` : 'This cannot be undone.';

  return (
    <Draggable draggableId={`column-${column.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`board-column${snapshot.isDragging ? ' is-dragging' : ''}`}
        >
          <div className="column-header" {...provided.dragHandleProps}>
            <EditableText
              value={column.title}
              className="column-title"
              size="small"
              maxLength={100}
              onSave={(title) =>
                updateColumn.mutate(
                  { columnId: column.id, title },
                  { onError: (err) => void message.error(getErrorMessage(err, 'Could not rename column')) },
                )
              }
            />
            <Badge
              count={filtered ? `${visibleCards.length}/${column.cards.length}` : column.cards.length}
              showZero
              color="#d9d9d9"
              style={{ color: 'rgba(0,0,0,0.65)', boxShadow: 'none' }}
            />
            <DangerMenu
              ariaLabel="Column menu"
              actions={[
                {
                  key: 'delete',
                  label: 'Delete column',
                  icon: <DeleteOutlined />,
                  confirmTitle: `Delete column "${column.title}"?`,
                  confirmDescription: deleteDescription,
                  onConfirm: () =>
                    deleteColumn.mutateAsync(column.id).catch((err: unknown) => {
                      void message.error(getErrorMessage(err, 'Could not delete column'));
                    }),
                },
              ]}
            />
          </div>
          <Droppable droppableId={String(column.id)} type={DND_TYPE_CARD}>
            {(dropProvided, dropSnapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`column-cards${dropSnapshot.isDraggingOver ? ' is-over' : ''}`}
              >
                {visibleCards.map((card, cardIndex) => (
                  <CardTile key={card.id} card={card} index={cardIndex} inDoneColumn={inDone} onOpen={onOpenCard} />
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
          <div className="column-footer">
            <InlineAddInput
              buttonLabel="Add card"
              placeholder="Card title"
              submitLabel="Add card"
              loading={createCard.isPending}
              onSubmit={(title) =>
                createCard.mutateAsync({ columnId: column.id, title }).catch((err: unknown) => {
                  void message.error(getErrorMessage(err, 'Could not add card'));
                  throw err;
                })
              }
            />
          </div>
        </div>
      )}
    </Draggable>
  );
}

export const BoardColumn = memo(BoardColumnInner);
