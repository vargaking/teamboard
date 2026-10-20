import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Empty, Form, Input, Modal, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ArrowLeftOutlined, CalendarOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { createCard } from '../../api/cards';
import { getErrorMessage } from '../../api/client';
import type { BoardDetail, DraftCard } from '../../api/types';
import { queryKeys } from '../../hooks/queryKeys';
import { useDraftCards } from '../../hooks/useAI';
import { formatDueDate } from '../../utils/dates';
import { LabelTag } from '../LabelTag';
import { UserAvatar } from '../UserAvatar';
import { AITheme, AITitle } from './aiTheme';
import { useAI } from './AIContext';

type Props = { board: BoardDetail; open: boolean; onClose: () => void };

type Row = DraftCard & { key: number; checked: boolean };

const MAX_TEXT = 20_000;

export function DraftCardsModal({ board, open, onClose }: Props) {
  const { message } = App.useApp();
  const { handleAIError } = useAI();
  const queryClient = useQueryClient();
  const draft = useDraftCards(board.id);

  const firstColumnId = board.columns[0]?.id;
  const [text, setText] = useState('');
  const [targetColumnId, setTargetColumnId] = useState<number | undefined>(firstColumnId);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);

  // Reset when (re)opened.
  useEffect(() => {
    if (open) {
      setText('');
      setRows(null);
      setTargetColumnId(board.columns[0]?.id);
      draft.reset();
    }
    // Only reset on open; board.columns changes must not wipe the user's work.
  }, [open]);

  const columnIds = useMemo(() => new Set(board.columns.map((c) => c.id)), [board.columns]);
  const labelsById = useMemo(() => new Map(board.labels.map((l) => [l.id, l])), [board.labels]);
  const membersById = useMemo(() => new Map(board.members.map((m) => [m.id, m])), [board.members]);

  const runDraft = () => {
    const body = { text: text.trim(), ...(targetColumnId !== undefined ? { column_id: targetColumnId } : {}) };
    draft.mutate(body, {
      onSuccess: (res) =>
        setRows(
          res.cards.map((c, i) => ({
            ...c,
            // Guard against a column that was deleted meanwhile.
            column_id: columnIds.has(c.column_id) ? c.column_id : (targetColumnId ?? firstColumnId ?? c.column_id),
            key: i,
            checked: true,
          })),
        ),
      onError: (err) => handleAIError(err, 'Could not draft cards'),
    });
  };

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => (prev ? prev.map((r) => (r.key === key ? { ...r, ...patch } : r)) : prev));

  const selected = (rows ?? []).filter((r) => r.checked && r.title.trim() !== '');

  const createSelected = async () => {
    setCreating(true);
    let created = 0;
    try {
      // Sequential so cards land in the proposed order.
      for (const r of selected) {
        await createCard(r.column_id, {
          title: r.title.trim(),
          description: r.description,
          due_date: r.due_date,
          label_ids: r.label_ids.filter((id) => labelsById.has(id)),
          assignee_ids: r.assignee_ids.filter((id) => membersById.has(id)),
        });
        created += 1;
      }
      void message.success(`Created ${created} card${created === 1 ? '' : 's'}`);
      onClose();
    } catch (err) {
      void message.error(`Created ${created} of ${selected.length} cards: ${getErrorMessage(err, 'request failed')}`);
    } finally {
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(board.id) });
    }
  };

  const tableColumns: TableColumnsType<Row> = [
    {
      title: 'Title',
      dataIndex: 'title',
      render: (_value: string, row) => (
        <div>
          <Input
            size="small"
            value={row.title}
            maxLength={200}
            disabled={!row.checked}
            aria-label={`Draft ${row.key + 1} title`}
            onChange={(e) => updateRow(row.key, { title: e.target.value })}
          />
          {row.description && (
            <Typography.Paragraph type="secondary" ellipsis={{ rows: 2, expandable: true }} className="ai-draft-desc">
              {row.description}
            </Typography.Paragraph>
          )}
        </div>
      ),
    },
    {
      title: 'Column',
      dataIndex: 'column_id',
      width: 150,
      render: (_value: number, row) => (
        <Select<number>
          size="small"
          style={{ width: '100%' }}
          value={row.column_id}
          disabled={!row.checked}
          aria-label={`Draft ${row.key + 1} column`}
          onChange={(v) => updateRow(row.key, { column_id: v })}
          options={board.columns.map((c) => ({ value: c.id, label: c.title }))}
        />
      ),
    },
    {
      title: 'Details',
      key: 'details',
      width: 200,
      render: (_value: unknown, row) => {
        const labels = row.label_ids.map((id) => labelsById.get(id)).filter((l) => l !== undefined);
        const people = row.assignee_ids.map((id) => membersById.get(id)).filter((m) => m !== undefined);
        if (labels.length === 0 && people.length === 0 && !row.due_date) {
          return <Typography.Text type="secondary">-</Typography.Text>;
        }
        return (
          <Space size={4} wrap>
            {labels.map((l) => (
              <LabelTag key={l.id} color={l.color} small>
                {l.name}
              </LabelTag>
            ))}
            {people.map((m) => (
              <UserAvatar key={m.id} user={m} size={20} />
            ))}
            {row.due_date && (
              <Tag icon={<CalendarOutlined />} bordered={false} style={{ marginInlineEnd: 0 }}>
                {formatDueDate(row.due_date)}
              </Tag>
            )}
          </Space>
        );
      },
    },
  ];

  const footer =
    rows === null ? (
      <Space>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={runDraft}
          loading={draft.isPending}
          disabled={!text.trim()}
        >
          Draft
        </Button>
      </Space>
    ) : (
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => setRows(null)} disabled={creating}>
          Back to text
        </Button>
        <Button
          type="primary"
          onClick={() => void createSelected()}
          loading={creating}
          disabled={selected.length === 0}
        >
          Create {selected.length} card{selected.length === 1 ? '' : 's'}
        </Button>
      </Space>
    );

  return (
    <AITheme>
      <Modal
        title={<AITitle>Create cards from text</AITitle>}
        open={open}
        onCancel={() => {
          if (!creating) onClose();
        }}
        width={860}
        destroyOnHidden
        footer={footer}
        maskClosable={false}
      >
        {rows === null ? (
          <Spin spinning={draft.isPending} tip="Drafting cards... this can take a few seconds.">
            <Form layout="vertical" requiredMark={false}>
              <Form.Item label="Text" extra="Paste meeting notes, a requirements excerpt, an email... AI proposes cards; you review them before anything is created.">
                <Input.TextArea
                  aria-label="Source text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoSize={{ minRows: 8, maxRows: 18 }}
                  maxLength={MAX_TEXT}
                  showCount
                  placeholder={"- Login page needs a 'forgot password' link (Miki, by Friday)\n- Backtest results should be exportable as CSV\n..."}
                />
              </Form.Item>
              <Form.Item label="Default column" style={{ marginBottom: 0 }}>
                <Select<number>
                  aria-label="Target column"
                  style={{ width: 240 }}
                  value={targetColumnId}
                  onChange={setTargetColumnId}
                  options={board.columns.map((c) => ({ value: c.id, label: c.title }))}
                />
              </Form.Item>
            </Form>
          </Spin>
        ) : rows.length === 0 ? (
          <Empty description="The AI did not find any tasks in this text." />
        ) : (
          <>
            <Typography.Paragraph type="secondary">
              {rows.length} proposed card{rows.length === 1 ? '' : 's'}. Untick the ones you don't want, fix titles or
              columns, then create them.
            </Typography.Paragraph>
            <Table<Row>
              size="small"
              rowKey="key"
              pagination={false}
              columns={tableColumns}
              dataSource={rows}
              scroll={{ y: 420 }}
              rowSelection={{
                selectedRowKeys: rows.filter((r) => r.checked).map((r) => r.key),
                onChange: (keys) => {
                  const set = new Set(keys);
                  setRows((prev) => (prev ? prev.map((r) => ({ ...r, checked: set.has(r.key) })) : prev));
                },
              }}
            />
          </>
        )}
      </Modal>
    </AITheme>
  );
}
