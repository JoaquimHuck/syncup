import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { useStore } from '../../store';
import { authApi } from '../../services/api';
import { UserPreferences } from '@syncup/shared';
import LoadingSpinner from '../Common/LoadingSpinner';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PreferencesSection() {
  const { user, setUser } = useStore();
  const [prefs, setPrefs] = useState<UserPreferences>({
    workingHoursStart: '09:00',
    workingHoursEnd: '18:00',
    workingDays: [1, 2, 3, 4, 5],
    bufferMinutes: 15,
    timezone: 'America/New_York',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user?.preferences) {
      setPrefs(user.preferences);
    }
  }, [user]);

  const toggleDay = (day: number) => {
    setPrefs((p) => ({
      ...p,
      workingDays: p.workingDays.includes(day)
        ? p.workingDays.filter((d) => d !== day)
        : [...p.workingDays, day].sort(),
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await authApi.updatePreferences(prefs);
      if (user) setUser({ ...user, preferences: prefs });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save preferences', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
        Scheduling Preferences
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
        These settings help the AI suggest better meeting times for you.
      </p>

      <div className="space-y-5">
        {/* Timezone */}
        <div>
          <label className="label" htmlFor="timezone">Timezone</label>
          <select
            id="timezone"
            className="input"
            value={prefs.timezone}
            onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        {/* Working hours */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="start-time">Working hours start</label>
            <input
              id="start-time"
              type="time"
              className="input"
              value={prefs.workingHoursStart}
              onChange={(e) => setPrefs((p) => ({ ...p, workingHoursStart: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="end-time">Working hours end</label>
            <input
              id="end-time"
              type="time"
              className="input"
              value={prefs.workingHoursEnd}
              onChange={(e) => setPrefs((p) => ({ ...p, workingHoursEnd: e.target.value }))}
            />
          </div>
        </div>

        {/* Working days */}
        <div>
          <label className="label">Working days</label>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map((day, idx) => (
              <button
                key={day}
                onClick={() => toggleDay(idx)}
                className={`w-10 h-10 rounded-lg text-xs font-medium transition-all ${
                  prefs.workingDays.includes(idx)
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* Buffer time */}
        <div>
          <label className="label" htmlFor="buffer">
            Buffer time between meetings: <strong>{prefs.bufferMinutes} minutes</strong>
          </label>
          <input
            id="buffer"
            type="range"
            min={0}
            max={60}
            step={5}
            value={prefs.bufferMinutes}
            onChange={(e) => setPrefs((p) => ({ ...p, bufferMinutes: Number(e.target.value) }))}
            className="w-full accent-brand-600 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>0 min</span>
            <span>60 min</span>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary"
          >
            {isSaving ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Saving...' : 'Save preferences'}
          </button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400 font-medium">
              Saved!
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
