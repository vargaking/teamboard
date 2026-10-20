import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, MailOutlined, ProjectOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { getErrorMessage } from '../api/client';
import { safeNextPath } from '../utils/basePath';

type Values = { email: string; password: string };

export function LoginPage() {
  const { user, login } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeNextPath(searchParams.get('next'));
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const onFinish = async (values: Values) => {
    setSubmitting(true);
    try {
      await login(values.email.trim(), values.password);
      navigate(next, { replace: true });
    } catch (err) {
      void message.error(getErrorMessage(err, 'Login failed'));
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card" variant="borderless">
        <div className="login-brand">
          <ProjectOutlined />
          <Typography.Title level={3} style={{ margin: 0 }}>
            TeamBoard
          </Typography.Title>
        </div>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
          Sign in to your team's boards
        </Typography.Paragraph>
        <Form<Values> layout="vertical" onFinish={(v) => void onFinish(v)} requiredMark={false} size="large">
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Enter your email' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="you@teamboard.local" autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            Log in
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" className="login-hint">
          Seeded accounts: <Typography.Text code>&lt;firstname&gt;@teamboard.local</Typography.Text> /{' '}
          <Typography.Text code>changeme</Typography.Text>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
