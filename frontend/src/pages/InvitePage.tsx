import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Card, Form, Input, Result, Spin, Typography } from 'antd';
import { LockOutlined, LogoutOutlined, MailOutlined, ProjectOutlined, UserOutlined } from '@ant-design/icons';
import { listBoards } from '../api/boards';
import { getErrorMessage } from '../api/client';
import { acceptInvite } from '../api/invites';
import type { InviteInfo } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useInviteInfo } from '../hooks/useTeam';
import { MIN_PASSWORD_LENGTH } from '../utils/password';

type Values = { name: string; email: string; password: string; confirm: string };

function AcceptForm({ token, info }: { token: string; info: InviteInfo }) {
  const { message } = App.useApp();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: Values) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await acceptInvite(token, {
        name: values.name.trim(),
        email: (info.email ?? values.email).trim().toLowerCase(),
        password: values.password,
      });
      loginWithToken(result);
      void message.success(`Welcome to TeamBoard, ${result.user.name}!`);
      // InviteInfo has board_title but no board_id: the new user is a member of only the invited
      // board, so look it up by title (falls back to the board list).
      let target = '/';
      if (info.board_title) {
        try {
          const boards = await listBoards();
          const match = boards.find((b) => b.title === info.board_title) ?? (boards.length === 1 ? boards[0] : undefined);
          if (match) target = `/boards/${match.id}`;
        } catch {
          // the board list will show it anyway
        }
      }
      navigate(target, { replace: true });
    } catch (err) {
      // 410: invalid/expired/used up, 409: email already registered, 422: validation
      setError(getErrorMessage(err, 'Could not accept the invite'));
      setSubmitting(false);
    }
  };

  return (
    <Form<Values>
      layout="vertical"
      requiredMark={false}
      initialValues={{ name: info.name ?? '', email: info.email ?? '' }}
      onFinish={(v) => void onFinish(v)}
      disabled={submitting}
    >
      <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter your name' }]}>
        <Input prefix={<UserOutlined />} autoComplete="name" autoFocus={!info.name} />
      </Form.Item>
      <Form.Item
        name="email"
        label="Email"
        rules={[
          { required: true, message: 'Enter your email' },
          { type: 'email', message: 'Enter a valid email' },
        ]}
        extra={info.email ? 'This invite is for this email address.' : undefined}
      >
        <Input prefix={<MailOutlined />} autoComplete="email" readOnly={Boolean(info.email)} />
      </Form.Item>
      <Form.Item
        name="password"
        label="Password"
        rules={[
          { required: true, message: 'Choose a password' },
          { min: MIN_PASSWORD_LENGTH, message: `At least ${MIN_PASSWORD_LENGTH} characters` },
        ]}
      >
        <Input.Password prefix={<LockOutlined />} autoComplete="new-password" autoFocus={Boolean(info.name)} />
      </Form.Item>
      <Form.Item
        name="confirm"
        label="Confirm password"
        dependencies={['password']}
        rules={[
          { required: true, message: 'Repeat the password' },
          ({ getFieldValue }) => ({
            validator: (_r, value: string | undefined) =>
              !value || getFieldValue('password') === value
                ? Promise.resolve()
                : Promise.reject(new Error('Passwords do not match')),
          }),
        ]}
      >
        <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
      </Form.Item>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} className="invite-error" />}
      <Button type="primary" htmlType="submit" block loading={submitting}>
        Create account and join
      </Button>
    </Form>
  );
}

/** Public sign-up page for invite links: /invite/:token (outside RequireAuth). */
export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading, logout } = useAuth();
  const info = useInviteInfo(token);

  let content;
  if (!token) {
    content = <Result status="error" title="Invalid invite link" />;
  } else if (info.isPending || loading) {
    content = (
      <div className="center-block-small">
        <Spin />
      </div>
    );
  } else if (info.isError) {
    content = <Result status="error" title="This invite can't be used" subTitle={getErrorMessage(info.error)} />;
  } else if (!info.data.valid) {
    content = (
      <Result
        status="error"
        title="This invite can't be used"
        subTitle={info.data.reason ?? 'The link is invalid, expired or already used. Ask for a new one.'}
      />
    );
  } else {
    const data = info.data;
    content = (
      <>
        <Typography.Paragraph className="invite-headline">
          <b>{data.invited_by}</b> invited you to TeamBoard.
          {data.board_title && (
            <>
              {' '}
              You'll join the board <i>{data.board_title}</i>.
            </>
          )}
        </Typography.Paragraph>
        {user ? (
          <Alert
            type="info"
            showIcon
            className="invite-logged-in"
            message={`You're logged in as ${user.name} — log out to accept this invite as a new user.`}
            action={
              <Button size="small" icon={<LogoutOutlined />} onClick={logout}>
                Log out
              </Button>
            }
          />
        ) : (
          <AcceptForm token={token} info={data} />
        )}
      </>
    );
  }

  return (
    <div className="login-page">
      <Card className="login-card consent-card" variant="borderless">
        <div className="login-brand">
          <ProjectOutlined />
          <Typography.Title level={3} style={{ margin: 0 }}>
            TeamBoard
          </Typography.Title>
        </div>
        {content}
      </Card>
    </div>
  );
}
