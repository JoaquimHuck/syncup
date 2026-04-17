import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, Settings, Sun, Moon, LogOut, Calendar, BarChart2 } from 'lucide-react';
import { useStore } from '../../store';
import { authApi } from '../../services/api';
import clsx from 'clsx';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { darkMode, toggleDarkMode, user, setUser } = useStore();
  const location = useLocation();

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const navItems = [
    { path: '/', icon: MessageSquare, label: 'Chat' },
    { path: '/calendar', icon: Calendar, label: 'Calendar' },
    { path: '/insights', icon: BarChart2, label: 'Insights' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Sidebar */}
      <aside className="w-16 md:w-64 flex-shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            <span className="hidden md:block font-semibold text-lg text-slate-900 dark:text-white">
              SyncUp
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700',
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="hidden md:block">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="p-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
          <button
            onClick={toggleDarkMode}
            className="btn-ghost w-full justify-start gap-3 px-3 py-2.5"
          >
            {darkMode ? (
              <Sun className="w-5 h-5 flex-shrink-0" />
            ) : (
              <Moon className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="hidden md:block text-sm">{darkMode ? 'Light mode' : 'Dark mode'}</span>
          </button>

          {/* User info */}
          <div className="hidden md:flex items-center gap-3 px-3 py-2">
            <div className="w-7 h-7 bg-brand-100 dark:bg-brand-900 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                {user?.name?.charAt(0).toUpperCase() ?? '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                {user?.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="btn-ghost p-1" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile logout */}
          <button onClick={handleLogout} className="btn-ghost md:hidden w-full px-3 py-2.5 justify-start gap-3">
            <LogOut className="w-5 h-5 flex-shrink-0" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
