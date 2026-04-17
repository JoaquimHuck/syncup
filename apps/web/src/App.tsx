import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { authApi } from './services/api';
import Layout from './components/Common/Layout';
import ChatPage from './components/Chat/ChatPage';
import CalendarPage from './components/Calendar/CalendarPage';
import InsightsPage from './components/Insights/InsightsPage';
import SettingsPage from './components/Settings/SettingsPage';
import LoginPage from './components/Common/LoginPage';
import LoadingSpinner from './components/Common/LoadingSpinner';

export default function App() {
  const { user, isLoading, setUser, setLoading } = useStore();

  // Attempt to restore session on app load
  useEffect(() => {
    authApi
      .me()
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [setUser, setLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
