import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Matches from './pages/Matches';
import MatchDetail from './pages/MatchDetail';
import Bets from './pages/Bets';
import Groups from './pages/Groups';
import GroupDetail from './pages/GroupDetail';
import Rankings from './pages/Rankings';
import Statistics from './pages/Statistics';
import Notifications from './pages/Notifications';
import Admin from './pages/Admin';
import AdminCompetitions from './pages/AdminCompetitions';
import AdminCompetitionDetail from './pages/AdminCompetitionDetail';
import AdminStageDetail from './pages/AdminStageDetail';
import AdminMatchDetail from './pages/AdminMatchDetail';
import ChangePassword from './pages/ChangePassword';
import Install from './pages/Install';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="matches" element={<Matches />} />
        <Route path="matches/:id" element={<MatchDetail />} />
        <Route path="bets" element={<Bets />} />
        <Route path="groups" element={<Groups />} />
        <Route path="groups/:id" element={<GroupDetail />} />
        <Route path="rankings" element={<Rankings />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="admin/competitii" element={<AdminRoute><AdminCompetitions /></AdminRoute>} />
        <Route path="admin/competitii/:competitionId" element={<AdminRoute><AdminCompetitionDetail /></AdminRoute>} />
        <Route path="admin/competitii/:competitionId/etape/:matchday" element={<AdminRoute><AdminStageDetail /></AdminRoute>} />
        <Route path="admin/meciuri/:id" element={<AdminRoute><AdminMatchDetail /></AdminRoute>} />
        <Route path="change-password" element={<ChangePassword />} />
        <Route path="install" element={<Install />} />
      </Route>
    </Routes>
  );
}
