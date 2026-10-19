import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Users, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

interface ActiveMeeting {
  id: string;
  title: string;
  description?: string;
  participantCount: number;
}

const getErrorMessage = (error: unknown) =>
  isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message || 'Could not load active meetings.'
    : 'Could not load active meetings.';

export default function MeetingRoomLobbyPage() {
  const {
    data: meetings = [],
    isLoading,
    isError,
    error,
  } = useQuery<ActiveMeeting[]>({
    queryKey: ['active-meetings'],
    queryFn: async () => {
      const { data } = await api.get<ActiveMeeting[]>('/meetings/active');
      return data;
    },
    refetchInterval: 5000,
  });

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Meeting room</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Live meetings</h1>
          <p className="mt-2 text-sm text-slate-400">Meetings in progress appear here.</p>
        </header>

        {isLoading ? <div className="glass rounded-3xl p-5 text-slate-300">Checking for live meetings...</div> : null}
        {isError ? (
          <div role="alert" className="glass rounded-3xl p-5 text-rose-300">{getErrorMessage(error)}</div>
        ) : null}
        {!isLoading && !isError && meetings.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center">
            <Video className="mx-auto h-8 w-8 text-slate-500" />
            <p className="mt-3 font-medium text-white">No meeting found</p>
            <p className="mt-1 text-sm text-slate-400">There are no meetings in progress right now.</p>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {meetings.map((meeting) => (
            <article key={meeting.id} className="glass rounded-3xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-white">{meeting.title}</h2>
                  <p className="mt-1 text-sm text-slate-300">{meeting.description || 'No description provided.'}</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  Live now
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <Users className="h-4 w-4" />
                  {meeting.participantCount} {meeting.participantCount === 1 ? 'participant' : 'participants'}
                </span>
                <Link
                  to={`/room/${meeting.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-400"
                >
                  <Video className="h-4 w-4" />
                  Join meeting room
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
