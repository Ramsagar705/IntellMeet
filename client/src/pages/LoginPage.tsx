import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedRedirect = searchParams.get('redirect');
  const redirect = requestedRedirect?.startsWith('/') && !requestedRedirect.startsWith('//')
    ? requestedRedirect
    : '/dashboard';
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    try {
      await login(form);
      navigate(redirect);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Login failed';
      setError(message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="glass w-full max-w-5xl overflow-hidden rounded-3xl shadow-2xl shadow-sky-950/30">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 p-8 text-white md:p-12">
            <div className="mb-6 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-sky-100">
              IntellMeet
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Turn meetings into momentum.</h1>
            <p className="mt-4 max-w-md text-sm text-sky-100/90">
              AI meeting intelligence, action items, collaboration, and analytics for enterprise teams that move fast.
            </p>

            <div className="mt-10 space-y-4 text-sm text-sky-50">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="font-semibold">Operational visibility</p>
                <p className="mt-2 text-sky-100">Track decisions, owners, risks, and project velocity in one workspace.</p>
              </div>
            </div>
          </div>

          <div className="p-8 md:p-12">
            <div className="mb-8">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-300">Welcome back</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Sign in</h2>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none ring-0 transition focus:border-sky-500"
                  placeholder="name@company.com"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                  placeholder="••••••••"
                  required
                />
              </label>

              {error ? <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-sky-500 px-4 py-3 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-between text-sm text-slate-300">
              <button type="button" className="text-sky-300 hover:text-sky-200">
                Forgot password?
              </button>
              <Link to={`/register?redirect=${encodeURIComponent(redirect)}`} className="font-medium text-sky-300 hover:text-sky-200">
                Create account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
