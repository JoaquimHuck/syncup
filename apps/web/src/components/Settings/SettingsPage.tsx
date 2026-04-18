import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { contactsApi } from '../../services/api';
import CalendarSection from './CalendarSection';
import ContactsSection from './ContactsSection';
import PreferencesSection from './PreferencesSection';
import LoadingSpinner from '../Common/LoadingSpinner';

export default function SettingsPage() {
  const { setContacts } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    contactsApi
      .list()
      .then((res) => setContacts(res.data))
      .catch(() => {
        setError('Failed to load contacts. Please refresh the page.');
      })
      .finally(() => setLoading(false));
  }, [setContacts]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Manage your calendar connections, contacts, and scheduling preferences.
          </p>
        </div>

        <CalendarSection />
        <ContactsSection />
        <PreferencesSection />
      </div>
    </div>
  );
}
