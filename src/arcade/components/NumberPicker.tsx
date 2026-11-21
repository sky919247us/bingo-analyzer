/**
 * 80 格選號盤
 */
interface Props {
    selected: number[];
    max: number;
    onChange: (next: number[]) => void;
    disabled?: boolean;
}

export default function NumberPicker({ selected, max, onChange, disabled }: Props) {
    const set = new Set(selected);
    const full = selected.length >= max;
    const toggle = (n: number) => {
        if (set.has(n)) onChange(selected.filter((x) => x !== n));
        else if (!full) onChange([...selected, n].sort((a, b) => a - b));
    };
    return (
        <div className="arcade-picker" role="group" aria-label="選號盤">
            {Array.from({ length: 80 }, (_, i) => {
                const n = i + 1;
                const on = set.has(n);
                return (
                    <button
                        key={n}
                        type="button"
                        className={`arcade-pick${on ? ' is-on' : ''}`}
                        aria-pressed={on}
                        disabled={disabled || (!on && full)}
                        onClick={() => toggle(n)}
                    >
                        {String(n).padStart(2, '0')}
                    </button>
                );
            })}
        </div>
    );
}
