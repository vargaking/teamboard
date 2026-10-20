import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import { AxiosError } from 'axios';
import { App, Button, Result, Space, Spin } from 'antd';
import { getErrorMessage } from '../api/client';
import type { BoardDetail, Card, User } from '../api/types';
import { useCurrentUser } from '../auth/AuthContext';
import { BoardColumn } from '../components/board/BoardColumn';
import { BoardHeader, type PersonFilter } from '../components/board/BoardHeader';
import { CardModal } from '../components/board/CardModal';
import { InlineAddInput } from '../components/board/InlineAddInput';
import { COLUMN_DROPPABLE_ID, DND_TYPE_COLUMN, useBoardDnd } from '../hooks/useBoardDnd';
import { useBoard, useCreateColumn } from '../hooks/useBoards';
import { useBoardSocket } from '../hooks/useBoardSocket';
import { findCard } from '../utils/board';

function matchesPerson(people: User[], filter: PersonFilter, currentUserId: number): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return people.length === 0;
  const userId = filter === 'me' ? currentUserId : filter;
  return people.some((p) => p.id === userId);
}

/** All active filters are combined with AND. */
function useCardFilter(
  assigneeFilter: PersonFilter,
  reviewerFilter: PersonFilter,
  search: string,
  currentUserId: number,
) {
  const needle = search.trim().toLowerCase();
  const active = assigneeFilter !== 'all' || reviewerFilter !== 'all' || needle !== '';
  const predicate = useCallback(
    (card: Card): boolean =>
      (!needle || card.title.toLowerCase().includes(needle)) &&
      matchesPerson(card.assignees, assigneeFilter, currentUserId) &&
      matchesPerson(card.reviewers, reviewerFilter, currentUserId),
    [assigneeFilter, reviewerFilter, needle, currentUserId],
  );
  return { active, predicate };
}

function BoardView({ board }: { board: BoardDetail }) {
  const user = useCurrentUser();
  const { message } = App.useApp();
  const liveStatus = useBoardSocket(board.id);
  const createColumn = useCreateColumn(board.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [assigneeFilter, setAssigneeFilter] = useState<PersonFilter>('all');
  const [reviewerFilter, setReviewerFilter] = useState<PersonFilter>('all');
  const [search, setSearch] = useState('');

  const { active: filterActive, predicate } = useCardFilter(assigneeFilter, reviewerFilter, search, user.id);

  const visibleByColumn = useMemo(() => {
    const map = new Map<number, Card[]>();
    for (const column of board.columns) {
      map.set(column.id, filterActive ? column.cards.filter(predicate) : column.cards);
    }
    return map;
  }, [board.columns, filterActive, predicate]);

  const visibleIds = useMemo(
    () =>
      filterActive ? (columnId: number) => (visibleByColumn.get(columnId) ?? []).map((c) => c.id) : null,
    [filterActive, visibleByColumn],
  );
  const onDragEnd = useBoardDnd(board.id, visibleIds);

  // Open card is kept in the URL (?card=123) so it can be linked and survives reloads.
  const openCardParam = searchParams.get('card');
  const openCardId = openCardParam !== null ? Number(openCardParam) : null;
  const openCard = openCardId !== null && Number.isInteger(openCardId) ? findCard(board, openCardId) : null;

  const openCardModal = useCallback(
    (cardId: number) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('card', String(cardId));
          return next;
        },
        { replace: false },
      ),
    [setSearchParams],
  );
  const closeCardModal = useCallback(
    () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('card');
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return (
    <div className="board-page">
      <BoardHeader
        board={board}
        liveStatus={liveStatus}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        reviewerFilter={reviewerFilter}
        onReviewerFilterChange={setReviewerFilter}
        search={search}
        onSearchChange={setSearch}
      />
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={COLUMN_DROPPABLE_ID} direction="horizontal" type={DND_TYPE_COLUMN}>
          {(provided) => (
            <div className="board-canvas" ref={provided.innerRef} {...provided.droppableProps}>
              {board.columns.map((column, index) => (
                <BoardColumn
                  key={column.id}
                  boardId={board.id}
                  column={column}
                  visibleCards={visibleByColumn.get(column.id) ?? column.cards}
                  filtered={filterActive}
                  index={index}
                  onOpenCard={openCardModal}
                />
              ))}
              {provided.placeholder}
              <div className="add-column">
                <InlineAddInput
                  buttonLabel="Add column"
                  placeholder="Column title"
                  submitLabel="Add column"
                  loading={createColumn.isPending}
                  onSubmit={(title) =>
                    createColumn.mutateAsync(title).catch((err: unknown) => {
                      void message.error(getErrorMessage(err, 'Could not add column'));
                      throw err;
                    })
                  }
                />
              </div>
            </div>
          )}
        </Droppable>
      </DragDropContext>
      {openCard && (
        <CardModal
          key={openCard.card.id}
          board={board}
          card={openCard.card}
          column={openCard.column}
          onClose={closeCardModal}
        />
      )}
    </div>
  );
}

export function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const boardId = Number(id);
  const board = useBoard(boardId);

  if (!Number.isInteger(boardId) || boardId <= 0) {
    return (
      <Result
        status="404"
        title="Board not found"
        extra={<Button onClick={() => navigate('/')}>Back to boards</Button>}
      />
    );
  }

  if (board.isPending) {
    return (
      <div className="center-block">
        <Spin size="large" />
      </div>
    );
  }

  if (board.isError) {
    const status = board.error instanceof AxiosError ? board.error.response?.status : undefined;
    if (status === 403 || status === 404) {
      return (
        <Result
          status={status === 403 ? '403' : '404'}
          title={status === 403 ? 'No access' : 'Board not found'}
          subTitle={
            status === 403
              ? 'You are not a member of this board. Ask its owner to add you.'
              : 'This board does not exist or was deleted.'
          }
          extra={
            <Button type="primary" onClick={() => navigate('/')}>
              Back to boards
            </Button>
          }
        />
      );
    }
    return (
      <Result
        status="error"
        title="Could not load board"
        subTitle={getErrorMessage(board.error)}
        extra={
          <Space>
            <Button onClick={() => navigate('/')}>Back to boards</Button>
            <Button type="primary" onClick={() => void board.refetch()}>
              Retry
            </Button>
          </Space>
        }
      />
    );
  }

  return <BoardView board={board.data} />;
}
