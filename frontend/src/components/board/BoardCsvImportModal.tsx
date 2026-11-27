import { useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Modal, Radio, Select, Space, Table, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { getBoard } from '../../api/boards';
import { createCard } from '../../api/cards';
import { getErrorMessage } from '../../api/client';
import type { BoardDetail } from '../../api/types';
import { queryKeys } from '../../hooks/queryKeys';
import { parseBoardCsv, previewCsv, type CsvRow, type PreviewRow } from '../../utils/boardCsv';

type Props = { board: BoardDetail; onClose: () => void };

export function BoardCsvImportModal({ board, onClose }: Props) {
  const { message } = App.useApp();
  const cache = useQueryClient();
  const [snapshot, setSnapshot] = useState(board);
  const [destination, setDestination] = useState(
    (board.columns.find(c => c.title.trim().toLowerCase() === 'to do') ?? board.columns[0])?.id,
  );
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [approvals, setApprovals] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const active = useRef(false);
  const completed = useRef(new Set<number>());
  const [saved, setSaved] = useState(0);
  const preview = useMemo(() => previewCsv(snapshot, rows, destination), [snapshot, rows, destination]);
  const selected = (row: PreviewRow, index: number) => !completed.current.has(index) &&
    (row.status === 'ready' || (row.status === 'similar' && approvals[index] === JSON.stringify(row.matches)));
  const count = preview.filter(selected).length;
  const busy = loading || saving;

  async function load(file?: File) {
    setRows([]);
    setSaved(0);
    completed.current.clear();
    setApprovals({});
    setNotice('');
    if (!file) return;
    setLoading(true);
    try {
      const parsed = parseBoardCsv(await file.text());
      setRows(parsed);
      setSnapshot(board);
      if (!parsed.length) setNotice('The file has headings but no tasks.');
    } catch (err) {
      setNotice(getErrorMessage(err, 'Could not read the CSV.'));
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (active.current || !count) return;
    active.current = true;
    setSaving(true);
    setNotice('');
    let currentRow: number | undefined;
    try {
      const fresh = await getBoard(board.id);
      setSnapshot(fresh);
      const checked = previewCsv(fresh, rows, destination);
      // Require another click if a row, destination, or match changed since the displayed preview.
      if (checked.some((row, i) => !completed.current.has(i) && JSON.stringify(row) !== JSON.stringify(preview[i]))) {
        setNotice('The board changed. Review the updated preview before importing.');
        return;
      }
      for (const [index, row] of checked.entries()) {
        if ((row.status !== 'ready' && row.status !== 'similar') || !selected(row, index)) continue;
        currentRow = index + 2;
        await createCard(row.columnId, row.body);
        completed.current.add(index);
        setSaved(completed.current.size);
      }
      void message.success('Imported ' + completed.current.size + ' tasks.');
      onClose();
    } catch (err) {
      const where = currentRow === undefined ? 'Could not refresh the board.' : 'Stopped at CSV record ' + currentRow + '.';
      setNotice(where + ' ' + getErrorMessage(err) + '. Retrying will check the board before adding more tasks.');
    } finally {
      active.current = false;
      setSaving(false);
      void cache.invalidateQueries({ queryKey: queryKeys.board(board.id) });
    }
  }

  const counts = (status: PreviewRow['status']) => preview.filter((r, i) => r.status === status && !completed.current.has(i)).length;
  return (
    <Modal open title={'Import CSV into ' + board.title} width={820}
      onCancel={() => { if (!busy) onClose(); }} closable={!busy} maskClosable={!busy} keyboard={!busy}
      footer={<Space>
        <Button disabled={busy} onClick={onClose}>Close</Button>
        <Button type="primary" loading={saving} disabled={busy || !count} onClick={() => void submit()}>
          Import {count} {count === 1 ? 'task' : 'tasks'}
        </Button>
      </Space>}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Text>
          Each new task needs Title, Description, Labels (include a work label), Assignees and Reviewers.
          Choose at least two distinct reviewers outside the assignee list. Separate multiple names or emails
          with semicolons. Column and Due date (YYYY-MM-DD) are optional.
        </Typography.Text>
        <input aria-label="CSV file" type="file" accept=".csv,text/csv" disabled={busy}
          onChange={e => void load(e.target.files?.[0])} />
        <label>Default column{' '}
          <Select aria-label="Default column" placeholder="Choose a column" value={destination} disabled={busy}
            style={{ minWidth: 160 }} onChange={setDestination}
            options={snapshot.columns.map(c => ({ value: c.id, label: c.title }))} />
        </label>
        {notice && <Alert type="warning" showIcon message={notice} />}
        {rows.length > 0 && <>
          <Typography.Text aria-live="polite">
            {count} selected · {counts('duplicate')} duplicates · {counts('similar')} close matches · {counts('invalid')} invalid · {saved} added
          </Typography.Text>
          <Table size="small" pagination={{ pageSize: 10, showSizeChanger: false }} rowKey="index"
            dataSource={preview.map((row, index) => ({ row, index }))}
            columns={[
              { title: 'CSV task', render: (_, { row, index }) => '#' + (index + 2) + ' ' + row.title },
              { title: 'Preview', render: (_, { row, index }) => {
                if (completed.current.has(index)) return 'Added';
                if (row.status === 'invalid') return row.detail;
                if (row.status === 'duplicate') return 'Skip duplicate: ' + row.detail;
                if (row.status === 'ready') return 'Add to ' + snapshot.columns.find(c => c.id === row.columnId)?.title;
                if (row.status === 'similar') return <Space direction="vertical" size={2}>
                  <span>Similar to {row.matches.map(title => '“' + title + '”').join(', ')}</span>
                  <Radio.Group aria-label={'Import decision for ' + row.title} disabled={busy}
                    value={selected(row, index) ? 'add' : 'skip'}
                    onChange={e => setApprovals(prev => ({ ...prev, [index]: e.target.value === 'add' ? JSON.stringify(row.matches) : '' }))}>
                    <Radio value="skip">Skip</Radio><Radio value="add">Add</Radio>
                  </Radio.Group>
                </Space>;
              } },
            ]} />
        </>}
      </Space>
    </Modal>
  );
}

