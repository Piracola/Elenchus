import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LogLevel, DisplaySettings } from '../types';
import { normalizeDisplayFontSize } from '../config/display';

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
        fontSize: 'default',
      },
      setLogLevel: (level) => set({ logLevel: level }),
      setDisplaySettings: (settings) => set((state) => ({
        displaySettings: { ...state.displaySettings, ...settings }
      })),
    }),
    {
      name: 'elenchus-settings',
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsState>;
        const mergedDisplaySettings = {
          ...currentState.displaySettings,
          ...persisted.displaySettings,
        };

        return {
          ...currentState,
          ...persisted,
          displaySettings: {
            ...mergedDisplaySettings,
            fontSize: normalizeDisplayFontSize(mergedDisplaySettings.fontSize),
          },
        };
      },
    }
  )
);
