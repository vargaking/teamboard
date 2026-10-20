import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './AuthContext';
import { loginRouteFor } from '../utils/basePath';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="center-screen">
        <Spin size="large" />
      </div>
    );
  }
  if (user === null) {
    // Preserve the full path + query (e.g. the OAuth consent request) through the login.
    return <Navigate to={loginRouteFor(`${location.pathname}${location.search}`)} replace />;
  }
  return <>{children}</>;
}
