import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LogLevel, DisplaySettings } from '../types';

export interface SettingsState {
  logLevel: LogLevel;
  displaySettings: DisplaySettings;
  setLogLevel: (level: LogLevel) => void;
  setDisplaySettings: (settings: Partial<DisplaySettings>) => void;
}

export const MESSAGE_WIDTH_VALUES: Record<DisplaySettings['messageWidth'], string> = {
  narrow: '600px',
  medium: '900px',
  wide: '1200px',
  full: '100%',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      logLevel: 'INFO',
      displaySettings: {
        messageWidth: 'wide',
      },
      setLogLevel: (level) => set({ logLevel: level }),
      setDisplaySettings: (settings) => set((state) => ({
        displaySettings: { ...state.displaySettings, ...settings }
      })),
    }),
    {
      name: 'elenchus-settings',
    }
  )
);
