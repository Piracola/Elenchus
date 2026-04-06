import { motion } from 'framer-motion';

type RadioCardOption<T extends string> = {
    value: T;
    label: string;
    description: string;
};

type SettingsRadioCardGroupProps<T extends string> = {
    options: RadioCardOption<T>[];
    selectedValue: T;
    onSelect: (value: T) => void;
};

export function SettingsRadioCardGroup<T extends string>({
    options,
    selectedValue,
    onSelect,
}: SettingsRadioCardGroupProps<T>) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
        }}>
            {options.map((option) => (
                <motion.div
                    key={option.value}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => onSelect(option.value)}
                    style={{
                        padding: '14px 16px',
                        borderRadius: 'var(--radius-lg)',
                        background: selectedValue === option.value ? 'var(--bg-tertiary)' : 'transparent',
                        border: `1px solid ${selectedValue === option.value ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        transition: 'all var(--transition-fast)',
                        boxShadow: selectedValue === option.value ? 'var(--shadow-sm)' : 'none',
                    }}
                >
                    <div
                        style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            border: `2px solid ${selectedValue === option.value ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: '2px',
                        }}
                    >
                        {selectedValue === option.value && (
                            <div
                                style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: 'var(--accent-indigo)',
                                }}
                            />
                        )}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div
                            style={{
                                fontWeight: 600,
                                fontSize: '16px',
                                color: 'var(--text-primary)',
                                marginBottom: '4px',
                            }}
                        >
                            {option.label}
                        </div>
                        <div
                            style={{
                                fontSize: '14px',
                                color: 'var(--text-muted)',
                                lineHeight: 1.5,
                            }}
                        >
                            {option.description}
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
