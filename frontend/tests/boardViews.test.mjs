import test from 'node:test';
import assert from 'node:assert/strict';
import { getBoardViewMode, moveCardInBoard, personalCardGroups } from '../src/utils/board.ts';

const alice = { id: 10, name: 'Alice' };
const ben = { id: 20, name: 'Ben' };

function card(id, columnId, title, assignees, reviewers = []) {
  return { id, column_id: columnId, title, assignees, reviewers };
}

const columns = [
  { id: 1, title: 'To do', cards: [card(1, 1, 'Prepare dataset', [alice]), card(2, 1, 'Fix chart', [ben])] },
  { id: 2, title: 'Blocked', cards: [card(3, 2, 'Check permissions', [alice])] },
  { id: 3, title: ' Needs  review ', cards: [card(4, 3, 'Review dataset', [ben], [alice])] },
  { id: 4, title: 'In progress', cards: [card(5, 4, 'Run backtest', [alice], [ben]), card(6, 4, 'Add labels', [alice])] },
  { id: 5, title: 'Review', cards: [card(7, 5, 'Update docs', [alice], [ben])] },
  { id: 6, title: 'Completed', cards: [card(8, 6, 'Set up board', [alice], [ben])] },
];

function groupsFor(view, user, search = '', source = columns) {
  return personalCardGroups(source, view, user.id, search).map(({ id, cards }) => [
    id, cards.map((item) => item.id),
  ]);
}

test('board links default to the full board and accept the two personal views', () => {
  assert.equal(getBoardViewMode(null), 'board');
  assert.equal(getBoardViewMode('unknown'), 'board');
  assert.equal(getBoardViewMode('my-work'), 'my-work');
  assert.equal(getBoardViewMode('my-reviews'), 'my-reviews');
});

test('My work preserves card order and puts active assignments first for each account', () => {
  assert.deepEqual(groupsFor('my-work', alice), [[4, [5, 6]], [1, [1]], [2, [3]], [5, [7]]]);
  assert.deepEqual(groupsFor('my-work', ben), [[1, [2]], [3, [4]]]);
  assert.deepEqual(groupsFor('my-work', alice, '  DATASET '), [[1, [1]]]);
  assert.deepEqual(groupsFor('my-work', alice, '', columns.slice(0, 2)), [[1, [1]], [2, [3]]]);
  assert.deepEqual(columns.map(({ id }) => id), [1, 2, 3, 4, 5, 6]);
});

test('My reviews includes only cards in a review column where the user is a reviewer', () => {
  assert.deepEqual(groupsFor('my-reviews', alice), [[3, [4]]]);
  assert.deepEqual(groupsFor('my-reviews', ben), [[5, [7]]]);
  assert.deepEqual(groupsFor('my-reviews', ben, 'dataset'), []);
  assert.deepEqual(groupsFor('my-reviews', ben, '', columns.slice(0, 2)), []);
});

test('a card appears in My reviews when moved into review and leaves both queues when completed', () => {
  const board = { columns };
  const inReview = moveCardInBoard(board, 5, 3, 0);
  assert.deepEqual(groupsFor('my-reviews', ben, '', inReview.columns), [[3, [5]], [5, [7]]]);

  const completed = moveCardInBoard(inReview, 5, 6, 0);
  assert.deepEqual(groupsFor('my-reviews', ben, '', completed.columns), [[5, [7]]]);
  assert.deepEqual(groupsFor('my-work', alice, 'Run backtest', completed.columns), []);
});
