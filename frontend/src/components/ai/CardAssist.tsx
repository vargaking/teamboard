import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Checkbox, Dropdown, Empty, Input, Popover, Space, Spin, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckSquareOutlined,
  DownOutlined,
  FileTextOutlined,
  PartitionOutlined,
  TagsOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { createLabel } from '../../api/boards';
import { createCard, updateCard } from '../../api/cards';
import { getErrorMessage } from '../../api/client';
import type {
  BoardDetail,
  Card,
  CardAssistAction,
  CardAssistResult,
  CardAssistSubtask,
  Column,
  Label,
  SuggestedLabel,
} from '../../api/types';
import { queryKeys } from '../../hooks/queryKeys';
import { useUpdateCard } from '../../hooks/useCards';
import { LabelTag } from '../LabelTag';
import { AIBadge } from './aiTheme';
import { Markdown } from './Markdown';

export const ASSIST_ACTIONS: { key: CardAssistAction; label: string; icon: ReactNode; hint: string }[] = [
  { key: 'describe', label: 'Write description', icon: <FileTextOutlined />, hint: 'Proposes a new description' },
  {
    key: 'acceptance_criteria',
    label: 'Acceptance criteria',
    icon: <CheckSquareOutlined />,
    hint: 'Appends a checklist to the description',
  },
  { key: 'subtasks', label: 'Break into subtasks', icon: <PartitionOutlined />, hint: 'Creates cards in this column' },
  { key: 'labels', label: 'Suggest labels', icon: <TagsOutlined />, hint: 'Adds existing or new labels' },
];

export function assistActionLabel(action: CardAssistAction): string {
  return ASSIST_ACTIONS.find((a) => a.key === action)?.label ?? action;
}

// ---------------------------------------------------------------------------------------------
// AI button (dropdown + optional instructions popover)

type ButtonProps = {
  loading: boolean;
  onRun: (action: CardAssistAction, instructions?: string) => void;
};

export function CardAIButton({ loading, onRun }: ButtonProps) {
  const [pending, setPending] = useState<CardAssistAction | null>(null);
  const [instructions, setInstructions] = useState('');

  const items: MenuProps['items'] = ASSIST_ACTIONS.map((a) => ({
    key: a.key,
    icon: a.icon,
    label: (
      <div className="ai-menu-item">
        <div>{a.label}</div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {a.hint}
        </Typography.Text>
      </div>
    ),
  }));

  const run = () => {
    if (!pending) return;
    const extra = instructions.trim();
    onRun(pending, extra || undefined);
    setPending(null);
    setInstructions('');
  };

  return (
    <Popover
      open={pending !== null}
      onOpenChange={(next) => {
        if (!next) setPending(null);
      }}
      trigger="click"
      placement="bottomRight"
      title={
        pending ? (
          <Space size={6}>
            <AIBadge />
            {assistActionLabel(pending)}
          </Space>
        ) : null
      }
      content={
        <div className="ai-instructions">
          <Input.TextArea
            autoFocus
            aria-label="Extra instructions"
            placeholder="Extra instructions (optional), e.g. 'keep it short', 'focus on the API'"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                run();
              }
            }}
            autoSize={{ minRows: 2, maxRows: 5 }}
            maxLength={1000}
          />
          <Space style={{ marginTop: 8, justifyContent: 'flex-end', width: '100%' }}>
            <Button size="small" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button size="small" type="primary" icon={<ThunderboltOutlined />} onClick={run}>
              Generate
            </Button>
          </Space>
        </div>
      }
    >
      <Dropdown
        trigger={['click']}
        disabled={loading}
        menu={{ items, onClick: ({ key }) => setPending(key as CardAssistAction) }}
        placement="bottomRight"
      >
        <Button className="ai-button" icon={<ThunderboltOutlined />} loading={loading} aria-label="AI assist">
          AI <DownOutlined style={{ fontSize: 10 }} />
        </Button>
      </Dropdown>
    </Popover>
  );
}

// ---------------------------------------------------------------------------------------------
// Proposal panel

type ProposalProps = {
  board: BoardDetail;
  card: Card;
  column: Column;
  /** Description as currently shown in the modal (may contain unsaved edits). */
  currentDescription: string;
  loadingAction: CardAssistAction | null;
  result: CardAssistResult | null;
  onDone: (applied: boolean) => void;
};

export function AssistPanel({ board, card, column, currentDescription, loadingAction, result, onDone }: ProposalProps) {
  if (loadingAction) {
    return (
      <div className="ai-panel ai-panel-loading" aria-busy="true">
        <Spin />
        <div>
          <Space size={6}>
            <AIBadge />
            <Typography.Text strong>{assistActionLabel(loadingAction)}</Typography.Text>
          </Space>
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            Thinking... this can take a few seconds.
          </Typography.Paragraph>
        </div>
      </div>
    );
  }
  if (!result) return null;

  let body: ReactNode;
  switch (result.action) {
    case 'describe':
      body = <DescribeProposal card={card} boardId={board.id} description={result.description} onDone={onDone} />;
      break;
    case 'acceptance_criteria':
      body = (
        <CriteriaProposal
          card={card}
          boardId={board.id}
          criteria={result.criteria}
          currentDescription={currentDescription}
          onDone={onDone}
        />
      );
      break;
    case 'subtasks':
      body = <SubtasksProposal boardId={board.id} column={column} subtasks={result.subtasks} onDone={onDone} />;
      break;
    case 'labels':
      body = (
        <LabelsProposal
          board={board}
          card={card}
          labelIds={result.label_ids}
          newLabels={result.new_labels}
          onDone={onDone}
        />
      );
      break;
  }

  return (
    <div className="ai-panel" role="region" aria-label="AI proposal">
      <div className="ai-panel-header">
        <Space size={6}>
          <AIBadge />
          <Typography.Text strong>{assistActionLabel(result.action)}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            proposal: nothing is saved until you apply it
          </Typography.Text>
        </Space>
      </div>
      {body}
    </div>
  );
}

function ProposalActions({
  applyLabel,
  applying,
  disabled,
  onApply,
  onDiscard,
}: {
  applyLabel: string;
  applying: boolean;
  disabled?: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="ai-panel-actions">
      <Button onClick={onDiscard} disabled={applying}>
        Discard
      </Button>
      <Button type="primary" onClick={onApply} loading={applying} disabled={disabled}>
        {applyLabel}
      </Button>
    </div>
  );
}

function DescribeProposal({
  card,
  boardId,
  description,
  onDone,
}: {
  card: Card;
  boardId: number;
  description: string;
  onDone: (applied: boolean) => void;
}) {
  const { message } = App.useApp();
  const update = useUpdateCard(boardId);
  return (
    <>
      <div className="ai-preview">
        <Markdown>{description}</Markdown>
      </div>
      <ProposalActions
        applyLabel="Apply: replace description"
        applying={update.isPending}
        onDiscard={() => onDone(false)}
        onApply={() =>
          update.mutate(
            { cardId: card.id, update: { description } },
            {
              onSuccess: () => {
                void message.success('Description updated');
                onDone(true);
              },
              onError: (err) => void message.error(getErrorMessage(err, 'Could not update description')),
            },
          )
        }
      />
    </>
  );
}

export function appendAcceptanceCriteria(description: string, criteria: string[]): string {
  const block = `## Acceptance criteria\n${criteria.map((c) => `- [ ] ${c}`).join('\n')}`;
  const base = description.trimEnd();
  return base ? `${base}\n\n${block}` : block;
}

function CriteriaProposal({
  card,
  boardId,
  criteria,
  currentDescription,
  onDone,
}: {
  card: Card;
  boardId: number;
  criteria: string[];
  currentDescription: string;
  onDone: (applied: boolean) => void;
}) {
  const { message } = App.useApp();
  const update = useUpdateCard(boardId);
  return (
    <>
      <div className="ai-preview">
        {criteria.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No criteria proposed" />
        ) : (
          <ul className="ai-checklist">
            {criteria.map((c, i) => (
              <li key={i}>
                <Checkbox disabled checked={false} /> <span>{c}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ProposalActions
        applyLabel="Apply: append to description"
        applying={update.isPending}
        disabled={criteria.length === 0}
        onDiscard={() => onDone(false)}
        onApply={() =>
          update.mutate(
            { cardId: card.id, update: { description: appendAcceptanceCriteria(currentDescription, criteria) } },
            {
              onSuccess: () => {
                void message.success('Acceptance criteria added');
                onDone(true);
              },
              onError: (err) => void message.error(getErrorMessage(err, 'Could not update description')),
            },
          )
        }
      />
    </>
  );
}

type EditableSubtask = CardAssistSubtask & { checked: boolean };

function SubtasksProposal({
  boardId,
  column,
  subtasks,
  onDone,
}: {
  boardId: number;
  column: Column;
  subtasks: CardAssistSubtask[];
  onDone: (applied: boolean) => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<EditableSubtask[]>(() => subtasks.map((s) => ({ ...s, checked: true })));
  const [applying, setApplying] = useState(false);
  useEffect(() => setItems(subtasks.map((s) => ({ ...s, checked: true }))), [subtasks]);

  const selected = items.filter((s) => s.checked && s.title.trim() !== '');

  const apply = async () => {
    setApplying(true);
    let created = 0;
    try {
      // Sequential so the new cards keep the proposed order.
      for (const s of selected) {
        await createCard(column.id, { title: s.title.trim(), description: s.description });
        created += 1;
      }
      void message.success(`Created ${created} card${created === 1 ? '' : 's'} in "${column.title}"`);
      onDone(true);
    } catch (err) {
      void message.error(
        `Created ${created} of ${selected.length} cards: ${getErrorMessage(err, 'the rest failed')}`,
      );
    } finally {
      setApplying(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
    }
  };

  const update = (index: number, patch: Partial<EditableSubtask>) =>
    setItems((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <>
      <div className="ai-preview">
        {items.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No subtasks proposed" />
        ) : (
          <ul className="ai-subtasks">
            {items.map((s, i) => (
              <li key={i}>
                <Checkbox
                  checked={s.checked}
                  onChange={(e) => update(i, { checked: e.target.checked })}
                  aria-label={`Include subtask ${i + 1}`}
                />
                <div className="ai-subtask-body">
                  <Input
                    size="small"
                    value={s.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    maxLength={200}
                    aria-label={`Subtask ${i + 1} title`}
                    disabled={!s.checked}
                  />
                  {s.description && (
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 2, expandable: true }} className="ai-subtask-desc">
                      {s.description}
                    </Typography.Paragraph>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ProposalActions
        applyLabel={`Apply: create ${selected.length} card${selected.length === 1 ? '' : 's'} in "${column.title}"`}
        applying={applying}
        disabled={selected.length === 0}
        onDiscard={() => onDone(false)}
        onApply={() => void apply()}
      />
    </>
  );
}

function LabelsProposal({
  board,
  card,
  labelIds,
  newLabels,
  onDone,
}: {
  board: BoardDetail;
  card: Card;
  labelIds: number[];
  newLabels: SuggestedLabel[];
  onDone: (applied: boolean) => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const onCard = new Set(card.labels.map((l) => l.id));
  // Existing labels the AI suggests that are not on the card yet (ignore unknown ids).
  const existing: Label[] = board.labels.filter((l) => labelIds.includes(l.id) && !onCard.has(l.id));
  const [selectedExisting, setSelectedExisting] = useState<number[]>(() => existing.map((l) => l.id));
  const [selectedNew, setSelectedNew] = useState<number[]>(() => newLabels.map((_, i) => i));
  const [applying, setApplying] = useState(false);

  const total = selectedExisting.length + selectedNew.length;

  const toggle = (list: number[], value: number) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const apply = async () => {
    setApplying(true);
    try {
      const createdIds: number[] = [];
      for (const index of selectedNew) {
        const suggestion = newLabels[index];
        // Reuse a label with the same name instead of creating a duplicate.
        const same = board.labels.find((l) => l.name.toLowerCase() === suggestion.name.toLowerCase());
        if (same) {
          createdIds.push(same.id);
        } else {
          const label = await createLabel(board.id, { name: suggestion.name, color: suggestion.color });
          createdIds.push(label.id);
        }
      }
      const ids = Array.from(new Set([...card.labels.map((l) => l.id), ...selectedExisting, ...createdIds]));
      await updateCard(card.id, { label_ids: ids });
      void message.success(`Added ${total} label${total === 1 ? '' : 's'}`);
      onDone(true);
    } catch (err) {
      void message.error(getErrorMessage(err, 'Could not apply labels'));
    } finally {
      setApplying(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(board.id) });
    }
  };

  return (
    <>
      <div className="ai-preview">
        {existing.length === 0 && newLabels.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No label suggestions" />
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {existing.length > 0 && (
              <div>
                <Typography.Text type="secondary" className="field-label">
                  Existing labels
                </Typography.Text>
                <div className="ai-label-choices">
                  {existing.map((l) => (
                    <SelectableLabel
                      key={l.id}
                      color={l.color}
                      name={l.name}
                      selected={selectedExisting.includes(l.id)}
                      onToggle={() => setSelectedExisting((prev) => toggle(prev, l.id))}
                    />
                  ))}
                </div>
              </div>
            )}
            {newLabels.length > 0 && (
              <div>
                <Typography.Text type="secondary" className="field-label">
                  New labels (created on apply)
                </Typography.Text>
                <div className="ai-label-choices">
                  {newLabels.map((l, i) => (
                    <SelectableLabel
                      key={`${l.name}-${i}`}
                      color={l.color}
                      name={l.name}
                      isNew
                      selected={selectedNew.includes(i)}
                      onToggle={() => setSelectedNew((prev) => toggle(prev, i))}
                    />
                  ))}
                </div>
              </div>
            )}
          </Space>
        )}
      </div>
      <ProposalActions
        applyLabel={`Apply: add ${total} label${total === 1 ? '' : 's'}`}
        applying={applying}
        disabled={total === 0}
        onDiscard={() => onDone(false)}
        onApply={() => void apply()}
      />
    </>
  );
}

function SelectableLabel({
  color,
  name,
  selected,
  isNew,
  onToggle,
}: {
  color: string;
  name: string;
  selected: boolean;
  isNew?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`ai-label-choice${selected ? ' is-selected' : ''}`}
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`${isNew ? 'New label' : 'Label'} ${name}`}
    >
      <Checkbox checked={selected} tabIndex={-1} style={{ pointerEvents: 'none' }} />
      <LabelTag color={color}>{name}</LabelTag>
      {isNew && (
        <Tag bordered={false} style={{ marginInlineEnd: 0, fontSize: 11 }}>
          new
        </Tag>
      )}
    </button>
  );
}
