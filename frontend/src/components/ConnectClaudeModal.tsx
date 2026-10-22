import { useState, type ReactNode } from 'react';
import {
  Alert,
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Result,
  Space,
  Spin,
  Table,
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { ApiOutlined, DeleteOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import type { McpInfo, PersonalToken, PersonalTokenCreated } from '../api/types';
import { useCreateToken, useMcpInfo, useRevokeToken, useTokens } from '../hooks/useMcp';
import { parseTimestamp } from '../utils/dates';
import { CopyField } from './CopyField';

type Props = { open: boolean; onClose: () => void };

const TOKEN_PLACEHOLDER = '<token>';

export function claudeCodeCommand(mcpUrl: string, token: string = TOKEN_PLACEHOLDER): string {
  return `claude mcp add --transport http teamboard ${mcpUrl} --header "Authorization: Bearer ${token}"`;
}

function Timestamp({ value }: { value: string | null }) {
  if (!value) return <Typography.Text type="secondary">Never</Typography.Text>;
  const t = parseTimestamp(value);
  return (
    <Tooltip title={t.format('YYYY-MM-DD HH:mm')}>
      <span>{t.fromNow()}</span>
    </Tooltip>
  );
}

/** OAuth (claude.ai / ChatGPT) needs HTTPS; same warning on both OAuth tabs. */
function OAuthUnavailableAlert() {
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 16 }}
      message="OAuth needs the app to be served over HTTPS (PUBLIC_URL). Use a personal token with Claude Code or another MCP client instead."
    />
  );
}

function StepList({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="connect-steps">
      {steps.map((step, i) => (
        <li key={i}>
          <span className="connect-step-number">{i + 1}</span>
          <div className="connect-step-body">{step}</div>
        </li>
      ))}
    </ol>
  );
}

function ChatGptTab({ info }: { info: McpInfo }) {
  const steps = [
    <>
      In ChatGPT, open <b>Settings</b> → <b>Apps &amp; Connectors</b> (needs a paid plan).
    </>,
    <>
      Enable <b>Developer mode</b> (under <b>Advanced settings</b>).
    </>,
    <>
      Click <b>Create</b> and paste the TeamBoard MCP URL:
      <CopyField value={info.mcp_url} label="MCP URL" />
    </>,
    <>
      Click <b>Create</b>, then on the consent page log in with your <b>TeamBoard account</b> and click <b>Allow</b>.
    </>,
    <>
      Done. In a chat, enable the <b>TeamBoard</b> connector from the tools menu.
    </>,
  ];
  return (
    <div>
      {!info.oauth_enabled && <OAuthUnavailableAlert />}
      <StepList steps={steps} />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
        ChatGPT connects with OAuth only; personal tokens are for the API/Codex.
      </Typography.Paragraph>
    </div>
  );
}

function ClaudeAiTab({ info }: { info: McpInfo }) {
  const steps = [
    <>
      In claude.ai, open <b>Settings</b> → <b>Connectors</b>.
    </>,
    <>
      Click <b>Add custom connector</b>.
    </>,
    <>
      Paste the TeamBoard MCP URL:
      <CopyField value={info.mcp_url} label="MCP URL" />
    </>,
    <>
      Click <b>Connect</b>.
    </>,
    <>
      On the consent page, log in with your <b>TeamBoard account</b> and click <b>Allow</b>.
    </>,
    <>Done. Claude can now read and update your boards (as you, with your permissions).</>,
  ];
  return (
    <div>
      {!info.oauth_enabled && <OAuthUnavailableAlert />}
      <StepList steps={steps} />
    </div>
  );
}

function ClaudeCodeTab({ info }: { info: McpInfo }) {
  const { message } = App.useApp();
  const tokens = useTokens(true);
  const createToken = useCreateToken();
  const revokeToken = useRevokeToken();
  const [form] = Form.useForm<{ name: string }>();
  // The secret is only ever held here, for this modal session.
  const [created, setCreated] = useState<PersonalTokenCreated | null>(null);

  const command = claudeCodeCommand(info.mcp_url, created?.token ?? TOKEN_PLACEHOLDER);

  const columns: TableColumnsType<PersonalToken> = [
    { title: 'Name', dataIndex: 'name', ellipsis: true },
    {
      title: 'Prefix',
      dataIndex: 'prefix',
      width: 130,
      render: (prefix: string) => <Typography.Text code>{prefix}…</Typography.Text>,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      width: 120,
      render: (v: string) => <Timestamp value={v} />,
    },
    {
      title: 'Last used',
      dataIndex: 'last_used_at',
      width: 120,
      render: (v: string | null) => <Timestamp value={v} />,
    },
    {
      title: '',
      key: 'revoke',
      width: 56,
      render: (_v: unknown, token) => (
        <Popconfirm
          title={`Revoke "${token.name}"?`}
          description="Clients using this token stop working immediately."
          okText="Revoke"
          okButtonProps={{ danger: true }}
          onConfirm={() =>
            revokeToken.mutateAsync(token.id).then(
              () => {
                void message.success('Token revoked');
                if (created?.id === token.id) setCreated(null);
              },
              (err: unknown) => void message.error(getErrorMessage(err, 'Could not revoke token')),
            )
          }
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label={`Revoke ${token.name} (${token.prefix})`} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          Run this in a terminal to add TeamBoard to Claude Code
          {created ? ' (it already contains your new token):' : ', replacing <token> with a personal token:'}
        </Typography.Paragraph>
        <CopyField value={command} label="command" block />
      </div>

      {created && (
        <Alert
          type="warning"
          showIcon
          className="new-token-alert"
          message={`Token "${created.name}" created. Copy it now: it won't be shown again.`}
          description={<CopyField value={created.token} label="token" />}
          closable
          onClose={() => setCreated(null)}
        />
      )}

      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          <KeyOutlined /> Personal tokens
        </Typography.Title>
        <Form
          form={form}
          layout="inline"
          className="new-token-form"
          onFinish={({ name }) =>
            createToken.mutate(name.trim(), {
              onSuccess: (token) => {
                setCreated(token);
                form.resetFields();
              },
              onError: (err) => void message.error(getErrorMessage(err, 'Could not create token')),
            })
          }
        >
          <Form.Item
            name="name"
            rules={[
              { required: true, whitespace: true, message: 'Name the token' },
              { max: 100, message: 'Keep it under 100 characters' },
            ]}
            style={{ flex: 1 }}
          >
            <Input placeholder="Token name, e.g. 'Claude Code on my laptop'" aria-label="Token name" />
          </Form.Item>
          <Form.Item style={{ marginInlineEnd: 0 }}>
            <Button htmlType="submit" type="primary" icon={<PlusOutlined />} loading={createToken.isPending}>
              New token
            </Button>
          </Form.Item>
        </Form>
        {tokens.isError ? (
          <Alert type="error" showIcon message="Could not load tokens" description={getErrorMessage(tokens.error)} />
        ) : (
          <Table<PersonalToken>
            size="small"
            rowKey="id"
            loading={tokens.isPending}
            columns={columns}
            dataSource={tokens.data ?? []}
            pagination={false}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tokens yet" /> }}
          />
        )}
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          A token acts as you: anyone holding it can read and change the boards you can. Revoke tokens you no longer
          use.
        </Typography.Paragraph>
      </div>
    </Space>
  );
}

export function ConnectClaudeModal({ open, onClose }: Props) {
  const info = useMcpInfo(open);

  let body;
  if (info.isPending) {
    body = (
      <div className="center-block-small">
        <Spin />
      </div>
    );
  } else if (info.isError) {
    body = (
      <Result
        status="error"
        title="Could not load connection details"
        subTitle={getErrorMessage(info.error)}
        extra={<Button onClick={() => void info.refetch()}>Retry</Button>}
      />
    );
  } else {
    body = (
      <Tabs
        defaultActiveKey={info.data.oauth_enabled ? 'claude-ai' : 'claude-code'}
        items={[
          { key: 'claude-ai', label: 'claude.ai', children: <ClaudeAiTab info={info.data} /> },
          { key: 'chatgpt', label: 'ChatGPT', children: <ChatGptTab info={info.data} /> },
          {
            key: 'claude-code',
            label: 'Claude Code / other clients',
            children: <ClaudeCodeTab info={info.data} />,
          },
        ]}
      />
    );
  }

  return (
    <Modal
      title={
        <Space>
          <ApiOutlined />
          Connect an AI assistant
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      width={720}
      destroyOnHidden
      className="connect-claude-modal"
    >
      <Typography.Paragraph type="secondary">
        TeamBoard is an MCP server: connect Claude, ChatGPT or any MCP client to read and update your boards — as you,
        with your permissions.
      </Typography.Paragraph>
      {body}
    </Modal>
  );
}
