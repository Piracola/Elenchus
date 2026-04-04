import { useRef, useState } from 'react';
import { api } from '../../../api/client';
import { useRuntimeActions, useRuntimeViewState } from '../../../hooks/useDebateViewState';
import { parseRuntimeEventsSnapshot, serializeRuntimeEventsSnapshot } from '../../../utils/replaySnapshot';
import { toast } from '../../../utils/toast';
import { TIMELINE_PAGE_SIZE } from '../../../utils/timelineWindow';

export interface UseTimelineActionsReturn {
    historyLoading: boolean;
    snapshotLoading: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    handleLoadOlder: () => Promise<void>;
    handleExport: () => Promise<void>;
    handleLoadFullReplay: () => Promise<void>;
    handleImportFile: (file: File | null) => Promise<void>;
}

async function readJsonFileWithEncodingFallback(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();

    for (const label of ['utf-8', 'gb18030']) {
        try {
            return new TextDecoder(label, { fatal: true }).decode(buffer);
        } catch {
            continue;
        }
    }

    return new TextDecoder().decode(buffer);
}

export function useTimelineActions(
    pageCount: number,
    pageTotal: number,
    currentTopic: string,
    onFilterReset: () => void,
): UseTimelineActionsReturn {
    const {
        runtimeEvents,
        currentSessionId,
        hasOlderRuntimeEvents,
    } = useRuntimeViewState();

    const {
        loadRuntimeEventSnapshot,
        prependRuntimeEvents,
    } = useRuntimeActions();

    const [historyLoading, setHistoryLoading] = useState(false);
    const [snapshotLoading, setSnapshotLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleLoadOlder = async () => {
        if (pageCount < pageTotal) {
            return;
        }

        if (historyLoading || !hasOlderRuntimeEvents || !currentSessionId || !runtimeEvents.length) {
            return;
        }

        const oldestSeq = runtimeEvents[0]?.seq;
        if (!(typeof oldestSeq === 'number' && oldestSeq > 0)) {
            return;
        }

        try {
            setHistoryLoading(true);
            const page = await api.sessions.listRuntimeEvents(currentSessionId, {
                beforeSeq: oldestSeq,
                limit: TIMELINE_PAGE_SIZE,
            });

            if (!page.events.length) {
                prependRuntimeEvents([], false);
                toast('没有更多历史事件了', 'info');
                return;
            }

            prependRuntimeEvents(page.events, page.has_more);
        } catch (error) {
            toast(error instanceof Error ? error.message : '加载历史事件失败', 'error');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleExport = async () => {
        if (!runtimeEvents.length && !currentSessionId) {
            toast('没有可导出的运行事件', 'info');
            return;
        }

        try {
            setSnapshotLoading(true);

            if (currentSessionId) {
                await api.sessions.exportRuntimeEventsSnapshot(currentSessionId, currentTopic);
                toast('完整回放快照已导出', 'success');
                return;
            }

            const snapshot = serializeRuntimeEventsSnapshot(runtimeEvents);
            const blob = new Blob([snapshot], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `runtime-events-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
            toast('回放快照已导出', 'success');
        } catch (error) {
            toast(error instanceof Error ? error.message : '导出失败', 'error');
        } finally {
            setSnapshotLoading(false);
        }
    };

    const handleLoadFullReplay = async () => {
        if (!currentSessionId) {
            toast('当前会话不支持从后端装载整段回放', 'info');
            return;
        }

        try {
            setSnapshotLoading(true);
            const raw = await api.sessions.getRuntimeEventsSnapshot(currentSessionId);
            const parsedEvents = parseRuntimeEventsSnapshot(raw);
            loadRuntimeEventSnapshot(parsedEvents);
            onFilterReset();
            toast(`已装载整段回放，共 ${parsedEvents.length} 条事件`, 'success');
        } catch (error) {
            if (error instanceof Error && error.message.includes('no usable events')) {
                toast('当前会话还没有可回放的历史事件', 'info');
                return;
            }
            toast(error instanceof Error ? error.message : '装载整段回放失败', 'error');
        } finally {
            setSnapshotLoading(false);
        }
    };

    const handleImportFile = async (file: File | null) => {
        if (!file) return;

        try {
            const raw = await readJsonFileWithEncodingFallback(file);
            const parsedEvents = parseRuntimeEventsSnapshot(raw);
            loadRuntimeEventSnapshot(parsedEvents);
            onFilterReset();
            toast(`已导入 ${parsedEvents.length} 条事件`, 'success');
        } catch (error) {
            toast(error instanceof Error ? error.message : '导入失败', 'error');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return {
        historyLoading,
        snapshotLoading,
        fileInputRef,
        handleLoadOlder,
        handleExport,
        handleLoadFullReplay,
        handleImportFile,
    };
}
