import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LogLevel, DisplaySettings } from '../types';
import type { ContextRuntimeConfig } from '../types/session';
import {
  DEFAULT_CONTEXT_INJECTION_MODE,
  DEFAULT_CONTEXT_POLICY_VALUES,
} from '../utils/contextRuntime';

export interface SettingsState {
  logLevel: LogLevel;
  displaySettings: DisplaySettings;
  contextRuntime: ContextRuntimeConfig;
  setLogLevel: (level: LogLevel) => void;
  setDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  setContextRuntime: (settings: Partial<ContextRuntimeConfig>) => void;
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
        messageFontSize: 15,
        settingsFontSize: 13,
      },
      contextRuntime: {
        context_injection_mode: DEFAULT_CONTEXT_INJECTION_MODE,
        ...DEFAULT_CONTEXT_POLICY_VALUES,
        use_low_cost_context_model: true,
        low_cost_model_provider_id: null,
        low_cost_model_id: null,
      },
      setLogLevel: (level) => set({ logLevel: level }),
      setDisplaySettings: (settings) => set((state) => ({
        displaySettings: { ...state.displaySettings, ...settings }
      })),
      setContextRuntime: (settings) => set((state) => ({
        contextRuntime: { ...state.contextRuntime, ...settings }
      })),
    }),
    {
      name: 'elenchus-settings',
      merge: (persisted, current) => {
        const state = persisted as Partial<SettingsState> | undefined;
        const persistedContextRuntime = (state?.contextRuntime ?? {}) as Partial<ContextRuntimeConfig>;
        return {
          ...current,
          ...state,
          contextRuntime: {
            ...current.contextRuntime,
            ...persistedContextRuntime,
            context_injection_mode:
              persistedContextRuntime.context_injection_mode ?? DEFAULT_CONTEXT_INJECTION_MODE,
            recent_turns_to_include:
              persistedContextRuntime.recent_turns_to_include ?? DEFAULT_CONTEXT_POLICY_VALUES.recent_turns_to_include,
            evidence_items_per_agent:
              persistedContextRuntime.evidence_items_per_agent ?? DEFAULT_CONTEXT_POLICY_VALUES.evidence_items_per_agent,
            exact_recent_entries_per_agent:
              persistedContextRuntime.exact_recent_entries_per_agent ?? DEFAULT_CONTEXT_POLICY_VALUES.exact_recent_entries_per_agent,
            planning_entries_per_agent:
              persistedContextRuntime.planning_entries_per_agent ?? DEFAULT_CONTEXT_POLICY_VALUES.planning_entries_per_agent,
            long_term_memory_entries_per_agent:
              persistedContextRuntime.long_term_memory_entries_per_agent ?? DEFAULT_CONTEXT_POLICY_VALUES.long_term_memory_entries_per_agent,
            use_low_cost_context_model:
              persistedContextRuntime.use_low_cost_context_model ?? true,
            low_cost_model_provider_id:
              persistedContextRuntime.low_cost_model_provider_id ?? null,
            low_cost_model_id:
              persistedContextRuntime.low_cost_model_id ?? null,
          },
        };
      },
    }
  )
);
