/**
 * SessionList — left sidebar to view past and active debate sessions.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';
import { api } from '../../api/client';
import type { SessionListItem } from '../../types';

export default function SessionList() {
    const { sessions, setSessions, currentSessionId, setCurrentSessionId, setCurrentSession } = useDebateStore();
    const [isLoading, setIsLoading] = useState(true);

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
        }}>
            <div style={{
                padding: '20px',
                borderBottom: '1px solid var(--border-subtle)'
            }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    历史辩论 (Sessions)
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
                                            {item.status === 'in_progress' ? '🟠 进行中' : '🟢 已完成'}
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
        </aside>
    );
}
