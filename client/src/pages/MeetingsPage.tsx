import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { CalendarDays, Pencil, Plus, Save, Trash2, Video, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import useAuthStore from '../store/authStore';
import type { Meeting, Workspace } from '../types';

const getErrorMessage = (error: unknown, fallback: string) =>
  isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || fallback : fallback;

const isValidMeetingId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-z\d_-]{1,128}$/i.test(id);

export default function MeetingsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [title, setTitle] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const {
    data: workspaces = [],
    isLoading: workspacesLoading,
    isError: workspacesIsError,
    error: workspacesError,
  } = useQuery<Workspace[]>({
    queryKey: ['workspace-options'],
    queryFn: async () => {
      const { data } = await api.get('/workspaces');
      return data;
    },
  });
  const manageableWorkspaces = workspaces.filter((item) =>
    item.owner === user?.id ||
    item.members?.some(
      (member) =>
        member.user === user?.id &&
        (member.role === 'admin' || member.role === 'owner')
    )
  );
  const canCreateMeeting = manageableWorkspaces.some(
    (item) => (item._id || item.id) === workspace
  );

  const { data: meetings = [], isLoading, isError, error } = useQuery<Meeting[]>({
    queryKey: ['meetings-list'],
    queryFn: async () => {
      const { data } = await api.get('/meetings');
      return data;
    },
  });

  const createMeeting = useMutation({
    mutationFn: async () => api.post('/meetings', { title, workspace, description }),
    onSuccess: async () => {
      setTitle('');
      setWorkspace('');
      setDescription('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meetings-list'] }),
        queryClient.invalidateQueries({ queryKey: ['meetings'] }),
      ]);
    },
  });

  const updateMeeting = useMutation({
    mutationFn: async (meetingId: string) =>
      api.patch(`/meetings/${meetingId}`, { title: editTitle, description: editDescription }),
    onSuccess: async () => {
      setEditingId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meetings-list'] }),
        queryClient.invalidateQueries({ queryKey: ['meetings'] }),
      ]);
    },
  });

  const deleteMeeting = useMutation({
    mutationFn: async (meetingId: string) => api.delete(`/meetings/${meetingId}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meetings-list'] }),
        queryClient.invalidateQueries({ queryKey: ['meetings'] }),
      ]);
    },
  });

  const generateAiInsight = useMutation({
    mutationFn: async (meetingId: string) => {
      const [{ data: summaryData }, { data: actionData }] = await Promise.all([
        api.post(`/meetings/${meetingId}/generate-summary`),
        api.post(`/meetings/${meetingId}/generate-actions`),
      ]);

      return { summary: summaryData.summary, actionItems: actionData.actionItems };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meetings-list'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  const beginEdit = (meeting: Meeting) => {
    const id = meeting._id || meeting.id;
    if (!id) return;
    setEditingId(id);
    setEditTitle(meeting.title);
    setEditDescription(meeting.description || '');
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Meetings</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Schedule and track sessions</h1>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById('meeting-title')?.focus()}
            disabled={workspacesLoading || workspacesIsError || manageableWorkspaces.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New meeting
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass rounded-3xl p-5">
            <h2 className="mb-4 text-xl font-semibold text-white">Create meeting</h2>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                createMeeting.mutate();
              }}
            >
              <input
                id="meeting-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white"
                placeholder="Meeting title"
                required
              />

              {workspacesIsError ? (
                <p role="alert" className="text-sm text-rose-300">
                  {getErrorMessage(workspacesError, 'Could not load workspaces. Try again or visit Workspaces.')}
                </p>
              ) : null}
              {!workspacesLoading && !workspacesIsError && manageableWorkspaces.length === 0 ? (
                <p className="text-sm text-amber-200">
                  Only workspace owners and admins can create meetings. You can still join meetings you have access to.
                </p>
              ) : null}
              {!workspacesLoading && !workspacesIsError && workspaces.length === 0 ? (
                <p className="text-sm text-amber-200">
                  You don’t have a workspace yet.{' '}
                  <Link to="/workspaces" className="font-medium text-sky-300 underline underline-offset-2">
                    Create a workspace
                  </Link>{' '}
                  before scheduling a meeting.
                </p>
              ) : null}
              <select
                value={workspace}
                onChange={(event) => setWorkspace(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white"
                required={!workspacesLoading && !workspacesIsError && manageableWorkspaces.length > 0}
                disabled={workspacesLoading || workspacesIsError || manageableWorkspaces.length === 0}
              >
                <option value="">
                  {workspacesLoading
                    ? 'Loading workspaces...'
                    : workspacesIsError
                      ? 'Workspaces unavailable'
                      : manageableWorkspaces.length === 0
                        ? 'No manageable workspaces'
                        : 'Select workspace'}
                </option>
                {manageableWorkspaces.map((item) => (
                  <option key={item._id || item.id} value={item._id || item.id}>{item.name}</option>
                ))}
              </select>

              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white"
                placeholder="Agenda or description"
              />
              {createMeeting.isError ? (
                <p role="alert" className="text-sm text-rose-300">{getErrorMessage(createMeeting.error, 'Could not create meeting.')}</p>
              ) : null}
              <button
                type="submit"
                disabled={createMeeting.isPending || workspacesLoading || workspacesIsError || !canCreateMeeting}
                className="w-full rounded-xl bg-sky-500 px-4 py-3 font-semibold text-white hover:bg-sky-400 disabled:opacity-60"
              >
                {createMeeting.isPending ? 'Creating...' : 'Create meeting'}
              </button>
            </form>
          </div>

          <div className="space-y-4">
            {isLoading ? <div className="glass rounded-3xl p-5 text-slate-300">Loading meetings...</div> : null}
            {isError ? <div role="alert" className="glass rounded-3xl p-5 text-rose-300">{getErrorMessage(error, 'Could not load meetings.')}</div> : null}
            {!isLoading && !isError && meetings.length === 0 ? (
              <div className="glass rounded-3xl p-5 text-slate-300">No meetings yet. Create one to get started.</div>
            ) : null}

            {meetings.map((meeting) => {
              const id = meeting._id || meeting.id;
              const meetingWorkspace = workspaces.find(
                (item) => (item._id || item.id) === meeting.workspace
              );
              const isWorkspaceAdmin = Boolean(
                user &&
                meetingWorkspace &&
                (meetingWorkspace.owner === user.id ||
                  meetingWorkspace.members?.some(
                    (member) =>
                      member.user === user.id &&
                      (member.role === 'admin' || member.role === 'owner')
                  ))
              );
              const canManage = Boolean(user && (meeting.createdBy === user.id || isWorkspaceAdmin));
              const isEditing = id === editingId;
              return (
                <div key={id} className="glass rounded-3xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                            aria-label="Meeting title"
                          />
                          <textarea
                            value={editDescription}
                            onChange={(event) => setEditDescription(event.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                            aria-label="Meeting description"
                          />
                        </div>
                      ) : (
                        <>
                          <h3 className="text-lg font-semibold text-white">{meeting.title}</h3>
                          <p className="mt-1 text-sm text-slate-300">{meeting.description || 'No description provided.'}</p>
                        </>
                      )}
                    </div>
                    {meeting.status !== 'live' ? (
                      <span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs text-sky-300">
                        {meeting.status || 'scheduled'}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      {meeting.scheduledAt ? new Date(meeting.scheduledAt).toLocaleDateString() : 'TBD'}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isValidMeetingId(id) ? (
                        <Link
                          to={`/room/${id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Join meeting room
                        </Link>
                      ) : null}
                      {canManage && id ? (
                        isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => updateMeeting.mutate(id)}
                              disabled={updateMeeting.isPending || !editTitle.trim()}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 px-2.5 py-1.5 text-xs text-sky-200 disabled:opacity-50"
                            >
                              <Save className="h-3.5 w-3.5" />
                              Save
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300">
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => beginEdit(meeting)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200">
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('Permanently delete this meeting and its history?')) {
                                  deleteMeeting.mutate(id);
                                }
                              }}
                              disabled={deleteMeeting.isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-200 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </>
                        )
                      ) : null}
                      {canManage && id ? (
                        <button
                          type="button"
                          onClick={() => generateAiInsight.mutate(id)}
                          disabled={generateAiInsight.isPending}
                          className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-60"
                        >
                          {generateAiInsight.isPending ? 'Generating...' : 'AI summary'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {meeting.summary ? (
                    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">
                      <p className="font-medium text-sky-200">Latest AI summary</p>
                      <p className="mt-2 leading-6">{meeting.summary}</p>
                    </div>
                  ) : null}

                  {meeting.actionItems && meeting.actionItems.length > 0 ? (
                    <div className="mt-4 space-y-2 text-xs text-slate-300">
                      {meeting.actionItems.slice(0, 2).map((item, index) => (
                        <div key={`${item.title}-${index}`} className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                          {item.title} · {item.status || 'Open'}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {updateMeeting.isError ? (
              <p role="alert" className="text-sm text-rose-300">{getErrorMessage(updateMeeting.error, 'Could not update meeting.')}</p>
            ) : null}
            {deleteMeeting.isError ? (
              <p role="alert" className="text-sm text-rose-300">{getErrorMessage(deleteMeeting.error, 'Could not delete meeting.')}</p>
            ) : null}
            {generateAiInsight.isError ? (
              <p role="alert" className="text-sm text-rose-300">{getErrorMessage(generateAiInsight.error, 'Could not generate meeting insights.')}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
