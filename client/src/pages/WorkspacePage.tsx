import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { BriefcaseBusiness, Check, Copy, MailPlus, Pencil, Plus, Save, Shield, Trash2, UserMinus, Users, X } from 'lucide-react';
import { useState } from 'react';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

interface WorkspaceItem {
  _id?: string;
  id?: string;
  name: string;
  description?: string;
  owner: string;
  status?: string;
  members?: Array<{ user: string; role?: string; joinedAt?: string }>;
}

interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt?: string;
  avatar?: string;
}

interface WorkspaceInvitation {
  id: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  expiresAt: string;
  createdAt: string;
}

interface InvitationResult {
  invitationLink: string;
  emailSent: boolean;
  alreadyPending: boolean;
  message: string;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || fallback : fallback;

export default function WorkspacePage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [managingId, setManagingId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [invitationResult, setInvitationResult] = useState<InvitationResult | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const { data: workspaces = [], isLoading, isError, error } = useQuery<WorkspaceItem[]>({
    queryKey: ['workspaces-list'],
    queryFn: async () => {
      const { data } = await api.get('/workspaces');
      return data;
    },
  });

  const createWorkspace = useMutation({
    mutationFn: async () => api.post('/workspaces', { name, description }),
    onSuccess: async () => {
      setName('');
      setDescription('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspaces-list'] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-options'] }),
      ]);
    },
  });

  const updateWorkspace = useMutation({
    mutationFn: async (workspaceId: string) =>
      api.patch(`/workspaces/${workspaceId}`, { name: editName, description: editDescription }),
    onSuccess: async () => {
      setEditingId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspaces-list'] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-options'] }),
      ]);
    },
  });

  const deleteWorkspace = useMutation({
    mutationFn: async (workspaceId: string) => api.delete(`/workspaces/${workspaceId}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspaces-list'] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-options'] }),
      ]);
    },
  });

  const managedWorkspace = workspaces.find((workspace) => (workspace._id || workspace.id) === managingId);
  const isWorkspaceOwner = Boolean(managedWorkspace && user?.id && managedWorkspace.owner === user.id);
  const isWorkspaceAdmin = Boolean(
    managedWorkspace &&
      user?.id &&
      (isWorkspaceOwner ||
      managedWorkspace.members?.some(
        (member) =>
          member.user === user.id &&
          (member.role === 'admin' || member.role === 'owner')
      ))
  );

  const membersQuery = useQuery<{ members: WorkspaceMember[]; owner: string }>({
    queryKey: ['workspace-members', managingId],
    queryFn: async () => {
      const { data } = await api.get(`/workspaces/${managingId}/members`);
      return data;
    },
    enabled: Boolean(managingId),
  });

  const invitationsQuery = useQuery<WorkspaceInvitation[]>({
    queryKey: ['workspace-invitations', managingId],
    queryFn: async () => {
      const { data } = await api.get(`/workspaces/${managingId}/invitations`);
      return data;
    },
    enabled: Boolean(managingId && isWorkspaceAdmin),
  });

  const refreshWorkspaceData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workspace-members', managingId] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-invitations', managingId] }),
      queryClient.invalidateQueries({ queryKey: ['workspaces-list'] }),
      queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-options'] }),
    ]);
  };

  const inviteMember = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/workspaces/${managingId}/members`, {
        email: inviteEmail,
        role: inviteRole,
      });
      return data as InvitationResult;
    },
    onSuccess: async (data) => {
      setInviteEmail('');
      setInvitationResult(data);
      setCopiedLink(false);
      await refreshWorkspaceData();
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => api.delete(`/workspaces/${managingId}/members/${userId}`),
    onSuccess: refreshWorkspaceData,
  });

  const changeMemberRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'member' }) =>
      api.patch(`/workspaces/${managingId}/members/${userId}/role`, { role }),
    onSuccess: refreshWorkspaceData,
  });

  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) =>
      api.delete(`/workspaces/${managingId}/invitations/${invitationId}`),
    onSuccess: refreshWorkspaceData,
  });

  const beginEdit = (workspace: WorkspaceItem) => {
    const id = workspace._id || workspace.id;
    if (!id) return;
    setEditingId(id);
    setEditName(workspace.name);
    setEditDescription(workspace.description || '');
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Workspaces</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Team collaboration hubs</h1>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById('workspace-name')?.focus()}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-400"
          >
            <Plus className="h-4 w-4" />
            New workspace
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass rounded-3xl p-5">
            <h2 className="mb-4 text-xl font-semibold text-white">Create workspace</h2>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                createWorkspace.mutate();
              }}
            >
              <input
                id="workspace-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white"
                placeholder="Workspace name"
                required
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white"
                placeholder="Brief description"
              />
              {createWorkspace.isError ? (
                <p role="alert" className="text-sm text-rose-300">{getErrorMessage(createWorkspace.error, 'Could not create workspace.')}</p>
              ) : null}
              <button
                type="submit"
                disabled={createWorkspace.isPending}
                className="w-full rounded-xl bg-sky-500 px-4 py-3 font-semibold text-white hover:bg-sky-400 disabled:opacity-60"
              >
                {createWorkspace.isPending ? 'Creating...' : 'Create workspace'}
              </button>
            </form>
          </div>

          <div className="space-y-4">
            {isLoading ? <div className="glass rounded-3xl p-5 text-slate-300">Loading workspaces...</div> : null}
            {isError ? <div role="alert" className="glass rounded-3xl p-5 text-rose-300">{getErrorMessage(error, 'Could not load workspaces.')}</div> : null}
            {!isLoading && !isError && workspaces.length === 0 ? (
              <div className="glass rounded-3xl p-5 text-slate-300">No workspaces yet. Create one to get started.</div>
            ) : null}

            {workspaces.map((workspace) => {
              const id = workspace._id || workspace.id;
              const canManage = Boolean(user?.id && workspace.owner === user.id);
              const isEditing = id === editingId;
              return (
                <div key={id} className="glass rounded-3xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
                        <BriefcaseBusiness className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              value={editName}
                              onChange={(event) => setEditName(event.target.value)}
                              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                              aria-label="Workspace name"
                            />
                            <textarea
                              value={editDescription}
                              onChange={(event) => setEditDescription(event.target.value)}
                              rows={2}
                              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                              aria-label="Workspace description"
                            />
                          </div>
                        ) : (
                          <>
                            <h3 className="text-lg font-semibold text-white">{workspace.name}</h3>
                            <p className="text-sm text-slate-300">{workspace.description || 'No description yet.'}</p>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">{workspace.status || 'active'}</span>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Users className="h-4 w-4" />
                      {(workspace.members || []).length} members
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!isEditing ? (
                        <button
                          type="button"
                          onClick={() => {
                            setManagingId(id || null);
                            setInvitationResult(null);
                            setInviteEmail('');
                            setInviteRole('member');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 px-3 py-1.5 text-xs text-sky-200"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Manage Members
                        </button>
                      ) : null}
                      {canManage ? (
                        isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => id && updateWorkspace.mutate(id)}
                              disabled={!id || updateWorkspace.isPending || !editName.trim()}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 px-3 py-1.5 text-xs text-sky-200 disabled:opacity-50"
                            >
                              <Save className="h-3.5 w-3.5" />
                              Save
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => beginEdit(workspace)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200">
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (id && window.confirm('Delete this workspace? Workspaces with meetings cannot be deleted.')) {
                                  deleteWorkspace.mutate(id);
                                }
                              }}
                              disabled={deleteWorkspace.isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </>
                        )
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {updateWorkspace.isError ? (
              <p role="alert" className="text-sm text-rose-300">{getErrorMessage(updateWorkspace.error, 'Could not update workspace.')}</p>
            ) : null}
            {deleteWorkspace.isError ? (
              <p role="alert" className="text-sm text-rose-300">{getErrorMessage(deleteWorkspace.error, 'Could not delete workspace.')}</p>
            ) : null}
          </div>
        </div>
        {managingId && managedWorkspace ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setManagingId(null);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="members-dialog-title"
              className="glass my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-5 text-slate-100 shadow-2xl md:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Workspace members</p>
                  <h2 id="members-dialog-title" className="mt-2 text-2xl font-bold text-white">{managedWorkspace.name}</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {membersQuery.data?.members.length ?? 0} {membersQuery.data?.members.length === 1 ? 'member' : 'members'}
                  </p>
                </div>
                <button type="button" onClick={() => setManagingId(null)} aria-label="Close members dialog" className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6">
                <h3 className="mb-3 text-lg font-semibold text-white">Current members</h3>
                {membersQuery.isLoading ? <p className="text-sm text-slate-300">Loading members...</p> : null}
                {membersQuery.isError ? <p role="alert" className="text-sm text-rose-300">{getErrorMessage(membersQuery.error, 'Could not load members.')}</p> : null}
                {!membersQuery.isLoading && !membersQuery.isError && membersQuery.data?.members.length === 0 ? (
                  <p className="rounded-xl border border-slate-700 p-4 text-sm text-slate-300">No members found.</p>
                ) : null}
                <ul className="space-y-2">
                  {membersQuery.data?.members.map((member) => {
                    const isOwner = member.userId === membersQuery.data?.owner;
                    const canRemove = isWorkspaceAdmin && !isOwner && (isWorkspaceOwner || member.role === 'member');
                    const canChangeRole = !isOwner && (isWorkspaceOwner || (isWorkspaceAdmin && member.role === 'admin'));
                    return (
                      <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-900/60 p-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{member.name}</p>
                          <p className="truncate text-sm text-slate-400">{member.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isOwner || member.role === 'admin' ? <Shield className="h-4 w-4 text-sky-300" /> : null}
                          {isOwner ? (
                            <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs text-sky-200">Owner</span>
                          ) : canChangeRole ? (
                            <select
                              value={member.role}
                              aria-label={`Role for ${member.name}`}
                              onChange={(event) => changeMemberRole.mutate({ userId: member.userId, role: event.target.value as 'admin' | 'member' })}
                              disabled={changeMemberRole.isPending}
                              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                            >
                              <option value="member">Member</option>
                              {isWorkspaceOwner || member.role === 'admin' ? <option value="admin">Admin</option> : null}
                            </select>
                          ) : (
                            <span className={`rounded-full px-2.5 py-1 text-xs ${member.role === 'admin' ? 'bg-violet-500/15 text-violet-200' : 'bg-slate-700 text-slate-200'}`}>
                              {member.role === 'admin' ? 'Admin' : 'Member'}
                            </span>
                          )}
                          {canRemove ? (
                            <button
                              type="button"
                              title={`Remove ${member.name}`}
                              aria-label={`Remove ${member.name}`}
                              onClick={() => {
                                if (window.confirm(`Remove ${member.name} from this workspace?`)) removeMember.mutate(member.userId);
                              }}
                              disabled={removeMember.isPending}
                              className="rounded-lg border border-rose-500/30 p-2 text-rose-200 disabled:opacity-50"
                            >
                              <UserMinus className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {removeMember.isError ? <p role="alert" className="mt-2 text-sm text-rose-300">{getErrorMessage(removeMember.error, 'Could not remove member.')}</p> : null}
                {changeMemberRole.isError ? <p role="alert" className="mt-2 text-sm text-rose-300">{getErrorMessage(changeMemberRole.error, 'Could not update member role.')}</p> : null}
              </div>

              {isWorkspaceAdmin ? (
                <>
                  <div className="mt-7 border-t border-slate-700 pt-6">
                    <h3 className="mb-3 text-lg font-semibold text-white">Invite a member</h3>
                    <form
                      className="flex flex-col gap-3 sm:flex-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setInvitationResult(null);
                        inviteMember.mutate();
                      }}
                    >
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="name@company.com"
                        aria-label="Email address to invite"
                        required
                        className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white"
                      />
                      <select
                        value={inviteRole}
                        onChange={(event) => setInviteRole(event.target.value as 'admin' | 'member')}
                        aria-label="Invitation role"
                        className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white"
                      >
                        <option value="member">Member</option>
                        {isWorkspaceOwner ? <option value="admin">Admin</option> : null}
                      </select>
                      <button
                        type="submit"
                        disabled={inviteMember.isPending || !inviteEmail.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 font-medium text-white hover:bg-sky-400 disabled:opacity-50"
                      >
                        <MailPlus className="h-4 w-4" />
                        {inviteMember.isPending ? 'Sending...' : 'Send Invitation'}
                      </button>
                    </form>
                    <p className="mt-2 text-xs text-slate-400">We’ll email a secure, single-use invitation link. If email delivery fails, you can copy and share the link instead.</p>
                    {inviteMember.isError ? <p role="alert" className="mt-2 text-sm text-rose-300">{getErrorMessage(inviteMember.error, 'Could not create invitation.')}</p> : null}
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
                            <input readOnly value={invitationResult.invitationLink} aria-label="Invitation link" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200" />
                            <button type="button" onClick={() => {
                              if (!navigator.clipboard) {
                                setCopiedLink(false);
                                return;
                              }
                              void navigator.clipboard.writeText(invitationResult.invitationLink).then(() => setCopiedLink(true)).catch(() => setCopiedLink(false));
                            }} className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200">
                              <Copy className="h-3.5 w-3.5" />{copiedLink ? 'Copied' : 'Copy link'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-7 border-t border-slate-700 pt-6">
                    <h3 className="mb-3 text-lg font-semibold text-white">Invitations</h3>
                    {invitationsQuery.isLoading ? <p className="text-sm text-slate-300">Loading invitations...</p> : null}
                    {invitationsQuery.isError ? <p role="alert" className="text-sm text-rose-300">{getErrorMessage(invitationsQuery.error, 'Could not load invitations.')}</p> : null}
                    {!invitationsQuery.isLoading && !invitationsQuery.isError && (invitationsQuery.data || []).length === 0 ? (
                      <p className="text-sm text-slate-400">No invitations yet.</p>
                    ) : null}
                    <ul className="space-y-2">
                      {invitationsQuery.data?.map((invitation) => (
                        <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/80 p-3">
                          <div>
                            <p className="text-sm text-white">{invitation.email}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {invitation.role} · {invitation.status}
                              {invitation.status === 'pending' ? ` · expires ${new Date(invitation.expiresAt).toLocaleDateString()}` : ''}
                            </p>
                          </div>
                          {invitation.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => cancelInvitation.mutate(invitation.id)}
                              disabled={cancelInvitation.isPending}
                              className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {cancelInvitation.isError ? <p role="alert" className="mt-2 text-sm text-rose-300">{getErrorMessage(cancelInvitation.error, 'Could not cancel invitation.')}</p> : null}
                  </div>
                </>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
