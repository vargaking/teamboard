import { Empty } from 'antd';
import type { Column } from '../../api/types';
import { personalCardGroups, type BoardViewMode } from '../../utils/board';
import { formatDueDate } from '../../utils/dates';

type Props = {
  columns: Column[];
  view: Exclude<BoardViewMode, 'board'>;
  currentUserId: number;
  search: string;
  onOpenCard: (cardId: number) => void;
};

const EMPTY_MESSAGES = {
  'my-work': 'No active cards assigned to you.',
  'my-reviews': 'No cards waiting for your review.',
};

export function PersonalBoardView({ columns, view, currentUserId, search, onOpenCard }: Props) {
  const groups = personalCardGroups(columns, view, currentUserId, search);

  return (
    <div className="personal-board" aria-label={view === 'my-work' ? 'My work' : 'My reviews'} role="region">
      {groups.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={search.trim() ? 'No cards match your search.' : EMPTY_MESSAGES[view]}
        />
      )}
      {groups.map(({ id, title, cards }) => (
        <section key={id} className="personal-board-group">
          <h2>{title}</h2>
          <ul>
            {cards.map((card) => (
              <li key={card.id}>
                <button type="button" className="personal-board-card" onClick={() => onOpenCard(card.id)}>
                  <span>{card.title}</span>
                  {card.due_date && <time dateTime={card.due_date}>Due {formatDueDate(card.due_date)}</time>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
