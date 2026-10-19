import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Shell from './components/Shell';
import AnalyticsPage from './pages/AnalyticsPage';
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import DashboardPage from './pages/DashboardPage';
import KanbanPage from './pages/KanbanPage';
import LoginPage from './pages/LoginPage';
import MeetingRoomLobbyPage from './pages/MeetingRoomLobbyPage';
import MeetingsPage from './pages/MeetingsPage';
import ProfilePage from './pages/ProfilePage';
import RegisterPage from './pages/RegisterPage';
import TeamsPage from './pages/TeamsPage';
import WorkspacePage from './pages/WorkspacePage';
import useAuthStore from './store/authStore';

export default function App() {
  const token = useAuthStore((state) => state.token);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to={token ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/invitations/accept" element={<AcceptInvitationPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/workspaces" element={<WorkspacePage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/room/:meetingId" element={null} />
        <Route path="/meetings/:meetingId/room" element={null} />
        <Route path="/room" element={<MeetingRoomLobbyPage />} />
        <Route path="/teams" element={<TeamsPage />} />
        <Route path="/kanban" element={<KanbanPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to={token ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
