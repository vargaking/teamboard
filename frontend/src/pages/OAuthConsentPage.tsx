import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Result, Space, Spin, Tag, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, ProjectOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import { useCurrentUser } from '../auth/AuthContext';
import { UserAvatar } from '../components/UserAvatar';
import { useConsentDecision, useConsentInfo } from '../hooks/useMcp';

/**
 * OAuth consent for MCP clients (claude.ai connector). Used mid-flow: minimal UI, no app header.
 * `?req=` is an opaque request id from the backend's authorize endpoint.
 */
export function OAuthConsentPage() {
  const user = useCurrentUser();
  const [searchParams] = useSearchParams();
  const req = searchParams.get('req');
  const info = useConsentInfo(req);
  const decision = useConsentDecision();
  const [choice, setChoice] = useState<boolean | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const decide = (approve: boolean) => {
    if (!req) return;
    setChoice(approve);
    decision.mutate(
      { req, approve },
      {
        onSuccess: ({ redirect_to }) => {
          setRedirecting(true);
          window.location.assign(redirect_to);
        },
      },
    );
  };

  let content;
  if (!req) {
    content = (
      <Result status="error" title="Invalid authorization request" subTitle="The link is missing its request id." />
    );
  } else if (info.isPending) {
    content = (
      <div className="center-block-small">
        <Spin />
      </div>
    );
  } else if (info.isError || decision.isError) {
    content = (
      <Result
        status="error"
        title="Authorization failed"
        subTitle={getErrorMessage(info.error ?? decision.error, 'The authorization request is invalid or expired.')}
      />
    );
  } else if (redirecting) {
    content = (
      <Result
        icon={<Spin size="large" />}
        title={choice ? 'Access granted' : 'Access denied'}
        subTitle={`Returning to ${info.data.client_name}...`}
      />
    );
  } else {
    const { client_name, scopes, redirect_host } = info.data;
    content = (
      <>
        <div className="consent-who">
          <UserAvatar user={user} size={40} tooltip={false} />
          <Typography.Paragraph className="consent-text">
            <b>{client_name}</b> wants to access TeamBoard as <i>{user.name}</i> ({user.email}).
          </Typography.Paragraph>
        </div>
        {scopes.length > 0 && (
          <div className="consent-scopes">
            <Typography.Text type="secondary">Requested access:</Typography.Text>
            <div>
              {scopes.map((s) => (
                <Tag key={s}>{s}</Tag>
              ))}
            </div>
          </div>
        )}
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          It will be able to read and change the boards you can, acting as you. After you decide you will be sent
          back to <Typography.Text code>{redirect_host}</Typography.Text>. You can revoke access at any time.
        </Typography.Paragraph>
        <Space className="consent-actions">
          <Button
            icon={<CloseOutlined />}
            onClick={() => decide(false)}
            loading={decision.isPending && choice === false}
            disabled={decision.isPending}
          >
            Deny
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={() => decide(true)}
            loading={decision.isPending && choice === true}
            disabled={decision.isPending}
            autoFocus
          >
            Allow
          </Button>
        </Space>
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
