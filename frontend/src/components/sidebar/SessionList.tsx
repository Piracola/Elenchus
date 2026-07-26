import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Clock3, PanelLeftClose, Plus, Search, Settings, Sun, Moon, Trash2 } from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';
import { useDebateStore } from '../../stores/debateStore';
import { api } from '../../api/client';
import {
    useSessionActions,
    useSessionListViewState,
} from '../../hooks/useDebateViewState';
import SettingsPanel from './SettingsPanel';
import BrandIcon from '../shared/BrandIcon';
import type { SessionListItem } from '../../types';
import { filterSessionsByQuery, getSessionModePresentation, mergeSessionPage } from '../../utils/session/sessionList';
import { toast } from '../../utils/chat/toast';
import { PRESSABLE, PRESSABLE_ICON, PRESSABLE_TEXT } from '../../config/motion';

type SessionListSection = {
    key: 'active' | 'history';
    title: string;
    description: string;
    items: SessionListItem[];
};

interface SessionListProps {
    onCollapse: () => void;
    fluidWidth?: boolean;
}

function getStatusPresentation(status: SessionListItem['status']) {
    if (status === 'in_progress') {
        return {
            label: '进行中',
            dot: 'var(--accent-emerald)',
            badgeBackground: 'var(--accent-emerald-alpha)',
            badgeColor: 'var(--color-green-600)',
            icon: Clock3,
        };
    }

    if (status === 'error') {
        return {
            label: '异常',
            dot: 'var(--accent-rose)',
            badgeBackground: 'var(--accent-rose-alpha)',
            badgeColor: 'var(--accent-rose)',
            icon: AlertCircle,
        };
    }

    if (status === 'pending') {
        return {
            label: '等待中',
            dot: 'var(--accent-amber)',
            badgeBackground: 'var(--accent-amber-alpha)',
            badgeColor: 'var(--color-amber-600)',
            icon: Clock3,
        };
    }

    return {
        label: '已完成',
        dot: 'var(--text-muted)',
        badgeBackground: 'var(--bg-tertiary)',
        badgeColor: 'var(--text-muted)',
        icon: CheckCircle2,
    };
}

export default function SessionList({ onCollapse, fluidWidth = false }: SessionListProps) {
    const { sessions, currentSessionId } = useSessionListViewState();
    const { setSessions, setCurrentSession } = useSessionActions();
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
            const fullSession = await api.sessions.get(item.id);
            const latestRunId = fullSession.latest_run_id ?? item.latest_run_id ?? null;
            const latestRun = latestRunId ? await api.runs.get(latestRunId) : null;
            if (sessionSelectionRequestRef.current !== requestId) return;

            setCurrentSession(fullSession);
            if (latestRun) {
                useDebateStore.getState().setActiveRun(latestRun.run);
            }
        } catch (err) {
            console.error('Failed to load session details', err);
            toast('加载辩论记录失败', 'error');
        }
    }, [currentSessionId, setCurrentSession]);

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

    const sessionSections = useMemo<SessionListSection[]>(() => {
        const activeItems = filteredSessions.filter((item) => (
            item.status === 'in_progress' || item.status === 'pending' || item.status === 'error'
        ));
        const historyItems = filteredSessions.filter((item) => (
            item.status !== 'in_progress' && item.status !== 'pending' && item.status !== 'error'
        ));

        const sections: SessionListSection[] = [
            {
                key: 'active',
                title: '进行中的辩论',
                description: '需要关注',
                items: activeItems,
            },
            {
                key: 'history',
                title: '历史记录',
                description: '已归档',
                items: historyItems,
            },
        ];

        return sections.filter((section) => section.items.length > 0);
    }, [filteredSessions]);

    const activeCount = useMemo(
        () => filteredSessions.filter((item) => item.status === 'in_progress' || item.status === 'pending').length,
        [filteredSessions],
    );

    return (
        <aside style={{
            width: fluidWidth ? '100%' : '320px',
            minWidth: fluidWidth ? 0 : '280px',
            maxWidth: fluidWidth ? '100%' : '380px',
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
                    {...PRESSABLE_ICON}
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
                    {...PRESSABLE}
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
                        transition: 'background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast)',
                    }}
                >
                    <Plus size={16} strokeWidth={2.5} />
                    新辩题
                </motion.button>

                <div style={{
                    position: 'relative',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-lg)',
                    transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
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
                padding: '0 18px 12px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: '12px',
            }}>
                <div style={{ minWidth: 0 }}>
                    <h2 style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        letterSpacing: 0,
                        margin: 0,
                        lineHeight: 1.3,
                    }}>
                        辩论记录
                    </h2>
                    <p style={{
                        margin: '2px 0 0',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        lineHeight: 1.4,
                    }}>
                        按状态分层浏览
                    </p>
                </div>
                <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '24px',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                }}>
                    {filteredSessions.length} 条
                    {activeCount > 0 && (
                        <span style={{ color: 'var(--color-green-600)' }}>
                            · {activeCount} 进行中
                        </span>
                    )}
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '10px' }}>
                        {sessionSections.map((section) => (
                            <section key={section.key} style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '8px',
                                        padding: '0 6px 7px',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                                        <span
                                            style={{
                                                width: '4px',
                                                height: '14px',
                                                borderRadius: 'var(--radius-full)',
                                                background: section.key === 'active'
                                                    ? 'var(--accent-emerald)'
                                                    : 'var(--border-subtle)',
                                                flexShrink: 0,
                                            }}
                                        />
                                        <span
                                            style={{
                                                color: 'var(--text-secondary)',
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                lineHeight: 1.3,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {section.title}
                                        </span>
                                        <span
                                            style={{
                                                color: 'var(--text-muted)',
                                                fontSize: '10px',
                                                fontWeight: 600,
                                                lineHeight: 1.3,
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {section.description}
                                        </span>
                                    </div>
                                    <span
                                        style={{
                                            color: 'var(--text-muted)',
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {section.items.length}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    {section.items.map((item) => {
                                        const isActive = item.id === currentSessionId;
                                        const isHovered = hoveredId === item.id;
                                        const isSophistryRecord = item.debate_mode === 'sophistry_experiment';
                                        const modePresentation = getSessionModePresentation(item.debate_mode);
                                        const statusPresentation = getStatusPresentation(item.status);
                                        const StatusIcon = statusPresentation.icon;
                                        const activeAccent = isSophistryRecord
                                            ? 'var(--mode-sophistry-accent)'
                                            : item.status === 'in_progress'
                                                ? 'var(--accent-emerald)'
                                                : 'var(--accent-indigo)';
                            return (
                                /* Plain div: the row's hover/active feedback is the CSS
                                   background transition below, and a text-bearing row must
                                   never scale. Keeps long lists off the motion render loop. */
                                <div
                                    key={item.id}
                                    data-session-mode={item.debate_mode}
                                    role="button"
                                    tabIndex={0}
                                    onMouseEnter={() => setHoveredId(item.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    onClick={() => handleSelectSession(item)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            void handleSelectSession(item);
                                        }
                                    }}
                                    style={{
                                        padding: '10px 10px 10px 12px',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        background: isActive
                                            ? (isSophistryRecord ? 'var(--mode-sophistry-card)' : 'var(--bg-card)')
                                            : isHovered
                                                ? 'var(--bg-tertiary)'
                                                : 'transparent',
                                        border: isActive
                                            ? (isSophistryRecord ? '1px solid var(--mode-sophistry-border)' : '1px solid var(--border-subtle)')
                                            : '1px solid transparent',
                                        boxShadow: isActive
                                            ? 'var(--shadow-xs)'
                                            : 'none',
                                        transition: 'background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast)',
                                        position: 'relative',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '9px',
                                        minWidth: 0,
                                    }}
                                >
                                    {isActive && (
                                        <span
                                            aria-hidden="true"
                                            style={{
                                                position: 'absolute',
                                                left: 0,
                                                top: '10px',
                                                bottom: '10px',
                                                width: '3px',
                                                borderRadius: '0 var(--radius-full) var(--radius-full) 0',
                                                background: activeAccent,
                                            }}
                                        />
                                    )}

                                    {/* Status indicator */}
                                    <div
                                        style={{
                                            width: '18px',
                                            display: 'flex',
                                            justifyContent: 'center',
                                            paddingTop: '6px',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: item.status === 'in_progress' ? '8px' : '7px',
                                                height: item.status === 'in_progress' ? '8px' : '7px',
                                                borderRadius: 'var(--radius-full)',
                                                background: statusPresentation.dot,
                                                boxShadow: item.status === 'in_progress'
                                                    ? '0 0 0 3px var(--accent-emerald-alpha)'
                                                    : 'none',
                                            }}
                                            aria-hidden="true"
                                        />
                                    </div>

                                    {/* Content */}
                                    <div style={{
                                        flex: 1,
                                        minWidth: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px',
                                    }}>
                                        {/* Topic */}
                                        <div style={{
                                            fontWeight: isActive ? 700 : section.key === 'active' ? 650 : 600,
                                            fontSize: '13px',
                                            color: isSophistryRecord
                                                ? 'var(--text-primary)'
                                                : (isActive ? 'var(--text-primary)' : 'var(--text-secondary)'),
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
                                            gap: '6px',
                                            flexWrap: 'wrap',
                                            fontSize: '11px',
                                            color: 'var(--text-muted)',
                                        }}>
                                            <span style={{
                                                padding: '2px 6px',
                                                borderRadius: 'var(--radius-full)',
                                                background: modePresentation.badgeBackground,
                                                color: modePresentation.badgeColor,
                                                border: modePresentation.badgeBorder,
                                                fontWeight: 700,
                                                fontSize: '10px',
                                                letterSpacing: 0,
                                                lineHeight: 1.2,
                                            }}>
                                                {modePresentation.label}
                                            </span>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '2px 6px',
                                                borderRadius: 'var(--radius-full)',
                                                background: statusPresentation.badgeBackground,
                                                color: statusPresentation.badgeColor,
                                                fontWeight: 700,
                                                fontSize: '10px',
                                                lineHeight: 1.2,
                                            }}>
                                                <StatusIcon size={10} />
                                                {statusPresentation.label}
                                            </span>
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    minHeight: '18px',
                                                    color: isActive ? 'var(--text-secondary)' : 'var(--text-muted)',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    lineHeight: 1.2,
                                                }}
                                            >
                                                {item.current_turn}/{item.max_turns} 轮
                                            </span>
                                        </div>
                                    </div>

                                    {/* Delete button */}
                                    <motion.button
                                        initial={false}
                                        animate={{ opacity: isHovered || isActive ? 1 : 0 }}
                                        {...PRESSABLE_ICON}
                                        onClick={(e) => handleDelete(e, item.id)}
                                        onPointerDown={(e) => {
                                            e.stopPropagation();
                                        }}
                                        style={{
                                            flexShrink: 0,
                                            background: isHovered || isActive ? 'var(--bg-tertiary)' : 'transparent',
                                            border: '1px solid transparent',
                                            color: 'var(--text-muted)',
                                            cursor: 'pointer',
                                            padding: '4px',
                                            borderRadius: 'var(--radius-sm)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginTop: '2px',
                                            transition: 'background-color var(--transition-fast), color var(--transition-fast)',
                                        }}
                                        title="删除"
                                    >
                                        <Trash2 size={14} />
                                    </motion.button>
                                </div>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                        {sessions.length < total && !searchQuery && (
                            <motion.button
                                {...PRESSABLE_TEXT}
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
                                    transition: 'background-color var(--transition-fast), color var(--transition-fast), opacity var(--transition-fast)',
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
                    {...PRESSABLE_ICON}
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
                    {...PRESSABLE_ICON}
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
