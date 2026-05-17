import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useSettingsStore } from './settingsStore';

function resetStore() {
    useSettingsStore.setState({
        logLevel: 'INFO',
        displaySettings: {
            messageWidth: 'wide',
            messageFontSize: 15,
            settingsFontSize: 13,
        },
    });
}

describe('useSettingsStore persistence', () => {
    beforeEach(() => {
        localStorage.clear();
        resetStore();
    });

    afterEach(() => {
        localStorage.clear();
        resetStore();
    });

    it('persists display settings to localStorage', () => {
        useSettingsStore.getState().setDisplaySettings({
            messageWidth: 'full',
            messageFontSize: 18,
            settingsFontSize: 16,
        });

        const raw = localStorage.getItem('elenchus-settings');
        expect(raw).toBeTruthy();

        const persisted = JSON.parse(raw!);
        expect(persisted.state.displaySettings).toEqual({
            messageWidth: 'full',
            messageFontSize: 18,
            settingsFontSize: 16,
        });
    });

    it('hydrates persisted display settings on next store init', () => {
        localStorage.setItem(
            'elenchus-settings',
            JSON.stringify({
                state: {
                    logLevel: 'WARNING',
                    displaySettings: {
                        messageWidth: 'medium',
                        messageFontSize: 17,
                        settingsFontSize: 14,
                    },
                },
                version: 0,
            }),
        );

        useSettingsStore.persist.rehydrate();

        expect(useSettingsStore.getState().displaySettings).toEqual({
            messageWidth: 'medium',
            messageFontSize: 17,
            settingsFontSize: 14,
        });
    });
});
