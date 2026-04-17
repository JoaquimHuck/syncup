import { useEffect, useState } from 'react';
import { Users, Calendar, TrendingUp, Building2, Globe } from 'lucide-react';
import { insightsApi } from '../../services/api';
import { InsightsData } from '@syncup/shared';
import LoadingSpinner from '../Common/LoadingSpinner';

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    insightsApi
      .get()
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load insights.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-red-500">{error ?? 'No data'}</p>
      </div>
    );
  }

  const totalIntExt = data.internalCount + data.externalCount || 1;
  const internalPct = Math.round((data.internalCount / totalIntExt) * 100);
  const externalPct = 100 - internalPct;

  const maxMonthly = Math.max(...data.monthlyTrend.map((m) => m.count), 1);
  const maxContact = Math.max(...data.topContacts.map((c) => c.count), 1);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Insights</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            A summary of your meeting activity and patterns.
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Calendar} label="Total meetings" value={data.totalMeetings} color="brand" />
          <StatCard icon={TrendingUp} label="This month" value={data.meetingsThisMonth} color="green" />
          <StatCard icon={Users} label="People met" value={data.uniqueContacts} color="purple" />
          <StatCard
            icon={Globe}
            label="External"
            value={data.externalCount}
            sub={`${externalPct}% of meetings`}
            color="orange"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Internal vs External */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              Internal vs External
            </h2>
            {data.totalMeetings === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No meetings yet</p>
            ) : (
              <div className="space-y-3">
                <BarRow
                  label="Internal"
                  count={data.internalCount}
                  pct={internalPct}
                  color="bg-brand-500"
                />
                <BarRow
                  label="External"
                  count={data.externalCount}
                  pct={externalPct}
                  color="bg-orange-400"
                />
                <p className="text-xs text-slate-400 pt-1">
                  Internal = same email domain as you. External = different company.
                </p>
              </div>
            )}
          </div>

          {/* Monthly trend */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              Meetings per month
            </h2>
            {data.totalMeetings === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No meetings yet</p>
            ) : (
              <div className="flex items-end gap-2 h-28">
                {data.monthlyTrend.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {m.count > 0 ? m.count : ''}
                    </span>
                    <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                      <div
                        className="w-full rounded-t-md bg-brand-500 dark:bg-brand-600 transition-all"
                        style={{ height: `${Math.max((m.count / maxMonthly) * 80, m.count > 0 ? 4 : 0)}px` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{m.month}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top contacts */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            Most met people
          </h2>
          {data.topContacts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No meetings yet</p>
          ) : (
            <div className="space-y-3">
              {data.topContacts.map((c) => (
                <div key={c.email} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-brand-700 dark:text-brand-400">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {c.name}
                        </span>
                        {c.company && (
                          <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {c.company}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                        {c.count} meeting{c.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                      <div
                        className="bg-brand-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${(c.count / maxContact) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Sub-components ----

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
  color: 'brand' | 'green' | 'purple' | 'orange';
}) {
  const colors = {
    brand: 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
  };

  return (
    <div className="card p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarRow({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>{label}</span>
        <span>{count} ({pct}%)</span>
      </div>
      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
