import { useEffect, useEffectEvent, useState } from 'react';
import { useDebateStore } from '../stores/debateStore';
import type { DebateState } from '../stores/debateStore';

export function useForegroundDebateSelector<T>(
    selector: (state: DebateState) => T,
    equalityFn: (previous: T, next: T) => boolean = Object.is,
): T {
    const [value, setValue] = useState(() => selector(useDebateStore.getState()));

    const updateValue = useEffectEvent((state: DebateState) => {
        const next = selector(state);
        setValue((previous) => (equalityFn(previous, next) ? previous : next));
    });

    useEffect(() => {
        return useDebateStore.subscribe((state) => {
            if (!state.isDocumentVisible) {
                return;
            }
            updateValue(state);
        });
    }, []);

    return value;
}
