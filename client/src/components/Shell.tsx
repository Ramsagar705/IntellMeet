import { BarChart3, BriefcaseBusiness, CalendarRange, Columns3, LayoutDashboard, LogOut, UserCircle2, Users, Video } from 'lucide-react';
import { useState } from 'react';
import { matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import MeetingRoomPage from '../pages/MeetingRoomPage';
import useAuthStore from '../store/authStore';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workspaces', label: 'Workspaces', icon: BriefcaseBusiness },
  { to: '/meetings', label: 'Meetings', icon: CalendarRange },
  { to: '/room', label: 'Meeting room', icon: Video },
  { to: '/teams', label: 'Teams', icon: Users },
  { to: '/kanban', label: 'Kanban', icon: Columns3 },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/profile', label: 'Profile', icon: UserCircle2 },
];

export default function Shell() {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const roomMatch = matchPath('/room/:meetingId', pathname) || matchPath('/meetings/:meetingId/room', pathname);
  const routeMeetingId = roomMatch?.params.meetingId;
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  if (routeMeetingId && routeMeetingId !== activeMeetingId) setActiveMeetingId(routeMeetingId);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const visibleMeetingId = routeMeetingId || activeMeetingId;
  const isMeetingRoomVisible = Boolean(routeMeetingId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed left-0 top-0 hidden h-screen w-72 border-r border-slate-800 bg-slate-950/95 p-5 lg:block">
        <div className="mb-8">
          <div className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">
            IntellMeet
          </div>
          <p className="mt-4 text-sm text-slate-400">AI-powered teamwork</p>
        </div>

        <nav className="space-y-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-sky-500/15 text-sky-200' : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Signed in</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/15 text-sm font-semibold text-sky-200">
              {user?.name?.slice(0, 1) || 'U'}
            </div>
            <div>
              <p className="font-medium text-white">{user?.name || 'User'}</p>
              <p className="text-xs text-slate-400">{user?.role || 'member'}</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>

      <main className="lg:pl-72">
        <Outlet />
      </main>
      {visibleMeetingId ? (
        <MeetingRoomPage
          key={visibleMeetingId}
          meetingId={visibleMeetingId}
          minimized={!isMeetingRoomVisible}
          onLeave={() => {
            setActiveMeetingId(null);
            navigate('/meetings', { replace: true });
          }}
        />
      ) : null}
    </div>
  );
}
