import { missingCardFields } from './cardRequirements.ts';
import type { BoardDetail, CardCreate } from '../api/types';

const headings = ['Title', 'Description', 'Column', 'Due date', 'Labels', 'Assignees', 'Reviewers'] as const;
type Heading = typeof headings[number];
export type CsvRow = Record<Heading, string>;

const clean = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
function titleKey(title: string) {
  const key = clean(title).replace(/['’]/gu, '').replace(/[-‐‑–—.,!?;:()[\]{}"“”_]+/gu, ' ');
  return clean(key) || clean(title);
}

// Protect text cells when opened in a spreadsheet. Double a leading apostrophe to keep it reversible.
const needsPrefix = (s: string) => /^'|^\s*[=+@-]|^[\t\r\n]/u.test(s);
function csvCell(value: string) {
  const safe = needsPrefix(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function listCell(values: string[]) {
  return values.some(v => v.includes(';') || v.trimStart().startsWith('[')) ? JSON.stringify(values) : values.join('; ');
}

export function exportBoardCsv(board: BoardDetail): string {
  const records: string[][] = [[...headings]];
  for (const column of board.columns) {
    for (const card of column.cards) {
      records.push([card.title, card.description, column.title, card.due_date ?? '',
        listCell(card.labels.map(l => l.name)), listCell(card.assignees.map(u => u.email)),
        listCell(card.reviewers.map(u => u.email))]);
    }
  }
  return '\uFEFF' + records.map(record => record.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// Keep quoted newlines, empty cells, and doubled quotes. Reject malformed records before importing.
function readRecords(text: string) {
  const records: string[][] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const endField = () => {
    fields.push(field);
    field = '';
    closed = false;
  };
  const endRecord = () => {
    endField();
    if (fields.some(value => value.trim())) records.push(fields);
    fields = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (c === ',') endField();
    else if (c === '\r' || c === '\n') {
      endRecord();
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (closed || c === '"') throw new Error('Invalid CSV quoting near record ' + (records.length + 1) + '.');
    else field += c;
  }
  if (quoted) throw new Error('A quoted CSV field is missing its closing quote.');
  endRecord();
  return records;
}

export function parseBoardCsv(text: string): CsvRow[] {
  const [header, ...records] = readRecords(text.replace(/^\uFEFF/u, ''));
  const keys = (header ?? []).map(clean);
  if (!keys.includes('title')) throw new Error('The CSV needs a Title heading.');
  const indices = headings.map(h => {
    const key = clean(h);
    if (keys.indexOf(key) !== keys.lastIndexOf(key)) throw new Error('Repeated heading: ' + h);
    return keys.indexOf(key);
  });
  return records.map((fields, index) => {
    if (fields.length > keys.length) throw new Error('Too many fields in CSV record ' + (index + 2) + '.');
    const row = {} as CsvRow;
    headings.forEach((h, i) => {
      const value = fields[indices[i]] ?? '';
      row[h] = value.startsWith("'") && needsPrefix(value.slice(1)) ? value.slice(1) : value;
    });
    return row;
  });
}

function readList(value: string): string[] {
  if (!value.trimStart().startsWith('[')) return value.split(';').map(v => v.trim()).filter(Boolean);
  const items: unknown = JSON.parse(value);
  if (!Array.isArray(items) || !items.every((v): v is string => typeof v === 'string')) {
    throw new Error('Expected a list of names.');
  }
  return items;
}

function lookup<T extends { id: number }>(text: string, items: T[], names: (item: T) => string[], field: string) {
  const key = clean(text);
  const matches = items.filter(item => names(item).some(name => clean(name) === key));
  if (matches.length !== 1) throw new Error((matches.length ? 'Ambiguous ' : 'Unknown ') + field + ': ' + text);
  return matches[0].id;
}

function cardInput(row: CsvRow, board: BoardDetail, fallback: number | undefined) {
  const title = row.Title.trim();
  if (!title || [...title].length > 300) throw new Error('Title must contain 1 to 300 characters.');
  const columnId = row.Column.trim()
    ? lookup(row.Column, board.columns, c => [c.title], 'column')
    : fallback;
  if (!board.columns.some(c => c.id === columnId) || columnId === undefined) throw new Error('Choose an existing destination column.');
  const date = row['Due date'].trim();
  if (date) {
    const parsed = new Date(date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || date.startsWith('0000') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error('Use a valid due date in YYYY-MM-DD format.');
    }
  }
  const members = (value: string) => [...new Set(readList(value).map(v => lookup(v, board.members, u => [u.email, u.name], 'member')))];
  const body: CardCreate = {
    title, description: row.Description, due_date: date || null,
    label_ids: [...new Set(readList(row.Labels).map(v => lookup(v, board.labels, l => [l.name], 'label')))],
    assignee_ids: members(row.Assignees), reviewer_ids: members(row.Reviewers),
  };
  const missing = missingCardFields(body, board.labels);
  if (missing.length) throw new Error('Required: ' + missing.join(', '));
  return { columnId, body };
}

function candidate(title: string) {
  const key = titleKey(title);
  return { title, key, words: new Set(key.split(' ')) };
}

function near(a: Set<string>, b: Set<string>) {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared >= 2 && shared / (a.size + b.size - shared) >= 0.75;
}

export type PreviewRow =
  | { status: 'duplicate' | 'invalid'; title: string; detail: string }
  | { status: 'ready' | 'similar'; title: string; matches: string[]; columnId: number; body: CardCreate };

export function previewCsv(board: BoardDetail, rows: CsvRow[], fallback: number | undefined): PreviewRow[] {
  const candidates = new Map<string, ReturnType<typeof candidate>>();
  for (const col of board.columns) for (const card of col.cards) {
    const item = candidate(card.title);
    candidates.set(item.key, item);
  }
  return rows.map(row => {
    const title = row.Title.trim();
    const item = candidate(title);
    const exact = candidates.get(item.key);
    if (exact) return { status: 'duplicate', title, detail: exact.title };
    try {
      const input = cardInput(row, board, fallback);
      const matches = [...candidates.values()].filter(c => near(c.words, item.words)).map(c => c.title).sort();
      candidates.set(item.key, item);
      return { status: matches.length ? 'similar' : 'ready', title, matches, ...input };
    } catch (err) {
      return { status: 'invalid', title, detail: err instanceof Error ? err.message : 'Invalid row' };
    }
  });
}

