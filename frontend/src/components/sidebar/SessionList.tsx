/**
 * SessionList — left sidebar to view past and active debate sessions.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Settings, Sun, Moon } from 'lucide-react';
import { useDebateStore } from '../../stores/debateStore';
import { useThemeStore } from '../../stores/themeStore';
import { api } from '../../api/client';
import ModelConfigManager from './ModelConfigManager';
import type { SessionListItem } from '../../types';

export default function SessionList() {
    const { sessions, setSessions, currentSessionId, setCurrentSessionId, setCurrentSession } = useDebateStore();
    const { theme, toggleTheme } = useThemeStore();
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const loadSessions = async () => {
        try {
            const data = await api.sessions.list();
            setSessions(data.sessions);
        } catch (err) {
            console.error('Failed to load sessions', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSessions();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSelectSession = async (item: SessionListItem) => {
        if (item.id === currentSessionId) return;
        try {
            const fullSession = await api.sessions.get(item.id);
            setCurrentSession(fullSession);
            setCurrentSessionId(fullSession.id);
        } catch (err) {
            console.error('Failed to load session details', err);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('确定删除此 Session 吗？')) return;

        try {
            await api.sessions.delete(id);
            if (currentSessionId === id) {
                setCurrentSessionId(null);
                setCurrentSession(null);
            }
            await loadSessions();
        } catch (err) {
            console.error('Failed to delete session', err);
        }
    };

    return (
        <aside style={{
            width: '280px',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-secondary)',
            height: '100%'
        }}>
            {/* Header / Logo */}
            <div style={{
                padding: '24px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                <div>
                    <h1 style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                        Elenchus
                    </h1>
                </div>
            </div>

            {/* Actions: New / Search */}
            <div style={{ padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                    onClick={() => {
                        setCurrentSessionId(null);
                        setCurrentSession(null);
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 16px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'transparent', // 'var(--bg-primary)'
                        border: '1px solid transparent',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        cursor: 'pointer',
                        transition: 'background var(--transition-fast)'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <Plus size={18} />
                    新辩题
                </button>
                <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '16px', top: '11px', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="搜索辩题"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 16px 10px 40px',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '14px'
                        }}
                    />
                </div>
            </div>

            <div style={{
                padding: '0 20px 12px',
                borderBottom: '1px solid var(--border-subtle)'
            }}>
                <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    辩论记录
                </h2>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {isLoading ? (
                    <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        加载中...
                    </div>
                ) : sessions.length === 0 ? (
                    <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        暂无历史辩论
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {sessions.map((item) => {
                            const isActive = item.id === currentSessionId;
                            return (
                                <motion.div
                                    key={item.id}
                                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                                    onClick={() => handleSelectSession(item)}
                                    style={{
                                        padding: '16px 20px',
                                        borderBottom: '1px solid var(--border-subtle)',
                                        cursor: 'pointer',
                                        background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                                        borderLeft: isActive ? '3px solid var(--accent-indigo)' : '3px solid transparent',
                                        transition: 'background var(--transition-fast)',
                                        position: 'relative',
                                    }}
                                >
                                    <div style={{
                                        fontWeight: isActive ? 600 : 500,
                                        fontSize: '14px',
                                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        marginBottom: '6px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        paddingRight: '24px', // avoid delete btn overlap
                                    }}>
                                        {item.topic}
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        <span>
                                            {item.status === 'in_progress' ? '进行中' : '已完成'}
                                        </span>
                                        <span>共 {item.current_turn} / {item.max_turns} 轮</span>
                                    </div>

                                    <button
                                        onClick={(e) => handleDelete(e, item.id)}
                                        style={{
                                            position: 'absolute',
                                            right: '12px',
                                            top: '16px',
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            opacity: 0.6,
                                        }}
                                        title="删除"
                                    >
                                        ×
                                    </button>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Bottom Actions */}
            <div style={{
                padding: '16px 20px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: 'var(--text-secondary)'
            }}>
                <button
                    style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px',
                    }}
                    title="设置"
                    onClick={() => setIsSettingsOpen(true)}
                >
                    <Settings size={20} />
                </button>

                <button
                    onClick={toggleTheme}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px',
                        borderRadius: 'var(--radius-sm)',
                    }}
                    title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>

            <ModelConfigManager
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
        </aside>
    );
}
