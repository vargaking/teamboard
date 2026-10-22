import { memo, useRef } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { App, Badge } from 'antd';
import type { MenuProps } from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import type { Card, Column } from '../../api/types';
import { getErrorMessage } from '../../api/client';
import { DND_TYPE_CARD } from '../../hooks/useBoardDnd';
import { useBoardMoves } from '../../hooks/useBoardMoves';
import { useDeleteColumn, useUpdateColumn } from '../../hooks/useBoards';
import { useCreateCard } from '../../hooks/useCards';
import { ContextMenu } from '../ContextMenu';
import { useBoardView } from './BoardViewContext';
import { CardTile } from './CardTile';
import { DangerMenu } from './DangerMenu';
import { EditableText, type EditableTextHandle } from './EditableText';
import { InlineAddInput, type InlineAddInputHandle } from './InlineAddInput';

type Props = {
  boardId: number;
  column: Column;
  /** cards to render (may be filtered) */
  visibleCards: Card[];
  index: number;
  filtered: boolean;
  /** "Done" column per doneColumnIds(): no overdue highlighting, counts as reviewed. */
  inDone: boolean;
  onOpenCard: (cardId: number) => void;
};

type SortMode = 'due' | 'title';

const byTitle = (a: Card, b: Card) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
/** Earliest due date first; cards without a due date last (stable sort keeps their order). */
const byDue = (a: Card, b: Card) => {
  if (a.due_date === b.due_date) return 0;
  if (a.due_date === null) return 1;
  if (b.due_date === null) return -1;
  return a.due_date < b.due_date ? -1 : 1;
};

/** Minimal sequence of single-card moves that turns `cards` into `sorted`. */
export function planSortMoves(cards: Card[], sorted: Card[]): { cardId: number; position: number }[] {
  let current = cards.map((c) => c.id);
  const moves: { cardId: number; position: number }[] = [];
  sorted.forEach((card, position) => {
    if (current[position] === card.id) return;
    moves.push({ cardId: card.id, position });
    current = current.filter((id) => id !== card.id);
    current.splice(position, 0, card.id);
  });
  return moves;
}

function BoardColumnInner({ boardId, column, visibleCards, index, filtered, inDone, onOpenCard }: Props) {
  const { message, modal } = App.useApp();
  const view = useBoardView();
  const updateColumn = useUpdateColumn(boardId);
  const deleteColumn = useDeleteColumn(boardId);
  const createCard = useCreateCard(boardId);
  const { moveCardTo, moveColumn } = useBoardMoves(boardId);
  const titleRef = useRef<EditableTextHandle>(null);
  const addCardRef = useRef<InlineAddInputHandle>(null);

  const cardCount = column.cards.length;
  const deleteDescription =
    cardCount > 0 ? `Its ${cardCount} card${cardCount === 1 ? '' : 's'} will be deleted too.` : 'This cannot be undone.';

  const doDelete = () =>
    deleteColumn.mutateAsync(column.id).catch((err: unknown) => {
      void message.error(getErrorMessage(err, 'Could not delete column'));
    });

  const sortCards = (mode: SortMode) => {
    const fresh = view.getBoard()?.columns.find((c) => c.id === column.id) ?? column;
    const sorted = [...fresh.cards].sort(mode === 'due' ? byDue : byTitle);
    const moves = planSortMoves(fresh.cards, sorted);
    if (moves.length === 0) {
      void message.info('Already sorted');
      return;
    }
    modal.confirm({
      title: `Sort "${fresh.title}" by ${mode === 'due' ? 'due date' : 'title'}?`,
      content: `This moves ${moves.length} card${moves.length === 1 ? '' : 's'} (one request per card). Teammates will see the new order.`,
      okText: 'Sort',
      onOk: async () => {
        for (const m of moves) {
          const res = await moveCardTo(m.cardId, column.id, m.position);
          if (!res) return; // moveCardTo already reported the error and refetched
        }
        void message.success('Column sorted');
      },
    });
  };

  const buildItems = (): MenuProps['items'] => {
    const board = view.getBoard();
    const columnIndex = board?.columns.findIndex((c) => c.id === column.id) ?? index;
    const total = board?.columns.length ?? 0;
    return [
      { key: 'rename', icon: <EditOutlined />, label: 'Rename' },
      { key: 'add', icon: <PlusOutlined />, label: 'Add card' },
      { type: 'divider' },
      { key: 'left', icon: <ArrowLeftOutlined />, label: 'Move left', disabled: columnIndex <= 0 },
      { key: 'right', icon: <ArrowRightOutlined />, label: 'Move right', disabled: columnIndex >= total - 1 },
      { type: 'divider' },
      { key: 'sort-due', icon: <CalendarOutlined />, label: 'Sort cards by due date', disabled: cardCount < 2 },
      { key: 'sort-title', icon: <SortAscendingOutlined />, label: 'Sort cards by title', disabled: cardCount < 2 },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: 'Delete column', danger: true },
    ];
  };

  const onSelect = (key: string) => {
    const board = view.getBoard();
    const columnIndex = board?.columns.findIndex((c) => c.id === column.id) ?? index;
    switch (key) {
      case 'rename':
        titleRef.current?.startEditing();
        return;
      case 'add':
        addCardRef.current?.open();
        return;
      case 'left':
        void moveColumn(columnIndex, columnIndex - 1);
        return;
      case 'right':
        void moveColumn(columnIndex, columnIndex + 1);
        return;
      case 'sort-due':
        sortCards('due');
        return;
      case 'sort-title':
        sortCards('title');
        return;
      case 'delete':
        modal.confirm({
          title: `Delete column "${column.title}"?`,
          content: deleteDescription,
          okText: 'Delete',
          okButtonProps: { danger: true },
          onOk: doDelete,
        });
        return;
    }
  };

  return (
    <Draggable draggableId={`column-${column.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`board-column${snapshot.isDragging ? ' is-dragging' : ''}`}
          data-column-id={column.id}
        >
          <ContextMenu buildItems={buildItems} onSelect={onSelect} className="board-column-inner">
            <div className="column-header" {...provided.dragHandleProps}>
              <EditableText
                ref={titleRef}
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
                className="column-count"
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
                    onConfirm: doDelete,
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
                ref={addCardRef}
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
          </ContextMenu>
        </div>
      )}
    </Draggable>
  );
}

export const BoardColumn = memo(BoardColumnInner);
