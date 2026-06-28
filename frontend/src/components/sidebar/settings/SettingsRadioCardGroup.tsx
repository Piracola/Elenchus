type RadioCardOption<T extends string> = {
    value: T;
    label: string;
    description: string;
    disabled?: boolean;
};

type SettingsRadioCardGroupProps<T extends string> = {
    options: RadioCardOption<T>[];
    selectedValue: T;
    onSelect: (value: T) => void;
    layout?: 'grid' | 'list';
};

export function SettingsRadioCardGroup<T extends string>({
    options,
    selectedValue,
    onSelect,
    layout = 'grid',
}: SettingsRadioCardGroupProps<T>) {
    return (
        <div className={layout === 'grid' ? 'settings-radio-grid' : 'settings-radio-list'}>
            {options.map((option) => {
                const isSelected = selectedValue === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        disabled={option.disabled}
                        className={`settings-radio-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => onSelect(option.value)}
                        aria-pressed={isSelected}
                    >
                        <span className="settings-radio-dot" aria-hidden="true" />
                        <span>
                            <span className="settings-radio-title">{option.label}</span>
                            <span className="settings-radio-description">{option.description}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
