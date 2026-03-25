import { create } from 'zustand';
import { api } from '../lib/api';

interface AuthState {
  token: string | null;
  user: { name: string; email: string } | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('ae_token'),
  user: null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.auth.login(email, password);
      localStorage.setItem('ae_token', data.token);
      set({ token: data.token, user: { name: data.name, email: data.email }, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('ae_token');
    set({ token: null, user: null });
  },

  hydrate: async () => {
    const token = localStorage.getItem('ae_token');
    if (!token) return;
    try {
      const user = await api.auth.me();
      set({ user: { name: user.name ?? '', email: user.email }, token });
    } catch {
      localStorage.removeItem('ae_token');
      set({ token: null, user: null });
    }
  },
}));
