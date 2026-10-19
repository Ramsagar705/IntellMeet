import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Check, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const getErrorMessage = (error: unknown) =>
  isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message || 'Could not process this invitation.'
    : 'Could not process this invitation.';

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.loading);
  const logout = useAuthStore((state) => state.logout);
  const invitationToken = searchParams.get('token') || '';
  const returnUrl = `${location.pathname}${location.search}`;
  const authUrl = (path: string) => `${path}?redirect=${encodeURIComponent(returnUrl)}`;

  const acceptInvitation = useMutation({
    mutationFn: async () => api.post('/invitations/accept', { token: invitationToken }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspaces-list'] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-options'] }),
      ]);
      navigate('/workspaces');
    },
  });

  const declineInvitation = useMutation({
    mutationFn: async () => api.post('/invitations/decline', { token: invitationToken }),
    onSuccess: () => navigate('/workspaces'),
  });

  const error = acceptInvitation.error || declineInvitation.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="glass w-full max-w-xl rounded-3xl p-6 shadow-2xl md:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Workspace invitation</p>
        <h1 className="mt-3 text-3xl font-bold text-white">You’ve been invited</h1>
        {!invitationToken ? (
          <p role="alert" className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200">
            This invitation link is missing its token. Ask the workspace administrator for a new link.
          </p>
        ) : authLoading ? (
          <p className="mt-5 text-slate-300">Checking your account...</p>
        ) : !token || !user ? (
          <>
            <p className="mt-4 text-slate-300">Sign in or create an account using the invited email address to continue.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={authUrl('/login')} className="rounded-xl bg-sky-500 px-4 py-2.5 font-medium text-white hover:bg-sky-400">Sign in</Link>
              <Link to={authUrl('/register')} className="rounded-xl border border-slate-700 px-4 py-2.5 font-medium text-slate-200 hover:border-sky-400">Create account</Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-slate-300">
              Signed in as <span className="font-medium text-white">{user.email}</span>. The invitation can only be accepted by the invited email address.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => acceptInvitation.mutate()}
                disabled={acceptInvitation.isPending || declineInvitation.isPending || !invitationToken}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 font-medium text-white hover:bg-sky-400 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {acceptInvitation.isPending ? 'Accepting...' : 'Accept invitation'}
              </button>
              <button
                type="button"
                onClick={() => declineInvitation.mutate()}
                disabled={acceptInvitation.isPending || declineInvitation.isPending || !invitationToken}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 font-medium text-slate-200 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                {declineInvitation.isPending ? 'Declining...' : 'Decline'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate(authUrl('/login'));
                }}
                className="rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:text-white"
              >
                Use another account
              </button>
            </div>
          </>
        )}
        {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{getErrorMessage(error)}</p> : null}
      </section>
    </div>
  );
}
