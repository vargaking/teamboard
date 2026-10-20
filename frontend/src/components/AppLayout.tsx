import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Dropdown, Layout, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { AppstoreOutlined, KeyOutlined, LogoutOutlined, ProjectOutlined } from '@ant-design/icons';
import { useCurrentUser, useAuth } from '../auth/AuthContext';
import { UserAvatar } from './UserAvatar';
import { ChangePasswordModal } from './ChangePasswordModal';

export function AppLayout() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [passwordOpen, setPasswordOpen] = useState(false);

  const menuItems: MenuProps['items'] = [
    {
      key: 'who',
      type: 'group',
      label: (
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>{user.name}</div>
          <div style={{ fontSize: 12 }}>{user.email}</div>
        </div>
      ),
    },
    { type: 'divider' },
    { key: 'password', icon: <KeyOutlined />, label: 'Change password' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Log out', danger: true },
  ];

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'password') setPasswordOpen(true);
    if (key === 'logout') {
      logout();
      navigate('/login', { replace: true });
    }
  };

  const onBoardsPage = location.pathname === '/';

  return (
    <Layout className="app-layout">
      <Layout.Header className="app-header">
        <Space size={20} align="center">
          <Link to="/" className="app-brand">
            <ProjectOutlined />
            <span>TeamBoard</span>
          </Link>
          <Button type={onBoardsPage ? 'primary' : 'text'} ghost={onBoardsPage} icon={<AppstoreOutlined />} onClick={() => navigate('/')}>
            Boards
          </Button>
        </Space>
        <Dropdown menu={{ items: menuItems, onClick: onMenuClick }} trigger={['click']} placement="bottomRight">
          <button type="button" className="avatar-button" aria-label="Account menu">
            <UserAvatar user={user} tooltip={false} />
            <Typography.Text className="header-username">{user.name}</Typography.Text>
          </button>
        </Dropdown>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Outlet />
      </Layout.Content>
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </Layout>
  );
}
