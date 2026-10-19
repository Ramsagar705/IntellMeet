import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, UserCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const { data } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await api.get('/users/me');
      return data.user;
    },
    enabled: !!user,
  });

  const [form, setForm] = useState({
    name: data?.name || user?.name || '',
    bio: data?.bio || '',
    jobTitle: data?.jobTitle || '',
    department: data?.department || '',
    avatar: data?.avatar || '',
    status: data?.status || 'online',
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      const { data } = await api.put('/users/me', form);
      return data.user;
    },
    onSuccess: async (updatedUser) => {
      useAuthStore.setState({ user: updatedUser });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sky-300 hover:text-sky-200">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <div className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
            {user?.name || 'Profile'}
          </div>
        </div>

        <div className="glass rounded-3xl p-6 md:p-8">
          <div className="mb-8 flex items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-200">
              <UserCircle2 className="h-12 w-12" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Profile</p>
              <h1 className="mt-2 text-3xl font-bold text-white">Edit your profile</h1>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-200">Full name</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white focus:border-sky-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Job title</span>
              <input
                value={form.jobTitle}
                onChange={(event) => setForm((current) => ({ ...current, jobTitle: event.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white focus:border-sky-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Department</span>
              <input
                value={form.department}
                onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white focus:border-sky-500"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-200">Bio</span>
              <textarea
                value={form.bio}
                onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
                rows={4}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white focus:border-sky-500"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-200">Avatar URL</span>
              <input
                value={form.avatar}
                onChange={(event) => setForm((current) => ({ ...current, avatar: event.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white focus:border-sky-500"
                placeholder="https://example.com/avatar.jpg"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-200">Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as 'online' | 'away' | 'offline' }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white focus:border-sky-500"
              >
                <option value="online">Online</option>
                <option value="away">Away</option>
                <option value="offline">Offline</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() => updateProfile.mutate()}
            disabled={updateProfile.isPending}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-3 font-semibold text-white hover:bg-sky-400 disabled:opacity-70"
          >
            <Save className="h-4 w-4" />
            {updateProfile.isPending ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
