import { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Divider,
  Empty,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { BoardDetail, Card, CardUpdate, Column } from '../../api/types';
import { getErrorMessage } from '../../api/client';
import { useCurrentUser } from '../../auth/AuthContext';
import { useComments, useCreateComment, useDeleteCard, useDeleteComment, useUpdateCard } from '../../hooks/useCards';
import { DATE_FORMAT, dayjs, getDueStatus, isDoneColumnTitle, parseDueDate, parseTimestamp } from '../../utils/dates';
import { LabelTag } from '../LabelTag';
import { UserAvatar } from '../UserAvatar';

type Props = {
  board: BoardDetail;
  card: Card;
  column: Column;
  onClose: () => void;
};

function FieldLabel({ children }: { children: string }) {
  return (
    <Typography.Text type="secondary" className="field-label">
      {children}
    </Typography.Text>
  );
}

function Comments({ boardId, cardId }: { boardId: number; cardId: number }) {
  const user = useCurrentUser();
  const { message } = App.useApp();
  const comments = useComments(cardId);
  const createComment = useCreateComment(boardId, cardId);
  const deleteComment = useDeleteComment(boardId, cardId);
  const [body, setBody] = useState('');

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    createComment.mutate(text, {
      onSuccess: () => setBody(''),
      onError: (err) => void message.error(getErrorMessage(err, 'Could not post comment')),
    });
  };

  let list;
  if (comments.isPending) {
    list = (
      <div className="center-block-small">
        <Spin />
      </div>
    );
  } else if (comments.isError) {
    list = <Alert type="error" showIcon message="Could not load comments" description={getErrorMessage(comments.error)} />;
  } else if (comments.data.length === 0) {
    list = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No comments yet" style={{ margin: '8px 0' }} />;
  } else {
    list = (
      <List
        itemLayout="horizontal"
        dataSource={comments.data}
        rowKey="id"
        renderItem={(comment) => {
          const created = parseTimestamp(comment.created_at);
          const canDelete = comment.author.id === user.id || user.is_admin;
          return (
            <List.Item
              actions={
                canDelete
                  ? [
                      <Popconfirm
                        key="delete"
                        title="Delete this comment?"
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() =>
                          deleteComment.mutateAsync(comment.id).catch((err: unknown) => {
                            void message.error(getErrorMessage(err, 'Could not delete comment'));
                          })
                        }
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete comment" />
                      </Popconfirm>,
                    ]
                  : undefined
              }
            >
              <List.Item.Meta
                avatar={<UserAvatar user={comment.author} />}
                title={
                  <Space size={8}>
                    <span>{comment.author.name}</span>
                    <Tooltip title={created.format('YYYY-MM-DD HH:mm')}>
                      <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                        {created.fromNow()}
                      </Typography.Text>
                    </Tooltip>
                  </Space>
                }
                description={<div className="comment-body">{comment.body}</div>}
              />
            </List.Item>
          );
        }}
      />
    );
  }

  return (
    <div>
      {list}
      <div className="comment-composer">
        <UserAvatar user={user} />
        <div style={{ flex: 1 }}>
          <Input.TextArea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment..."
            autoSize={{ minRows: 2, maxRows: 6 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
            }}
            maxLength={5000}
          />
          <Button
            type="primary"
            style={{ marginTop: 8 }}
            onClick={submit}
            loading={createComment.isPending}
            disabled={!body.trim()}
          >
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CardModal({ board, card, column, onClose }: Props) {
  const { message } = App.useApp();
  const updateCard = useUpdateCard(board.id);
  const deleteCard = useDeleteCard(board.id);

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [descriptionDirty, setDescriptionDirty] = useState(false);

  // Sync from the cache when the card changes elsewhere (live updates), unless the user is editing.
  useEffect(() => setTitle(card.title), [card.title]);
  useEffect(() => {
    if (!descriptionDirty) setDescription(card.description);
  }, [card.description, descriptionDirty]);

  const save = (update: CardUpdate, errorText: string, onSuccess?: () => void) => {
    updateCard.mutate(
      { cardId: card.id, update },
      {
        onSuccess,
        onError: (err) => void message.error(getErrorMessage(err, errorText)),
      },
    );
  };

  const saveTitle = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(card.title);
      return;
    }
    if (trimmed !== card.title) save({ title: trimmed }, 'Could not rename card');
  };

  const saveDescription = () => {
    if (!descriptionDirty) return;
    if (description === card.description) {
      setDescriptionDirty(false);
      return;
    }
    save({ description }, 'Could not save description', () => setDescriptionDirty(false));
  };

  const dueStatus = card.due_date ? getDueStatus(card.due_date, isDoneColumnTitle(column.title)) : null;

  return (
    <Modal
      open
      onCancel={() => {
        saveDescription();
        onClose();
      }}
      footer={null}
      width={720}
      title={null}
      destroyOnHidden
      className="card-modal"
    >
      <Input
        className="card-modal-title"
        variant="borderless"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onPressEnter={(e) => e.currentTarget.blur()}
        aria-label="Card title"
      />
      <Typography.Text type="secondary" style={{ paddingInline: 11 }}>
        in column <Typography.Text strong>{column.title}</Typography.Text>
      </Typography.Text>

      <div className="card-modal-grid">
        <div>
          <FieldLabel>Assignees</FieldLabel>
          <Select<number[]>
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Nobody assigned"
            value={card.assignees.map((a) => a.id)}
            onChange={(ids) => save({ assignee_ids: ids }, 'Could not update assignees')}
            optionFilterProp="label"
            options={board.members.map((m) => ({ value: m.id, label: m.name, user: m }))}
            optionRender={(option) => (
              <Space>
                <UserAvatar user={option.data.user} size="small" tooltip={false} />
                {option.data.user.name}
              </Space>
            )}
            maxTagCount="responsive"
          />
        </div>
        <div>
          <FieldLabel>Labels</FieldLabel>
          <Select<number[]>
            mode="multiple"
            style={{ width: '100%' }}
            placeholder={board.labels.length ? 'No labels' : 'This board has no labels yet'}
            value={card.labels.map((l) => l.id)}
            onChange={(ids) => save({ label_ids: ids }, 'Could not update labels')}
            optionFilterProp="label"
            options={board.labels.map((l) => ({ value: l.id, label: l.name, color: l.color }))}
            optionRender={(option) => <LabelTag color={option.data.color}>{option.data.label}</LabelTag>}
            tagRender={({ value, closable, onClose: onTagClose }) => {
              const label = board.labels.find((l) => l.id === value);
              if (!label) return <span />;
              return (
                <span
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <LabelTag color={label.color} closable={closable} onClose={onTagClose}>
                    {label.name}
                  </LabelTag>
                </span>
              );
            }}
          />
        </div>
        <div>
          <FieldLabel>Due date</FieldLabel>
          <DatePicker
            style={{ width: '100%' }}
            value={card.due_date ? parseDueDate(card.due_date) : null}
            format={DATE_FORMAT}
            allowClear
            status={dueStatus === 'overdue' ? 'error' : dueStatus === 'soon' ? 'warning' : undefined}
            onChange={(date) =>
              save({ due_date: date ? date.format(DATE_FORMAT) : null }, 'Could not update due date')
            }
            presets={[
              { label: 'Today', value: dayjs() },
              { label: 'Tomorrow', value: dayjs().add(1, 'day') },
              { label: 'In a week', value: dayjs().add(7, 'day') },
            ]}
          />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <FieldLabel>Description</FieldLabel>
        <Input.TextArea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setDescriptionDirty(true);
          }}
          onBlur={saveDescription}
          placeholder="Add a more detailed description..."
          autoSize={{ minRows: 3, maxRows: 14 }}
          maxLength={10000}
        />
        {descriptionDirty && (
          <Space style={{ marginTop: 8 }}>
            <Button
              type="primary"
              size="small"
              loading={updateCard.isPending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={saveDescription}
            >
              Save
            </Button>
            <Button
              size="small"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDescription(card.description);
                setDescriptionDirty(false);
              }}
            >
              Discard
            </Button>
          </Space>
        )}
      </div>

      <Divider orientation="left" orientationMargin={0} plain>
        Comments
      </Divider>
      <Comments boardId={board.id} cardId={card.id} />

      <Divider />
      <div className="card-modal-footer">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Created {parseTimestamp(card.created_at).fromNow()}
          {card.updated_at !== card.created_at ? ` · updated ${parseTimestamp(card.updated_at).fromNow()}` : ''}
        </Typography.Text>
        <Popconfirm
          title="Delete this card?"
          description="Its comments will be deleted too."
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={() =>
            deleteCard
              .mutateAsync(card.id)
              .then(() => {
                void message.success('Card deleted');
                onClose();
              })
              .catch((err: unknown) => {
                void message.error(getErrorMessage(err, 'Could not delete card'));
              })
          }
        >
          <Button danger icon={<DeleteOutlined />} loading={deleteCard.isPending}>
            Delete card
          </Button>
        </Popconfirm>
      </div>
    </Modal>
  );
}
