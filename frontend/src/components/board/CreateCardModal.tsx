import { useState } from 'react';
import { Alert, DatePicker, Form, Input, Modal, Select } from 'antd';
import type { BoardDetail, CardCreate, Column } from '../../api/types';
import { getErrorMessage } from '../../api/client';
import { useCreateCard } from '../../hooks/useCards';
import { isWorkLabel, missingCardFields } from '../../utils/cardRequirements';
import { DATE_FORMAT } from '../../utils/dates';
import { MemberSelect } from './MemberSelect';

type Props = { board: BoardDetail; column: Column; onClose: () => void };

export function CreateCardModal({ board, column, onClose }: Props) {
  const create = useCreateCard(board.id);
  const [draft, setDraft] = useState<CardCreate>({
    title: '', description: '', assignee_ids: [], reviewer_ids: [], label_ids: [],
  });
  const [submitted, setSubmitted] = useState(false);
  const missing = missingCardFields(draft, board.labels);
  const set = (changes: Partial<CardCreate>) => setDraft(current => ({ ...current, ...changes }));
  const reviewers = board.members.filter(user => !draft.assignee_ids.includes(user.id));
  const submit = () => {
    setSubmitted(true);
    if (missing.length || create.isPending) return;
    create.mutate({ columnId: column.id, body: { ...draft, title: draft.title.trim() } }, { onSuccess: onClose });
  };

  return (
    <Modal open title={'Add card to ' + column.title} okText="Add card" onOk={submit}
      confirmLoading={create.isPending} onCancel={() => { if (!create.isPending) onClose(); }}>
      <Form layout="vertical" component="div">
        <Form.Item label="Title" required htmlFor="new-card-title">
          <Input id="new-card-title" autoFocus maxLength={300} value={draft.title} onChange={e => set({ title: e.target.value })} />
        </Form.Item>
        <Form.Item label="Description" required htmlFor="new-card-description">
          <Input.TextArea id="new-card-description" placeholder="What counts as finished?" value={draft.description}
            onChange={e => set({ description: e.target.value })} autoSize={{ minRows: 2, maxRows: 8 }} />
        </Form.Item>
        <Form.Item label="Labels" required help={board.labels.some(isWorkLabel) ? undefined : 'Add a work label from the board’s Labels menu first.'}>
          <Select mode="multiple" aria-label="Labels" value={draft.label_ids} onChange={ids => set({ label_ids: ids })}
            options={board.labels.map(l => ({ value: l.id, label: l.name }))} optionFilterProp="label" />
        </Form.Item>
        <Form.Item label="Assignees" required>
          <MemberSelect members={board.members} value={draft.assignee_ids} ariaLabel="Assignees" placeholder="Choose assignees"
            onChange={ids => set({ assignee_ids: ids, reviewer_ids: draft.reviewer_ids.filter(id => !ids.includes(id)) })} />
        </Form.Item>
        <Form.Item label="Reviewers" required help={reviewers.length < 2 ? 'Add more board members or change the assignees.' : undefined}>
          <MemberSelect members={reviewers} value={draft.reviewer_ids} ariaLabel="Reviewers" placeholder="Choose at least two reviewers"
            onChange={ids => set({ reviewer_ids: ids })} />
        </Form.Item>
        <Form.Item label="Due date (optional)">
          <DatePicker aria-label="Due date" format={DATE_FORMAT} onChange={date => set({ due_date: date?.format(DATE_FORMAT) ?? null })} />
        </Form.Item>
      </Form>
      {submitted && missing.length > 0 && <Alert type="warning" showIcon message={'Required: ' + missing.join(', ')} />}
      {create.isError && <Alert type="error" showIcon message={getErrorMessage(create.error)} />}
    </Modal>
  );
}
