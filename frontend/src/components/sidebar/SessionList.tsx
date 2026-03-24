import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PanelLeftClose, Plus, Search, Settings, Sun, Moon, Trash2 } from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';
import { api } from '../../api/client';
import {
    useRuntimeActions,
    useSessionActions,
    useSessionListViewState,
} from '../../hooks/useDebateViewState';
import SettingsPanel from './SettingsPanel';
import BrandIcon from '../shared/BrandIcon';
import type { SessionListItem } from '../../types';
import { filterSessionsByQuery, mergeSessionPage } from '../../utils/sessionList';
import { toast } from '../../utils/toast';

interface SessionListProps {
    onCollapse: () => void;
}

export default function SessionList({ onCollapse }: SessionListProps) {
    const { sessions, currentSessionId } = useSessionListViewState();
    const { setSessions, setCurrentSession } = useSessionActions();
    const { hydrateRuntimeEvents } = useRuntimeActions();
    const { theme, toggleTheme } = useThemeStore();
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [total, setTotal] = useState(0);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const sessionSelectionRequestRef = useRef(0);
    const PAGE_SIZE = 50;

    const loadSessions = useCallback(async (offset = 0, append = false) => {
        try {
            if (offset === 0) setIsLoading(true);
            else setIsLoadingMore(true);
            const data = await api.sessions.list(offset, PAGE_SIZE);
            setSessions((current: SessionListItem[]) => (append ? mergeSessionPage(current, data.sessions) : data.sessions));
            setTotal(data.total);
        } catch (err) {
            console.error('Failed to load sessions', err);
            toast('加载辩论记录失败', 'error');
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [setSessions]);

    useEffect(() => {
        void loadSessions();
    }, [loadSessions]);

    const handleSelectSession = useCallback(async (item: SessionListItem) => {
        if (item.id === currentSessionId) return;
        const requestId = sessionSelectionRequestRef.current + 1;
        sessionSelectionRequestRef.current = requestId;
        try {
            const runtimePagePromise = api.sessions.listRuntimeEvents(item.id).catch((error) => {
                console.error('Failed to load runtime events', error);
                toast('加载执行时间轴失败，已仅打开辩论内容', 'error');
                return null;
            });
            const fullSession = await api.sessions.get(item.id);
            if (sessionSelectionRequestRef.current !== requestId) return;

            setCurrentSession(fullSession);
            const runtimePage = await runtimePagePromise;
            if (sessionSelectionRequestRef.current !== requestId) return;

            hydrateRuntimeEvents(
                runtimePage?.events ?? [],
                runtimePage?.has_more ?? false,
            );
        } catch (err) {
            console.error('Failed to load session details', err);
            toast('加载辩论记录失败', 'error');
        }
    }, [currentSessionId, hydrateRuntimeEvents, setCurrentSession]);

    const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        e.preventDefault();

        const confirmed = window.confirm('确定删除此辩论记录吗？');
        if (!confirmed) return;

        try {
            await api.sessions.delete(id);
            if (currentSessionId === id) {
                setCurrentSession(null);
            }
            await loadSessions();
            toast('辩论记录已删除', 'success');
        } catch (err) {
            console.error('Failed to delete session', err);
            toast('删除辩论记录失败', 'error');
        }
    }, [currentSessionId, loadSessions, setCurrentSession]);

    const filteredSessions = useMemo(
        () => filterSessionsByQuery(sessions, searchQuery),
        [sessions, searchQuery],
    );

    return (
        <aside style={{
            width: '320px',
            minWidth: '280px',
            maxWidth: '380px',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-secondary)',
            height: '100%',
            borderRight: '1px solid var(--border-subtle)',
            position: 'relative',
            zIndex: 10,
        }}>
            {/* Header */}
            <div style={{
                padding: '20px 18px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                borderBottom: '1px solid var(--border-subtle)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <BrandIcon size={38} alt="Elenchus 品牌图标" withBadge={false} />
                    <div style={{ minWidth: 0 }}>
                        <h1 style={{
                            fontSize: '17px',
                            fontWeight: 700,
                            letterSpacing: '-0.02em',
                            color: 'var(--text-primary)',
                            margin: 0,
                        }}>
                            Elenchus
                        </h1>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>AI 辩论平台</p>
                    </div>
                </div>

                <motion.button
                    whileHover={{ scale: 1.05, background: 'var(--bg-hover)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onCollapse}
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '9px',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-xs)',
                        flexShrink: 0,
                    }}
                    title="收起历史栏"
                >
                    <PanelLeftClose size={18} />
                </motion.button>
            </div>

            {/* Actions */}
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <motion.button
                    whileHover={{ scale: 1.01, background: 'var(--bg-hover)' }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                        setCurrentSession(null);
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '11px 14px',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: 'var(--shadow-xs)',
                        transition: 'all var(--transition-fast)',
                    }}
                >
                    <Plus size={16} strokeWidth={2.5} />
                    新辩题
                </motion.button>

                <div style={{
                    position: 'relative',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-lg)',
                    transition: 'all var(--transition-fast)',
                }}>
                    <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="搜索辩论记录"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 36px',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            borderRadius: 'var(--radius-lg)',
                        }}
                    />
                </div>
            </div>

            {/* Section Header */}
            <div style={{
                padding: '0 18px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <h2 style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    margin: 0,
                }}>
                    辩论记录
                </h2>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {filteredSessions.length}
                </span>
            </div>

            {/* Session List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
                {isLoading ? (
                    <div style={{ padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
                        加载中...
                    </div>
                ) : filteredSessions.length === 0 ? (
                    <div style={{
                        padding: '40px 24px',
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                        textAlign: 'center',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-lg)',
                        margin: '0 6px',
                    }}>
                        {searchQuery ? '未找到匹配的辩论' : '暂无历史辩论'}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {filteredSessions.map((item) => {
                            const isActive = item.id === currentSessionId;
                            const isHovered = hoveredId === item.id;
                            return (
                                <motion.div
                                    key={item.id}
                                    onMouseEnter={() => setHoveredId(item.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    onClick={() => handleSelectSession(item)}
                                    style={{
                                        padding: '12px 14px',
                                        borderRadius: 'var(--radius-lg)',
                                        cursor: 'pointer',
                                        background: isActive ? 'var(--bg-card)' : 'transparent',
                                        border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
                                        boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                                        transition: 'all var(--transition-fast)',
                                        position: 'relative',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '10px',
                                    }}
                                >
                                    {/* Status indicator */}
                                    <div style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: item.status === 'in_progress' ? 'var(--accent-emerald)' : 'var(--text-muted)',
                                        marginTop: '5px',
                                        flexShrink: 0,
                                        boxShadow: item.status === 'in_progress' ? '0 0 6px var(--accent-emerald)' : 'none',
                                    }} />

                                    {/* Content */}
                                    <div style={{
                                        flex: 1,
                                        minWidth: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '5px',
                                    }}>
                                        {/* Topic */}
                                        <div style={{
                                            fontWeight: isActive ? 600 : 500,
                                            fontSize: '13px',
                                            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            lineHeight: 1.4,
                                        }}>
                                            {item.topic}
                                        </div>

                                        {/* Meta info */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '11px',
                                            color: 'var(--text-muted)',
                                        }}>
                                            <span style={{
                                                padding: '2px 6px',
                                                borderRadius: 'var(--radius-sm)',
                                                background: item.status === 'in_progress' ? 'rgba(52, 199, 89, 0.1)' : 'var(--bg-tertiary)',
                                                color: item.status === 'in_progress' ? 'var(--color-proposer)' : 'var(--text-muted)',
                                                fontWeight: 500,
                                                fontSize: '10px',
                                            }}>
                                                {item.status === 'in_progress' ? '进行中' : '已完成'}
                                            </span>
                                            <span>{item.current_turn}/{item.max_turns} 轮</span>
                                        </div>
                                    </div>

                                    {/* Delete button */}
                                    <motion.button
                                        initial={false}
                                        animate={{ opacity: isHovered || isActive ? 1 : 0 }}
                                        whileHover={{ scale: 1.1, color: 'var(--accent-rose)' }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={(e) => handleDelete(e, item.id)}
                                        onPointerDown={(e) => {
                                            e.stopPropagation();
                                        }}
                                        style={{
                                            flexShrink: 0,
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            cursor: 'pointer',
                                            padding: '4px',
                                            borderRadius: 'var(--radius-sm)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginTop: '2px',
                                            transition: 'color var(--transition-fast)',
                                        }}
                                        title="删除"
                                    >
                                        <Trash2 size={14} />
                                    </motion.button>
                                </motion.div>
                            );
                        })}
                        {sessions.length < total && !searchQuery && (
                            <motion.button
                                whileHover={{ scale: 1.01, background: 'var(--bg-hover)' }}
                                onClick={() => loadSessions(sessions.length, true)}
                                disabled={isLoadingMore}
                                style={{
                                    margin: '10px 16px',
                                    padding: '10px',
                                    background: 'var(--bg-tertiary)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-lg)',
                                    color: 'var(--text-muted)',
                                    fontSize: '12px',
                                    cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                                    opacity: isLoadingMore ? 0.5 : 1,
                                    boxShadow: 'var(--shadow-xs)',
                                    transition: 'all var(--transition-fast)',
                                }}
                            >
                                {isLoadingMore ? '加载中...' : `加载更多 (${total - sessions.length})`}
                            </motion.button>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Actions */}
            <div style={{
                padding: '14px 16px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <motion.button
                    whileHover={{ scale: 1.05, background: 'var(--bg-hover)' }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '9px',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-xs)',
                    }}
                    title="设置"
                    onClick={() => setIsSettingsOpen(true)}
                >
                    <Settings size={18} />
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.05, background: 'var(--bg-hover)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleTheme}
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '9px',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-xs)',
                    }}
                    title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                    {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </motion.button>
            </div>

            <SettingsPanel
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
        </aside>
    );
}
