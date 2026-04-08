/**
 * Demo mode detection and management store.
 */

import { create } from 'zustand';

export interface DemoModeState {
  demoMode: boolean;
  isAdmin: boolean;
  demoModels: string[];
  adminToken: string | null;
  initialized: boolean;
  setDemoMode: (mode: boolean) => void;
  setIsAdmin: (admin: boolean) => void;
  setAdminToken: (token: string | null) => void;
  fetchModeStatus: () => Promise<void>;
}

export const useDemoModeStore = create<DemoModeState>((set, get) => ({
  demoMode: false,
  isAdmin: false,
  demoModels: [],
  adminToken: null,
  initialized: false,

  setDemoMode: (mode) => set({ demoMode: mode }),
  setIsAdmin: (admin) => set({ isAdmin: admin }),
  setAdminToken: (token) => {
    if (token) {
      localStorage.setItem('elenchus-admin-token', token);
    } else {
      localStorage.removeItem('elenchus-admin-token');
    }
    set({ adminToken: token });
  },

  fetchModeStatus: async () => {
    try {
      const state = get();
      const token = state.adminToken || localStorage.getItem('elenchus-admin-token');

      // Fetch mode info
      const modeRes = await fetch('/api/mode');
      const modeData = await modeRes.json();

      // Fetch admin status
      const statusRes = await fetch('/api/admin/status', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
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
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  logout: async (token: string): Promise<void> => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch {
      // ignore
    }
  },
};
