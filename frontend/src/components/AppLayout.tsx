import { lazy, Suspense, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Dropdown, Layout, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { ApiOutlined, AppstoreOutlined, KeyOutlined, LogoutOutlined, ProjectOutlined, TeamOutlined } from '@ant-design/icons';
import { useCurrentUser, useAuth } from '../auth/AuthContext';
import { UserAvatar } from './UserAvatar';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ThemeToggle } from './ThemeToggle';

// Code-split: the modal pulls in Table/Tabs, which nothing on the initial page load needs.
const ConnectClaudeModal = lazy(() => import('./ConnectClaudeModal').then((m) => ({ default: m.ConnectClaudeModal })));

export function AppLayout() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectMounted, setConnectMounted] = useState(false);

  const menuItems: MenuProps['items'] = [
    {
      key: 'who',
      type: 'group',
      label: (
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontWeight: 600 }}>{user.name}</div>
          <div style={{ fontSize: 12 }}>{user.email}</div>
        </div>
      ),
    },
    { type: 'divider' },
    { key: 'connect', icon: <ApiOutlined />, label: 'Connect to Claude' },
    { key: 'password', icon: <KeyOutlined />, label: 'Change password' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Log out', danger: true },
  ];

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'connect') {
      setConnectMounted(true);
      setConnectOpen(true);
    }
    if (key === 'password') setPasswordOpen(true);
    if (key === 'logout') {
      logout();
      navigate('/login', { replace: true });
    }
  };

  const onBoardsPage = location.pathname === '/' || location.pathname.startsWith('/boards');
  const onTeamPage = location.pathname === '/team';

  return (
    <Layout className="app-layout">
      <Layout.Header className="app-header">
        <Space size={20} align="center">
          <Link to="/" className="app-brand">
            <ProjectOutlined />
            <span>TeamBoard</span>
          </Link>
          <nav className="app-nav" aria-label="Main">
            <Button
              type={onBoardsPage ? 'primary' : 'text'}
              ghost={onBoardsPage}
              icon={<AppstoreOutlined />}
              onClick={() => navigate('/')}
              aria-current={onBoardsPage ? 'page' : undefined}
            >
              Boards
            </Button>
            <Button
              type={onTeamPage ? 'primary' : 'text'}
              ghost={onTeamPage}
              icon={<TeamOutlined />}
              onClick={() => navigate('/team')}
              aria-current={onTeamPage ? 'page' : undefined}
            >
              Team
            </Button>
          </nav>
        </Space>
        <Space size={4} align="center">
          <ThemeToggle />
          <Dropdown menu={{ items: menuItems, onClick: onMenuClick }} trigger={['click']} placement="bottomRight">
            <button type="button" className="avatar-button" aria-label="Account menu">
              <UserAvatar user={user} tooltip={false} />
              <Typography.Text className="header-username">{user.name}</Typography.Text>
            </button>
          </Dropdown>
        </Space>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Outlet />
      </Layout.Content>
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      {connectMounted && (
        <Suspense fallback={null}>
          <ConnectClaudeModal open={connectOpen} onClose={() => setConnectOpen(false)} />
        </Suspense>
      )}
    </Layout>
  );
}
