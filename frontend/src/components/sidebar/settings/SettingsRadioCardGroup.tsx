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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {options.map((option) => (
                <motion.div
                    key={option.value}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => onSelect(option.value)}
                    style={{
                        padding: '16px 20px',
                        borderRadius: 'var(--radius-lg)',
                        background: selectedValue === option.value ? 'var(--bg-tertiary)' : 'transparent',
                        border: `1px solid ${selectedValue === option.value ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        transition: 'all var(--transition-fast)',
                        boxShadow: selectedValue === option.value ? 'var(--shadow-sm)' : 'none',
                    }}
                >
                    <div
                        style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            border: `2px solid ${selectedValue === option.value ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        {selectedValue === option.value && (
                            <div
                                style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: 'var(--accent-indigo)',
                                }}
                            />
                        )}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div
                            style={{
                                fontWeight: 700,
                                fontSize: '15px',
                                color: 'var(--text-primary)',
                            }}
                        >
                            {option.label}
                        </div>
                        <div
                            style={{
                                fontSize: '13px',
                                color: 'var(--text-muted)',
                                marginTop: '4px',
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
