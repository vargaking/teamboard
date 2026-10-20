import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { BoardsPage } from './pages/BoardsPage';
import { BoardPage } from './pages/BoardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OAuthConsentPage } from './pages/OAuthConsentPage';
import { InvitePage } from './pages/InvitePage';

// Code-split: the team page (tables, admin modals) isn't needed on the initial load.
const TeamPage = lazy(() => import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })));

const pageFallback = (
  <div className="center-block">
    <Spin size="large" />
  </div>
);

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route
        path="/oauth/consent"
        element={
          <RequireAuth>
            <OAuthConsentPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<BoardsPage />} />
        <Route path="boards/:id" element={<BoardPage />} />
        <Route
          path="team"
          element={
            <Suspense fallback={pageFallback}>
              <TeamPage />
            </Suspense>
          }
        />
        <Route path="boards" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
