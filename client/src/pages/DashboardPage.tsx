import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowUpRight, Bell, CalendarCheck2, MessageSquareText, Video, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import useAuthStore from '../store/authStore';
import type { Meeting, Workspace } from '../types';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const { data: summaryData } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/summary');
      return data;
    },
  });

  const { data: workspaces = [] as Workspace[] } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data } = await api.get('/workspaces');
      return data;
    },
  });

  const { data: meetings = [] as Meeting[] } = useQuery<Meeting[]>({
    queryKey: ['meetings'],
    queryFn: async () => {
      const { data } = await api.get('/meetings');
      return data;
    },
  });

  const stats = summaryData?.stats ?? {
    workspaces: 0,
    meetings: 0,
    activeMeetings: 0,
    tasks: 0,
    engagement: 0,
    aiSummaryCoverage: 0,
  };

  const latestMeeting: Meeting = meetings[0] ?? {
    title: 'No active meetings yet',
    description: 'Create a new meeting to capture notes, action items, and AI-ready summaries.',
    summary: 'Create a new meeting to capture notes, action items, and AI-ready summaries.',
    workspace: '',
    createdBy: user?.id || 'system',
    actionItems: [],
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="glass mb-8 flex flex-col gap-4 rounded-3xl p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">IntellMeet</p>
            <h1 className="mt-2 text-2xl font-bold text-white">Executive collaboration dashboard</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
              {user?.name || 'Team Member'}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700"
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Workspaces', value: stats.workspaces, icon: <Activity className="h-5 w-5 text-sky-300" /> },
            { label: 'Meetings', value: stats.meetings, icon: <Video className="h-5 w-5 text-violet-300" /> },
            { label: 'Active live', value: stats.activeMeetings, icon: <Zap className="h-5 w-5 text-amber-300" /> },
            { label: 'AI action items', value: stats.tasks, icon: <MessageSquareText className="h-5 w-5 text-emerald-300" /> },
          ].map((stat) => (
            <div key={stat.label} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{stat.label}</span>
                {stat.icon}
              </div>
              <p className="mt-6 text-3xl font-bold text-white">{stat.value}</p>
              <div className="mt-3 flex items-center gap-1 text-xs text-emerald-300">
                <ArrowUpRight className="h-3.5 w-3.5" />
                +12% from last cycle
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-8 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-8">
            <div className="glass rounded-3xl p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Workspaces</h2>
                <Link to="/dashboard" className="text-sm text-sky-300 hover:text-sky-200">View all</Link>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {(workspaces || []).map((workspace) => (
                  <div key={workspace._id || workspace.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">{workspace.name}</h3>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
                        {workspace.status || 'active'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">{workspace.description || 'No description yet.'}</p>
                    <div className="mt-5 flex items-center justify-between text-xs text-slate-400">
                      <span>{(workspace.members || []).length} members</span>
                      <span>Owner</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass rounded-3xl p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Recent meetings</h2>
                <button type="button" className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 hover:border-sky-500">
                  Schedule meeting
                </button>
              </div>

              <div className="space-y-4">
                {(meetings || []).map((meeting) => (
                  <div key={meeting._id || meeting.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{meeting.title}</h3>
                        <p className="mt-1 text-sm text-slate-300">{meeting.description || 'No description provided.'}</p>
                      </div>
                      <span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300">
                        {meeting.status || 'scheduled'}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1">
                        <CalendarCheck2 className="h-3.5 w-3.5" />
                        {meeting.scheduledAt ? new Date(meeting.scheduledAt).toLocaleDateString() : 'TBD'}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1">
                        <Bell className="h-3.5 w-3.5" />
                        {meeting.attendees?.length || 0} attendees
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-8">
            <div className="glass rounded-3xl p-6">
              <h2 className="text-xl font-semibold text-white">AI meeting intelligence</h2>
              <div className="mt-5 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-50">
                <p className="font-semibold text-sky-200">Latest summary</p>
                <p className="mt-3 leading-6">{latestMeeting.summary || 'AI output will appear here after the next meeting ends.'}</p>
              </div>

              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Action items</p>
                <ul className="space-y-3">
                  {(latestMeeting.actionItems || []).map((item, index) => (
                    <li key={`${item.title}-${index}`} className="rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">
                      <div className="flex items-start justify-between gap-2">
                        <span>{item.title}</span>
                        <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-wide text-amber-200">
                          {item.status || 'Open'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Assigned to {item.assignee || 'Unassigned'} • Due {item.dueDate || 'This week'}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="glass rounded-3xl p-6">
              <h2 className="text-xl font-semibold text-white">Team pulse</h2>
              <div className="mt-5 space-y-4 text-sm text-slate-300">
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2">
                  <span>Engagement score</span>
                  <span className="font-semibold text-white">{stats.engagement}%</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2">
                  <span>AI summary coverage</span>
                  <span className="font-semibold text-white">{stats.aiSummaryCoverage}%</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2">
                  <span>Notifications</span>
                  <span className="font-semibold text-white">{summaryData?.notifications?.length ?? 2}</span>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
