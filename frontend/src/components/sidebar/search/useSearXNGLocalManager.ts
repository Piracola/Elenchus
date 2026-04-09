import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../api/client';
import { toast } from '../../../utils/chat/toast';

interface SearXNGStatus {
    docker_available: boolean;
    searxng_running: boolean;
    searxng_healthy: boolean;
    searxng_url: string;
}

export function useSearXNGLocalManager() {
    const [status, setStatus] = useState<SearXNGStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isBusy, setIsBusy] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const result = await api.searxng.getStatus();
            setStatus(result);
        } catch (err) {
            console.error('Failed to fetch SearXNG status:', err);
            // 如果 API 不存在，说明后端还没实现，静默处理
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchStatus();
    }, [fetchStatus]);

    const handleStart = useCallback(async () => {
        setIsBusy(true);
        try {
            const result = await api.searxng.start();
            if (result.success) {
                toast(result.message || 'SearXNG 正在启动中...', 'success');
                // 等待 2 秒后刷新状态
                setTimeout(async () => {
                    await fetchStatus();
                }, 2000);
            } else {
                toast(result.message || 'SearXNG 启动失败', 'error');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'SearXNG 启动失败';
            toast(message, 'error');
        } finally {
            setIsBusy(false);
        }
    }, [fetchStatus]);

    const handleStop = useCallback(async () => {
        setIsBusy(true);
        try {
            const result = await api.searxng.stop();
            if (result.success) {
                toast('SearXNG 已停止', 'success');
                await fetchStatus();
            } else {
                toast(result.message || 'SearXNG 停止失败', 'error');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'SearXNG 停止失败';
            toast(message, 'error');
        } finally {
            setIsBusy(false);
        }
    }, [fetchStatus]);

    return {
        status,
        isLoading,
        isBusy,
        handleStart,
        handleStop,
        refreshStatus: fetchStatus,
        fetchStatus,
    };
}
