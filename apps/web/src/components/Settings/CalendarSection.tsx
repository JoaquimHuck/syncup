import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useStore } from '../../store';
import { api, calendarApi } from '../../services/api';

export default function CalendarSection() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const connected = user?.calendarProvider === 'google';

  // Pick up ?calendar_connected= or ?calendar_error= from the OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_connected') === 'google') {
      setStatusMsg('Google Calendar connected!');
      // refresh user so the UI reflects the new provider
      api.getMe().then((u) => { if (u) setUser(u); });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('calendar_error')) {
      const code = params.get('calendar_error');
      setStatusMsg(
        code === 'credentials_missing'
          ? 'Google credentials are not configured on the server.'
          : `Connection failed: ${code}`,
      );
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [setUser]);

  async function handleSync() {
    setSyncing(true);
    setStatusMsg(null);
    try {
      const res = await calendarApi.sync();
      setStatusMsg(res.data.message);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Sync failed. Please try again.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await api.disconnectCalendar('google');
      const u = await api.getMe();
      if (u) setUser(u);
      setStatusMsg('Google Calendar disconnected.');
    } catch {
      setStatusMsg('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
        Calendar Connection
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Connect your Google Calendar so SyncUp can check your availability and create events.
      </p>

      {statusMsg && (
        <div className={`flex items-center gap-2 text-sm mb-4 p-3 rounded-lg ${
          statusMsg.includes('connected') || statusMsg.includes('Connected')
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
        }`}>
          {statusMsg.toLowerCase().includes('fail') || statusMsg.toLowerCase().includes('error') || statusMsg.toLowerCase().includes('not configured')
            ? <AlertCircle className="w-4 h-4 flex-shrink-0" />
            : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
          {statusMsg}
        </div>
      )}

      {connected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">Google Calendar connected</p>
                <p className="text-xs text-green-600 dark:text-green-500">SyncUp can read your availability and create events</p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 flex items-center gap-1"
            >
              {disconnecting && <Loader2 className="w-3 h-3 animate-spin" />}
              Disconnect
            </button>
          </div>

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing calendar…' : 'Sync from Google Calendar'}
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Imports your last 3 months + next 6 months of events. Also trains the AI on your past meeting patterns.
          </p>
        </div>
      ) : (
        <a
          href="/api/auth/google"
          className="inline-flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          {/* Google G logo */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Connect Google Calendar
          </span>
        </a>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
        Outlook and Apple Calendar coming soon.
      </p>
    </section>
  );
}
