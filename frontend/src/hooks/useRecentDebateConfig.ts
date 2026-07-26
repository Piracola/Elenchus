import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { RecentDebateConfig } from '../types';

type ApplyRecentConfig = (config: RecentDebateConfig) => void;

/**
 * Load the last used debate setup and apply it once, as soon as saved provider
 * configs are available.
 *
 * Both the home composer and the in-session controls need this behaviour; they
 * previously carried byte-identical copies of the fetch + apply-once effects.
 */
export function useRecentDebateConfig({
    savedConfigCount,
    apply,
}: {
    /** Number of saved provider configs; agent configs cannot be applied before they load. */
    savedConfigCount: number;
    apply: ApplyRecentConfig;
}): void {
    const appliedRef = useRef(false);
    const [snapshot, setSnapshot] = useState<RecentDebateConfig | null>(null);

    useEffect(() => {
        let cancelled = false;
        void api.sessions.recentConfig().then((recentConfig) => {
            if (cancelled || !recentConfig) return;
            setSnapshot(recentConfig);
        }).catch((error) => {
            console.warn('Failed to load recent debate config:', error);
            // Give up permanently so a later provider load cannot re-trigger it.
            appliedRef.current = true;
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!snapshot || appliedRef.current) return;
        const hasAgentConfigs = Object.keys(snapshot.agent_configs ?? {}).length > 0;
        if (hasAgentConfigs && savedConfigCount === 0) return;

        apply(snapshot);
        appliedRef.current = true;
    }, [apply, snapshot, savedConfigCount]);
}
