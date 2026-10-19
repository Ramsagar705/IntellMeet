import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isAxiosError } from 'axios';
import api from '../lib/api';
import type { User } from '../types';

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: { name: string; email: string; password: string; confirmPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      loading: false,

      login: async ({ email, password }) => {
        set({ loading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          localStorage.setItem('intellmeet-token', data.token);
          set({ token: data.token, user: data.user, loading: false });
        } catch (error) {
          set({ loading: false });
          throw error;
        }
      },

      register: async ({ name, email, password, confirmPassword }) => {
        set({ loading: true });
        try {
          const { data } = await api.post('/auth/register', { name, email, password, confirmPassword });
          localStorage.setItem('intellmeet-token', data.token);
          set({ token: data.token, user: data.user, loading: false });
        } catch (error) {
          set({ loading: false });
          throw error;
        }
      },

      logout: async () => {
        const { token } = get();
        if (token) {
          try {
            await api.post('/auth/logout');
          } catch {
            // Ignore logout failures; clear local state anyway.
          }
        }

        set({ token: null, user: null, loading: false });
        localStorage.removeItem('intellmeet-token');
      },

      bootstrap: async () => {
        const existingToken = localStorage.getItem('intellmeet-token');
        const { token } = get();
        const activeToken = token ?? existingToken;

        if (!activeToken) {
          set({ token: null, user: null, loading: false });
          return;
        }

        if (!token) {
          set({ token: activeToken });
        }

        set({ loading: true });

        try {
          const { data } = await api.get('/auth/me');
          set({ user: data.user, loading: false });
        } catch (error) {
          if (isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
            set({ token: null, user: null, loading: false });
            localStorage.removeItem('intellmeet-token');
            return;
          }

          set({ loading: false });
        }
      },
    }),
    {
      name: 'intellmeet-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          localStorage.setItem('intellmeet-token', state.token);
        }
      },
    }
  )
);

export default useAuthStore;
