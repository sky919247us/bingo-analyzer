/**
 * 分析期數切換按鈕組（共用）
 * 沿用 filter-group / filter-btn 樣式
 */

/** 預設可選期數 */
export const DEFAULT_PERIOD_OPTIONS = [5, 10, 20, 25, 30, 50, 100];

interface PeriodSelectorProps {
    /** 目前選取的期數 */
    value: number;
    /** 切換期數 */
    onChange: (periods: number) => void;
    /** 可選期數，預設 5/10/20/25/30/50/100 */
    options?: number[];
}

export default function PeriodSelector({ value, onChange, options = DEFAULT_PERIOD_OPTIONS }: PeriodSelectorProps) {
    return (
        <div className="filter-group">
            {options.map((n) => (
                <button
                    key={n}
                    type="button"
                    className={`filter-btn${value === n ? ' active' : ''}`}
                    onClick={() => onChange(n)}
                >
                    {n}期
                </button>
            ))}
        </div>
    );
}
