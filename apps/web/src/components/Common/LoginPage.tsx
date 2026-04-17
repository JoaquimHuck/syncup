import { useState, FormEvent } from 'react';
import { Calendar } from 'lucide-react';
import { authApi } from '../../services/api';
import { useStore } from '../../store';
import LoadingSpinner from './LoadingSpinner';

export default function LoginPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const setUser = useStore((s) => s.setUser);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await authApi.register(name, email);
      setUser(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-brand-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl shadow-lg mb-4">
            <Calendar className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">SyncUp</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            AI-powered scheduling for your team
          </p>
        </div>

        {/* Login card */}
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
            Get started
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="name">
                Your name
              </label>
              <input
                id="name"
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Joaquim"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={isLoading}>
              {isLoading ? <LoadingSpinner size="sm" /> : null}
              {isLoading ? 'Signing in...' : 'Continue with email'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Already have an account? Just enter your existing email — we'll sign you in
            automatically.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          You'll connect your calendar in the next step
        </p>
      </div>
    </div>
  );
}
