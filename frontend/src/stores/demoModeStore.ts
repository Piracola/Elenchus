/**
 * Demo mode detection and management store.
 */

import { create } from 'zustand';

export interface DemoModeState {
  demoMode: boolean;
  isAdmin: boolean;
  demoModels: string[];
  initialized: boolean;
  setDemoMode: (mode: boolean) => void;
  setIsAdmin: (admin: boolean) => void;
  fetchModeStatus: () => Promise<void>;
}

export const useDemoModeStore = create<DemoModeState>((set) => ({
  demoMode: false,
  isAdmin: false,
  demoModels: [],
  initialized: false,

  setDemoMode: (mode) => set({ demoMode: mode }),
  setIsAdmin: (admin) => set({ isAdmin: admin }),

  fetchModeStatus: async () => {
    try {
      // Fetch mode info
      const modeRes = await fetch('/api/mode', { credentials: 'include' });
      const modeData = await modeRes.json();

      // Fetch admin status (cookie is sent automatically)
      const statusRes = await fetch('/api/admin/status', { credentials: 'include' });
      const statusData = await statusRes.json();

      set({
        demoMode: modeData.demo_mode ?? false,
        demoModels: modeData.demo_models ?? [],
        isAdmin: statusData.is_admin ?? false,
        initialized: true,
      });
    } catch {
      set({ initialized: true });
    }
  },
}));

// Admin API helpers
export const adminApi = {
  login: async (username: string, password: string): Promise<{ token: string } | null> => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  logout: async (): Promise<void> => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
  },
};
