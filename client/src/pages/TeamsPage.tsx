import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { BriefcaseBusiness, Check, Copy, Mail, MailPlus, MapPin, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatar?: string;
}

interface Workspace {
  _id?: string;
  id?: string;
  name: string;
  owner: string;
  members?: Array<{ user: string; role?: string }>;
}

interface InvitationResult {
  invitationLink: string;
  emailSent: boolean;
  alreadyPending: boolean;
  message: string;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || fallback : fallback;

export default function TeamsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [workspaceId, setWorkspaceId] = useState('');
  const [invitationResult, setInvitationResult] = useState<InvitationResult | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const workspacesQuery = useQuery<Workspace[]>({
    queryKey: ['team-workspaces'],
    queryFn: async () => {
      const { data } = await api.get<Workspace[]>('/workspaces');
      return data;
    },
  });
  const workspaces = workspacesQuery.data || [];
  const activeWorkspaceId = workspaceId || workspaces[0]?._id || workspaces[0]?.id || '';
  const activeWorkspace = workspaces.find((workspace) =>
    (workspace._id || workspace.id) === activeWorkspaceId
  );
  const isWorkspaceOwner = Boolean(
    activeWorkspace &&
    user?.id &&
    (activeWorkspace.owner === user.id ||
      activeWorkspace.members?.some((member) => member.user === user.id && member.role === 'owner'))
  );
  const canInvite = Boolean(
    activeWorkspace &&
    user?.id &&
    (isWorkspaceOwner ||
      activeWorkspace.members?.some((member) => member.user === user.id && member.role === 'admin'))
  );

  const membersQuery = useQuery<{ members: TeamMember[] }>({
    queryKey: ['team-members', activeWorkspaceId],
    queryFn: async () => {
      const { data } = await api.get<{ members: TeamMember[] }>(`/workspaces/${activeWorkspaceId}/members`);
      return data;
    },
    enabled: Boolean(activeWorkspaceId),
  });

  const inviteMember = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<InvitationResult>(`/workspaces/${activeWorkspaceId}/members`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      return data;
    },
    onSuccess: async (data) => {
      setInviteEmail('');
      setInviteRole('member');
      setInvitationResult(data);
      setCopiedLink(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-members', activeWorkspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-invitations', activeWorkspaceId] }),
      ]);
    },
  });

  const members = membersQuery.data?.members || [];

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Teams</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Delivery org and owners</h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
            <Sparkles className="h-4 w-4 text-sky-300" />
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </div>
        </div>

        {workspacesQuery.isLoading ? (
          <div className="glass mb-8 rounded-3xl p-5 text-slate-300">Loading workspaces...</div>
        ) : null}
        {workspacesQuery.isError ? (
          <div role="alert" className="glass mb-8 rounded-3xl p-5 text-rose-300">
            {getErrorMessage(workspacesQuery.error, 'Could not load workspaces.')}
          </div>
        ) : null}
        {!workspacesQuery.isLoading && !workspacesQuery.isError && workspaces.length === 0 ? (
          <div className="glass mb-8 rounded-3xl p-5 text-slate-300">
            Create or join a workspace before inviting teammates.
          </div>
        ) : null}

        {workspaces.length > 0 ? (
          <>
            <div className="glass mb-8 rounded-3xl p-5">
              <h2 className="mb-4 text-xl font-semibold text-white">Invite teammate</h2>
              <form
                className="grid gap-3 md:grid-cols-[1fr_1fr_0.8fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  setInvitationResult(null);
                  inviteMember.mutate();
                }}
              >
                {workspaces.length > 1 ? (
                  <select
                    value={activeWorkspaceId}
                    onChange={(event) => {
                      setWorkspaceId(event.target.value);
                      setInvitationResult(null);
                    }}
                    aria-label="Workspace to invite to"
                    className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white"
                  >
                    {workspaces.map((workspace) => {
                      const id = workspace._id || workspace.id || '';
                      return <option key={id} value={id}>{workspace.name}</option>;
                    })}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">
                    <BriefcaseBusiness className="h-4 w-4 text-sky-300" />
                    {activeWorkspace?.name}
                  </div>
                )}
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white"
                  placeholder="teammate@company.com"
                  aria-label="Teammate email address"
                  required
                />
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as 'member' | 'admin')}
                  className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white"
                  aria-label="Invitation role"
                >
                  <option value="member">Member</option>
                  {isWorkspaceOwner ? <option value="admin">Admin</option> : null}
                </select>
                <button
                  type="submit"
                  disabled={!canInvite || !inviteEmail.trim() || inviteMember.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 font-medium text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {inviteMember.isPending ? 'Sending...' : 'Invite'}
                </button>
              </form>
              {!canInvite ? (
                <p className="mt-2 text-sm text-amber-200">Only workspace owners and admins can invite teammates.</p>
              ) : null}
              {inviteMember.isError ? (
                <p role="alert" className="mt-3 text-sm text-rose-300">
                  {getErrorMessage(inviteMember.error, 'Could not create invitation.')}
                </p>
              ) : null}
              {invitationResult ? (
                <div className={`mt-3 rounded-xl border p-3 ${invitationResult.alreadyPending ? 'border-sky-500/30 bg-sky-500/10' : invitationResult.emailSent ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                  <p role="status" className={`flex items-center gap-2 text-sm font-medium ${invitationResult.alreadyPending ? 'text-sky-200' : invitationResult.emailSent ? 'text-emerald-200' : 'text-amber-200'}`}>
                    {invitationResult.emailSent ? <Check className="h-4 w-4" /> : <MailPlus className="h-4 w-4" />}
                    {invitationResult.alreadyPending
                      ? 'Invitation already pending'
                      : invitationResult.emailSent
                        ? 'Invitation created and email accepted for delivery'
                        : 'Invitation created, but email delivery failed'}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">{invitationResult.message}</p>
                  {!invitationResult.emailSent ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        readOnly
                        value={invitationResult.invitationLink}
                        aria-label="Invitation link"
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(invitationResult.invitationLink)
                            .then(() => setCopiedLink(true))
                            .catch(() => setCopiedLink(false));
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedLink ? 'Copied' : 'Copy link'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {membersQuery.isLoading ? <p className="mb-4 text-sm text-slate-300">Loading members...</p> : null}
            {membersQuery.isError ? (
              <p role="alert" className="mb-4 text-sm text-rose-300">
                {getErrorMessage(membersQuery.error, 'Could not load workspace members.')}
              </p>
            ) : null}
            {!membersQuery.isLoading && !membersQuery.isError && members.length === 0 ? (
              <div className="glass rounded-3xl p-5 text-slate-300">No workspace members found.</div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {members.map((member) => (
                <div key={member.userId} className="glass rounded-3xl p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 font-semibold text-white">
                      {member.name.slice(0, 1)}
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${member.status === 'online' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-600 bg-slate-900/80 text-slate-300'}`}>
                      {member.status}
                    </span>
                  </div>

                  <div className="mt-5">
                    <h2 className="text-lg font-semibold text-white">{member.name}</h2>
                    <p className="mt-1 text-sm text-sky-200">{member.role}</p>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                      <BriefcaseBusiness className="h-4 w-4 text-slate-400" />
                      {member.role === 'owner' ? 'Workspace owner' : member.role === 'admin' ? 'Admin access' : 'Team member'}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      Remote / distributed
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      {member.email}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
