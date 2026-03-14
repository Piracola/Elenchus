import { useMemo } from 'react';
import { motion } from 'framer-motion';
import ReactECharts from 'echarts-for-react';
import { useDebateStore } from '../stores/debateStore';
import { useThemeStore } from '../stores/themeStore';
import { api } from '../api/client';
import { SCORE_DIMENSIONS } from '../types';

/**
 * ScorePanel — scoring sidebar with radar chart and export functions.
 */
export default function ScorePanel() {
    const { currentSession, currentSessionId } = useDebateStore();
    const { theme } = useThemeStore();

    const radarOption = useMemo(() => {
        if (!currentSession?.current_scores || Object.keys(currentSession.current_scores).length === 0) {
            return null;
        }

        const scores = currentSession.current_scores;
        const textColor = theme === 'dark' ? '#9ca3af' : '#6b7280';

        const toValues = (role: string) =>
            SCORE_DIMENSIONS.map(d => scores[role]?.[d.key]?.score ?? 0);

        return {
            tooltip: {
                trigger: 'item',
                backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                textStyle: { color: theme === 'dark' ? '#f3f4f6' : '#111827' }
            },
            legend: {
                data: ['正方', '反方'],
                bottom: 0,
                textStyle: { color: textColor, fontSize: 12 },
                itemWidth: 14,
                itemHeight: 14
            },
            radar: {
                indicator: SCORE_DIMENSIONS.map(d => ({ name: d.label, max: d.max })),
                radius: '65%',
                center: ['50%', '45%'],
                splitNumber: 4,
                axisName: { color: textColor, fontSize: 11 },
                splitLine: { lineStyle: { color: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' } },
                splitArea: { show: false },
                axisLine: { lineStyle: { color: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' } }
            },
            series: [{
                name: '实时评分',
                type: 'radar',
                data: [
                    { value: toValues('proposer'), name: '正方', itemStyle: { color: '#6366f1' }, areaStyle: { color: 'rgba(99, 102, 241, 0.2)' } },
                    { value: toValues('opposer'), name: '反方', itemStyle: { color: '#f43f5e' }, areaStyle: { color: 'rgba(244, 63, 94, 0.2)' } }
                ]
            }]
        };
    }, [currentSession?.current_scores, theme]);

    const handleExport = (format: 'json' | 'markdown') => {
        if (!currentSessionId) return;
        if (format === 'json') {
            api.sessions.exportJson(currentSessionId);
        } else {
            api.sessions.exportMarkdown(currentSessionId);
        }
    };

    return (
        <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            style={{ width: '340px', display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', overflowY: 'auto' }}
        >
            <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📈 实时评分
                </h3>
                <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', border: radarOption ? 'none' : '1px dashed var(--border-subtle)', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {radarOption ? (
                        <ReactECharts option={radarOption} style={{ height: '100%', width: '100%' }} theme={theme === 'dark' ? 'dark' : 'light'} />
                    ) : (
                        <span>暂无裁判评分数据</span>
                    )}
                </div>
            </div>

            <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    评分维度
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {SCORE_DIMENSIONS.map((dim) => (
                        <div key={dim.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)' }}>
                            <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>{dim.icon}</span>
                                <span>{dim.label}</span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleExport('markdown')} style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all var(--transition-fast)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    📥 导出 Markdown
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleExport('json')} style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all var(--transition-fast)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    📥 导出 JSON
                </motion.button>
            </div>
        </motion.aside>
    );
}
