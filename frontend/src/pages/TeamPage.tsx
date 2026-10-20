import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Result,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  CopyOutlined,
  CrownOutlined,
  KeyOutlined,
  LinkOutlined,
  ReloadOutlined,
  StopOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import type { Invite, InviteCreate, User } from '../api/types';
import { useCurrentUser } from '../auth/AuthContext';
import { CopyField } from '../components/CopyField';
import { UserAvatar } from '../components/UserAvatar';
import { useBoardList } from '../hooks/useBoards';
import { useCreateInvite, useCreateUser, useInvites, useRevokeInvite, useUpdateUser } from '../hooks/useTeam';
import { useUsers } from '../hooks/useUsers';
import { copyText } from '../utils/clipboard';
import { dayjs, parseTimestamp } from '../utils/dates';
import { generatePassword, MIN_PASSWORD_LENGTH } from '../utils/password';

// ------------------------------------------------------------------ password input with generate/copy

type PasswordFieldProps = { value?: string; onChange?: (value: string) => void; id?: string; ariaLabel: string };

/** Clear-text password input (the admin passes it on) with Generate and Copy buttons. */
function GeneratedPasswordInput({ value = '', onChange, id, ariaLabel }: PasswordFieldProps) {
  const { message } = App.useApp();
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        autoComplete="new-password"
        className="mono-input"
      />
      <Tooltip title="Generate a random 12-character password">
        <Button icon={<ReloadOutlined />} onClick={() => onChange?.(generatePassword(12))}>
          Generate
        </Button>
      </Tooltip>
      <Tooltip title="Copy password">
        <Button
          icon={<CopyOutlined />}
          aria-label="Copy password"
          disabled={!value}
          onClick={() =>
            copyText(value).then(
              () => void message.success('Password copied'),
              () => void message.error('Could not copy to clipboard'),
            )
          }
        />
      </Tooltip>
    </Space.Compact>
  );
}

const passwordRules = [
  { required: true, message: 'Enter or generate a password' },
  { min: MIN_PASSWORD_LENGTH, message: `At least ${MIN_PASSWORD_LENGTH} characters` },
];

// ------------------------------------------------------------------ add user

type AddUserValues = { name: string; email: string; password: string; is_admin: boolean };

function AddUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<AddUserValues>();
  const createUser = useCreateUser();

  return (
    <Modal
      title={
        <Space>
          <UserAddOutlined />
          Add user
        </Space>
      }
      open={open}
      okText="Add user"
      onOk={() => form.submit()}
      confirmLoading={createUser.isPending}
      onCancel={onClose}
      destroyOnHidden
      className="add-user-modal"
    >
      <Form<AddUserValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ is_admin: false, password: generatePassword(12) }}
        onFinish={(values) =>
          createUser.mutate(
            { name: values.name.trim(), email: values.email.trim().toLowerCase(), password: values.password, is_admin: values.is_admin },
            {
              onSuccess: (user) => {
                void message.success(`Added ${user.name}. Share the password with them; it isn't shown again.`);
                onClose();
              },
              onError: (err) => void message.error(getErrorMessage(err, 'Could not add user')),
            },
          )
        }
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter a name' }]}>
          <Input autoFocus placeholder="First Last" />
        </Form.Item>
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Enter an email' },
            { type: 'email', message: 'Enter a valid email' },
          ]}
        >
          <Input placeholder="firstname@teamboard.local" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Initial password"
          rules={passwordRules}
          extra="Shown in clear so you can pass it on. They can change it later under Change password."
        >
          <GeneratedPasswordInput ariaLabel="Initial password" />
        </Form.Item>
        <Form.Item name="is_admin" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Checkbox>Admin (can manage users and invites, sees all boards)</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ------------------------------------------------------------------ set password

function SetPasswordModal({ target, onClose }: { target: User | null; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ password: string }>();
  const updateUser = useUpdateUser();

  return (
    <Modal
      title={target ? `Set password for ${target.name}` : 'Set password'}
      open={target !== null}
      okText="Set password"
      onOk={() => form.submit()}
      confirmLoading={updateUser.isPending}
      onCancel={onClose}
      destroyOnHidden
      className="set-password-modal"
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ password: generatePassword(12) }}
        onFinish={({ password }) => {
          if (!target) return;
          updateUser.mutate(
            { userId: target.id, update: { password } },
            {
              onSuccess: () => {
                void message.success(`Password updated for ${target.name}`);
                onClose();
              },
              onError: (err) => void message.error(getErrorMessage(err, 'Could not set password')),
            },
          );
        }}
      >
        <Form.Item name="password" label="New password" rules={passwordRules} style={{ marginBottom: 0 }}>
          <GeneratedPasswordInput ariaLabel="New password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ------------------------------------------------------------------ invite

type InviteValues = { email?: string; name?: string; board_id?: number; expires_in_days: number; max_uses: number };

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<InviteValues>();
  const createInvite = useCreateInvite();
  const boards = useBoardList();
  // The link (with its token) is only held here and only shown once.
  const [created, setCreated] = useState<Invite | null>(null);

  const close = () => {
    setCreated(null);
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <LinkOutlined />
          Invite with link
        </Space>
      }
      open={open}
      onCancel={close}
      destroyOnHidden
      className="invite-modal"
      footer={
        created ? (
          <Button type="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <Space>
            <Button onClick={close}>Cancel</Button>
            <Button type="primary" icon={<LinkOutlined />} loading={createInvite.isPending} onClick={() => form.submit()}>
              Create link
            </Button>
          </Space>
        )
      }
    >
      {created?.url ? (
        <div className="invite-created">
          <Alert
            type="warning"
            showIcon
            message="Copy the link now: it won't be shown again."
            description={
              <>
                <CopyField value={created.url} label="link" />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {created.email ? `Only ${created.email} can use it. ` : 'Anyone with the link can join. '}
                  {created.max_uses === 1 ? 'Single use' : `Up to ${created.max_uses} uses`}, expires{' '}
                  {parseTimestamp(created.expires_at).fromNow()}
                  {created.board_title ? `; joins the board "${created.board_title}"` : ''}.
                </Typography.Text>
              </>
            }
          />
        </div>
      ) : (
        <Form<InviteValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ expires_in_days: 7, max_uses: 1 }}
          onFinish={(values) => {
            const body: InviteCreate = { expires_in_days: values.expires_in_days, max_uses: values.max_uses };
            const email = values.email?.trim();
            const name = values.name?.trim();
            if (email) body.email = email.toLowerCase();
            if (name) body.name = name;
            if (values.board_id !== undefined) body.board_id = values.board_id;
            createInvite.mutate(body, {
              onSuccess: (invite) => setCreated(invite),
              onError: (err) => void message.error(getErrorMessage(err, 'Could not create invite')),
            });
          }}
        >
          <Typography.Paragraph type="secondary">
            The invitee opens the link, picks a password and gets an account. Leave email empty to let anyone with the
            link join.
          </Typography.Paragraph>
          <Form.Item name="email" label="Email (optional)" rules={[{ type: 'email', message: 'Enter a valid email' }]}>
            <Input placeholder="Restrict to this email" />
          </Form.Item>
          <Form.Item name="name" label="Name (optional)">
            <Input placeholder="Prefills the sign-up form" />
          </Form.Item>
          <Form.Item name="board_id" label="Add to board (optional)">
            <Select<number>
              aria-label="Board"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="No board"
              loading={boards.isPending}
              options={(boards.data ?? []).map((b) => ({ value: b.id, label: b.title }))}
            />
          </Form.Item>
          <Space size={16}>
            <Form.Item name="expires_in_days" label="Expires after (days)" rules={[{ required: true }]}>
              <InputNumber aria-label="Expires after (days)" min={1} max={30} precision={0} />
            </Form.Item>
            <Form.Item name="max_uses" label="Uses" rules={[{ required: true }]}>
              <InputNumber aria-label="Uses" min={1} max={100} precision={0} />
            </Form.Item>
          </Space>
        </Form>
      )}
    </Modal>
  );
}

export type InviteStatus = 'active' | 'used up' | 'expired' | 'revoked';

export function inviteStatus(invite: Invite, now = dayjs()): InviteStatus {
  if (invite.revoked) return 'revoked';
  if (invite.uses >= invite.max_uses) return 'used up';
  if (parseTimestamp(invite.expires_at).isBefore(now)) return 'expired';
  return 'active';
}

const STATUS_COLOR: Record<InviteStatus, string> = {
  active: 'green',
  'used up': 'default',
  expired: 'orange',
  revoked: 'red',
};

function InvitesTable() {
  const { message } = App.useApp();
  const invites = useInvites(true);
  const revoke = useRevokeInvite();

  const columns: TableColumnsType<Invite> = [
    {
      title: 'For',
      key: 'for',
      render: (_v: unknown, i) =>
        i.email || i.name ? (
          <div className="invite-for">
            {i.name && <span>{i.name}</span>}
            {i.email && <Typography.Text type={i.name ? 'secondary' : undefined}>{i.email}</Typography.Text>}
          </div>
        ) : (
          <Typography.Text type="secondary">anyone</Typography.Text>
        ),
    },
    {
      title: 'Board',
      dataIndex: 'board_title',
      render: (t: string | null) => t ?? <Typography.Text type="secondary">-</Typography.Text>,
    },
    { title: 'Uses', key: 'uses', width: 70, render: (_v: unknown, i) => `${i.uses}/${i.max_uses}` },
    {
      title: 'Expires',
      dataIndex: 'expires_at',
      width: 120,
      render: (v: string) => {
        const t = parseTimestamp(v);
        return (
          <Tooltip title={t.format('YYYY-MM-DD HH:mm')}>
            <span>{t.fromNow()}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_v: unknown, i) => {
        const s = inviteStatus(i);
        return <Tag color={STATUS_COLOR[s]}>{s}</Tag>;
      },
    },
    {
      title: 'Created by',
      key: 'by',
      render: (_v: unknown, i) => (
        <Space size={6}>
          <UserAvatar user={i.created_by} size={22} />
          <span>{i.created_by.name}</span>
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_v: unknown, i) =>
        inviteStatus(i) === 'active' ? (
          <Popconfirm
            title="Revoke this invite?"
            description="The link stops working immediately."
            okText="Revoke"
            okButtonProps={{ danger: true }}
            onConfirm={() =>
              revoke.mutateAsync(i.id).then(
                () => void message.success('Invite revoked'),
                (err: unknown) => void message.error(getErrorMessage(err, 'Could not revoke invite')),
              )
            }
          >
            <Button size="small" danger icon={<StopOutlined />} aria-label={`Revoke invite ${i.id}`}>
              Revoke
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  if (invites.isError) {
    return <Alert type="error" showIcon message="Could not load invites" description={getErrorMessage(invites.error)} />;
  }
  return (
    <Table<Invite>
      className="invites-table"
      size="small"
      rowKey="id"
      loading={invites.isPending}
      columns={columns}
      dataSource={invites.data ?? []}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      locale={{ emptyText: 'No invites yet' }}
    />
  );
}

// ------------------------------------------------------------------ page

export function TeamPage() {
  const me = useCurrentUser();
  const { message } = App.useApp();
  const users = useUsers();
  const updateUser = useUpdateUser();
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const isAdmin = me.is_admin;

  const toggleAdmin = (u: User) =>
    updateUser.mutateAsync({ userId: u.id, update: { is_admin: !u.is_admin } }).then(
      (updated) => void message.success(updated.is_admin ? `${updated.name} is now an admin` : `${updated.name} is no longer an admin`),
      (err: unknown) => void message.error(getErrorMessage(err, 'Could not update user')),
    );

  const columns: TableColumnsType<User> = [
    {
      title: 'Name',
      key: 'name',
      render: (_v: unknown, u) => (
        <Space>
          <UserAvatar user={u} tooltip={false} />
          <span>{u.name}</span>
          {u.id === me.id && <Tag>you</Tag>}
        </Space>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
      defaultSortOrder: 'ascend',
    },
    { title: 'Email', dataIndex: 'email' },
    {
      title: 'Role',
      key: 'role',
      width: 100,
      render: (_v: unknown, u) =>
        u.is_admin ? (
          <Tag color="gold" icon={<CrownOutlined />}>
            admin
          </Tag>
        ) : null,
    },
  ];

  if (isAdmin) {
    columns.push({
      title: '',
      key: 'actions',
      width: 260,
      render: (_v: unknown, u) => {
        const self = u.id === me.id;
        const adminButton = (
          <Button
            size="small"
            disabled={self}
            style={{ minWidth: 112 }}
            aria-label={`${u.is_admin ? 'Remove admin' : 'Make admin'} ${u.name}`}
          >
            {u.is_admin ? 'Remove admin' : 'Make admin'}
          </Button>
        );
        return (
          <Space size={6}>
            {self ? (
              <Tooltip title="You can't change your own admin role">{adminButton}</Tooltip>
            ) : (
              <Popconfirm
                title={u.is_admin ? `Remove admin rights from ${u.name}?` : `Make ${u.name} an admin?`}
                description={u.is_admin ? undefined : 'Admins manage users and invites and see all boards.'}
                okText={u.is_admin ? 'Remove admin' : 'Make admin'}
                onConfirm={() => toggleAdmin(u)}
              >
                {adminButton}
              </Popconfirm>
            )}
            <Button size="small" icon={<KeyOutlined />} onClick={() => setPasswordTarget(u)} aria-label={`Set password ${u.name}`}>
              Set password
            </Button>
          </Space>
        );
      },
    });
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <Typography.Title level={3} style={{ margin: 0 }}>
          Team
        </Typography.Title>
        {isAdmin && (
          <Space wrap>
            <Button icon={<LinkOutlined />} onClick={() => setInviteOpen(true)}>
              Invite with link
            </Button>
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
              Add user
            </Button>
          </Space>
        )}
      </div>

      {users.isPending ? (
        <div className="center-block">
          <Spin size="large" />
        </div>
      ) : users.isError ? (
        <Result
          status="error"
          title="Could not load the team"
          subTitle={getErrorMessage(users.error)}
          extra={<Button onClick={() => void users.refetch()}>Retry</Button>}
        />
      ) : (
        <Table<User>
          className="members-table"
          rowKey="id"
          columns={columns}
          dataSource={users.data}
          pagination={false}
          size="middle"
        />
      )}

      {isAdmin && (
        <>
          <Typography.Title level={4} style={{ marginTop: 32 }}>
            Invites
          </Typography.Title>
          <InvitesTable />
          <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} />
          <SetPasswordModal target={passwordTarget} onClose={() => setPasswordTarget(null)} />
          <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
        </>
      )}
    </div>
  );
}
