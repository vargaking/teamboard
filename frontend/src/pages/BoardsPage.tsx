import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Col, Empty, Form, Input, Modal, Result, Row, Space, Spin, Typography } from 'antd';
import { CrownOutlined, PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import type { BoardCreate, User } from '../api/types';
import { useCurrentUser } from '../auth/AuthContext';
import { UserAvatarGroup } from '../components/UserAvatar';
import { LiveIndicator } from '../components/LiveIndicator';
import { useBoardList, useCreateBoard } from '../hooks/useBoards';
import { useBoardsSocket } from '../hooks/useBoardsSocket';
import { useUsers } from '../hooks/useUsers';

type NewBoardValues = { title: string; description?: string };

export function BoardsPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const boards = useBoardList();
  const users = useUsers();
  const createBoard = useCreateBoard();
  const liveStatus = useBoardsSocket();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<NewBoardValues>();

  const usersById = useMemo(() => {
    const map = new Map<number, User>();
    for (const u of users.data ?? []) map.set(u.id, u);
    return map;
  }, [users.data]);

  const onCreate = (values: NewBoardValues) => {
    const body: BoardCreate = { title: values.title.trim() };
    const description = values.description?.trim();
    if (description) body.description = description;
    createBoard.mutate(body, {
      onSuccess: (board) => {
        setModalOpen(false);
        form.resetFields();
        navigate(`/boards/${board.id}`);
      },
      onError: (err) => void message.error(getErrorMessage(err, 'Could not create board')),
    });
  };

  let content;
  if (boards.isPending) {
    content = (
      <div className="center-block">
        <Spin size="large" />
      </div>
    );
  } else if (boards.isError) {
    content = (
      <Result
        status="error"
        title="Could not load boards"
        subTitle={getErrorMessage(boards.error)}
        extra={<Button onClick={() => void boards.refetch()}>Retry</Button>}
      />
    );
  } else if (boards.data.length === 0) {
    content = (
      <Empty description="No boards yet" style={{ marginTop: 64 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Create your first board
        </Button>
      </Empty>
    );
  } else {
    const sorted = [...boards.data].sort((a, b) => a.title.localeCompare(b.title));
    content = (
      <Row gutter={[16, 16]}>
        {sorted.map((board) => {
          const members = board.member_ids
            .map((id) => usersById.get(id))
            .filter((u): u is User => u !== undefined);
          const isOwner = board.owner_id === user.id;
          return (
            <Col key={board.id} xs={24} sm={12} lg={8} xl={6}>
              <Card hoverable className="board-tile" onClick={() => navigate(`/boards/${board.id}`)}>
                <div className="board-tile-body">
                  <Typography.Title level={5} ellipsis={{ rows: 1 }} style={{ margin: 0 }}>
                    {board.title}
                  </Typography.Title>
                  <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0, minHeight: 44 }}>
                    {board.description || 'No description'}
                  </Typography.Paragraph>
                  <div className="board-tile-footer">
                    <UserAvatarGroup users={members} max={5} />
                    <Space size={4}>
                      {isOwner && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          <CrownOutlined /> Owner
                        </Typography.Text>
                      )}
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {board.member_ids.length} {board.member_ids.length === 1 ? 'member' : 'members'}
                      </Typography.Text>
                    </Space>
                  </div>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <Space align="center" size={12}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Boards
          </Typography.Title>
          <LiveIndicator status={liveStatus} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          New board
        </Button>
      </div>
      {content}
      <Modal
        title="New board"
        open={modalOpen}
        okText="Create"
        onOk={() => form.submit()}
        confirmLoading={createBoard.isPending}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onCreate} requiredMark={false}>
          <Form.Item
            name="title"
            label="Title"
            rules={[
              { required: true, whitespace: true, message: 'Enter a title' },
              { max: 200, message: 'Keep it under 200 characters' },
            ]}
          >
            <Input placeholder="e.g. Sprint 3" autoFocus />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="What is this board for?" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
