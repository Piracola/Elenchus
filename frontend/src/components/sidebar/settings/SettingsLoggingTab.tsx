import { motion } from 'framer-motion';
import type { LogLevel } from '../../../types';

const LOG_LEVELS: { value: LogLevel; label: string; description: string }[] = [
    { value: 'DEBUG', label: 'DEBUG', description: '详细调试信息，包含所有操作细节' },
    { value: 'INFO', label: 'INFO', description: '常规运行信息，记录关键操作' },
    { value: 'WARNING', label: 'WARNING', description: '警告信息，潜在问题提示' },
    { value: 'ERROR', label: 'ERROR', description: '错误信息，功能异常记录' },
    { value: 'CRITICAL', label: 'CRITICAL', description: '严重错误，系统级故障' },
];

type SettingsLoggingTabProps = {
    logLevel: LogLevel;
    onLogLevelChange: (level: LogLevel) => void;
};

export function SettingsLoggingTab({ logLevel, onLogLevelChange }: SettingsLoggingTabProps) {
    return (
        <div style={{
            padding: '32px',
            overflowY: 'auto',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-xs)',
        }}>
            <div style={{
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '24px',
                marginBottom: '28px',
            }}>
                <h3 style={{
                    fontSize: '24px',
                    margin: '0 0 10px',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                }}>
                    日志打印等级
                </h3>
                <p style={{ margin: 0, fontSize: '16px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    控制后端服务的日志输出级别，日志将存储在项目根目录的 logs 文件夹中。
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {LOG_LEVELS.map((level) => (
                    <motion.div
                        key={level.value}
                        whileHover={{ scale: 1.01 }}
                        onClick={() => onLogLevelChange(level.value)}
                        style={{
                            padding: '16px 20px',
                            borderRadius: 'var(--radius-lg)',
                            background: logLevel === level.value ? 'var(--bg-tertiary)' : 'transparent',
                            border: `1px solid ${logLevel === level.value ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            transition: 'all var(--transition-fast)',
                            boxShadow: logLevel === level.value ? 'var(--shadow-sm)' : 'none',
                        }}
                    >
                        <div style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            border: `2px solid ${logLevel === level.value ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            {logLevel === level.value && (
                                <div style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: 'var(--accent-indigo)',
                                }} />
                            )}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{
                                fontWeight: 700,
                                fontSize: '15px',
                                color: 'var(--text-primary)',
                            }}>
                                {level.label}
                            </div>
                            <div style={{
                                fontSize: '13px',
                                color: 'var(--text-muted)',
                                marginTop: '4px',
                            }}>
                                {level.description}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div style={{
                marginTop: '32px',
                padding: '20px 24px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-inner)',
            }}>
                <div style={{
                    fontSize: '15px',
                    color: 'var(--text-secondary)',
                    marginBottom: '10px',
                    fontWeight: 600,
                }}>
                    日志文件位置
                </div>
                <code style={{
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-card)',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    display: 'block',
                    fontFamily: 'monospace',
                    boxShadow: 'var(--shadow-inner)',
                }}>
                    ./runtime/logs/elenchus_YYYY-MM-DD.log
                </code>
            </div>
        </div>
    );
}
