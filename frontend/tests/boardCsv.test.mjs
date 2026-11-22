import test from 'node:test';
import assert from 'node:assert/strict';
import { exportBoardCsv, parseBoardCsv, previewCsv } from '../src/utils/boardCsv.ts';

const member = { id: 7, name: 'Example Editor', email: 'editor@example.test' };
function fixture() {
  const card = { title: 'Integrate logger service', description: '=check("a,b")\r\nsecond line',
    due_date: '2028-02-29', labels: [{ id: 4, name: 'Ops; APIs' }], assignees: [member], reviewers: [member] };
  return { members: [member], labels: card.labels, columns: [
    { id: 1, title: 'To do', cards: [] }, { id: 2, title: 'Done', cards: [card] },
  ] };
}

test('twenty tasks, duplicates in Done and the file, and the inclusive similarity threshold', () => {
  const board = fixture();
  const titles = Array.from({ length: 20 }, (_, i) => 'Task ' + i);
  const rows = parseBoardCsv(['Title', ...titles, ' Task-0!', 'INTEGRATE logger service!', 'Integrate the logger service', 'Integrate file service'].join('\r\n'));
  const preview = previewCsv(board, rows, 1);
  assert.ok(preview.slice(0, 20).every(r => r.status === 'ready' && r.columnId === 1));
  assert.deepEqual(preview.slice(20).map(r => r.status), ['duplicate', 'duplicate', 'similar', 'ready']);
  assert.deepEqual(preview[22].matches, ['Integrate logger service']);
  board.columns[0].cards = titles.map(title => ({ title }));
  assert.ok(previewCsv(board, rows.slice(0, 20), 1).every(r => r.status === 'duplicate'));
});

test('export preserves board order, multiline text, spreadsheet escapes, dates and assignments', () => {
  const board = fixture();
  const first = { ...board.columns[1].cards[0], title: "'=literal", description: 'hello "world",\nnext' };
  board.columns[0].cards.push(first);
  const csv = exportBoardCsv(board);
  assert.ok(csv.includes('"\'=check'));
  const rows = parseBoardCsv(csv);
  assert.deepEqual(rows.map(r => r.Title), [first.title, 'Integrate logger service']);
  assert.deepEqual(rows.map(r => r.Description), [first.description, board.columns[1].cards[0].description]);
  const empty = { ...board, columns: board.columns.map(c => ({ ...c, cards: [] })) };
  const result = previewCsv(empty, rows, 1);
  assert.deepEqual(result.map(r => r.columnId), [1, 2]);
  assert.deepEqual(result[1].body, { title: rows[1].Title, description: rows[1].Description, due_date: '2028-02-29',
    label_ids: [4], assignee_ids: [7], reviewer_ids: [7] });
});

test('validates headers, malformed quoting, dates, empty titles, and unknown references', () => {
  for (const source of ['Other\na', 'Title,Title\na,b', 'Title\n"open', 'Title\na,b']) {
    assert.throws(() => parseBoardCsv(source));
  }
  const rows = parseBoardCsv('Title,Due date,Column,Labels,Assignees,Reviewers\nA,2027-02-29\nB,,Missing\nC,,,Missing\nD,,,,Missing\nE,,,,,Missing\n,2026-11-01\nF,2028-02-29');
  assert.deepEqual(previewCsv(fixture(), rows, 1).map(r => r.status),
    ['invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'ready']);
});

test('near matches inside the upload also require a decision', () => {
  const rows = parseBoardCsv('Title\nDesign invoice export\nDesign the invoice export');
  const result = previewCsv(fixture(), rows, 1);
  assert.deepEqual(result[1].matches, ['Design invoice export']);
});

