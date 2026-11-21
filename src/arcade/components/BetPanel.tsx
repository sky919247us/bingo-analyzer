/**
 * 下注面板：玩法、選號（含快選）、倍數、連續期數、注數與花費、截止倒數、已預約
 */
import { useState } from 'react';
import type { BetItem } from '../api';
import { itemCost, itemLabel, itemUnits, MAX_ITEMS_PER_PERIOD, MULTIPLIERS, quickPick, validateItem, type PlayedBet } from '../payout';
import { sfx } from '../audio';
import { itemKey, periodList, PERIOD_OPTIONS, shortDateIfOther, type ReservationGroup } from '../multi';
import NumberPicker from './NumberPicker';
import { DisclaimerBar } from './Disclaimer';

export type GameKind = BetItem['game'];

export interface Draft {
    game: GameKind;
    star: number;
    numbers: number[];
    pick: string | null;
    multiplier: number;
    /** 連續投注期數（含當期） */
    periods: number;
}

export const EMPTY_DRAFT: Draft = { game: 'basic', star: 5, numbers: [], pick: null, multiplier: 1, periods: 1 };

const GAMES: { key: GameKind; label: string }[] = [
    { key: 'basic', label: '基本 1~10 星' },
    { key: 'super', label: '超級獎號' },
    { key: 'bigSmall', label: '猜大小' },
    { key: 'oddEven', label: '猜單雙' },
];

/** 草稿轉成投注項目；不完整回傳 null */
export function draftItem(d: Draft): BetItem | null {
    let item: BetItem;
    switch (d.game) {
        case 'basic': item = { game: 'basic', star: d.star, numbers: d.numbers }; break;
        case 'super': item = { game: 'super', numbers: d.numbers }; break;
        case 'bigSmall':
            if (d.pick !== '大' && d.pick !== '小') return null;
            item = { game: 'bigSmall', pick: d.pick }; break;
        case 'oddEven':
            if (d.pick !== '單' && d.pick !== '雙') return null;
            item = { game: 'oddEven', pick: d.pick }; break;
    }
    return validateItem(item) ? null : item;
}

function fmtClock(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
    draft: Draft;
    setDraft: (d: Draft) => void;
    period: string | null;
    secondsToClose: number;
    /** 不能下注的原因（null = 可下注） */
    blockedReason: string | null;
    placed: PlayedBet[];
    balance: number;
    demo: boolean;
    /** 期別 → 開獎日期（台北 YYYY-MM-DD；推不出回 null），跨日的期別顯示日期用 */
    periodDate: (period: string) => string | null;
    /** 今天（台北 YYYY-MM-DD） */
    today: string;
    /** 查某期已下的注（含多期預約） */
    betsOf: (period: string) => PlayedBet[];
    /** 已預約（尚未開獎）的注，依群組彙總 */
    reservations: ReservationGroup[];
    onPlace: (period: string, multiplier: number, items: BetItem[], periods: number) => Promise<void>;
}

export default function BetPanel({ draft, setDraft, period, secondsToClose, blockedReason, placed, balance, demo, periodDate, today, betsOf, reservations, onPlace }: Props) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const item = draftItem(draft);
    /** 期數只能是官方選項（1~10、12）；可跨日 */
    const nPeriods = (PERIOD_OPTIONS as readonly number[]).includes(draft.periods ?? 1) ? (draft.periods ?? 1) : 1;
    /** 期別加註日期（不是今天的才標，例：「11/21 115063950」） */
    const withDate = (p: string) => {
        const d = shortDateIfOther(periodDate(p), today);
        return d ? `${d} ${p}` : p;
    };
    const rangeText = (first: string, n: number) => {
        if (n <= 1) return `第 ${withDate(first)} 期`;
        const list = periodList(first, n);
        return `${withDate(list[0])} ~ ${withDate(list[n - 1])} 共 ${n} 期`;
    };
    const crossDay = !!period && nPeriods > 1 && periodDate(periodList(period, nPeriods)[nPeriods - 1]) !== periodDate(period);
    const unitCost = item ? itemCost(item, draft.multiplier) : 0;
    const cost = unitCost * nPeriods;
    const targetPeriods = period ? periodList(period, nPeriods) : [];
    /** 目標期別中已有「同一組」的期別（預約中的期別不能重複下注同組） */
    const dupPeriods = item ? targetPeriods.filter((p) => betsOf(p).some((b) => itemKey(b.item) === itemKey(item))) : [];
    /** 目標期別中已滿 20 項的期別 */
    const fullPeriods = targetPeriods.filter((p) => betsOf(p).length >= MAX_ITEMS_PER_PERIOD);
    const units = item ? itemUnits(item) : 0;
    const maxPick = draft.game === 'basic' ? draft.star : 20;
    const tooMany = placed.length >= MAX_ITEMS_PER_PERIOD;
    const disabledReason = blockedReason
        ?? (tooMany ? `每期最多 ${MAX_ITEMS_PER_PERIOD} 個項目` : null)
        ?? (fullPeriods.length > 0 ? `第 ${fullPeriods[0]} 期已達 ${MAX_ITEMS_PER_PERIOD} 項` : null)
        ?? (dupPeriods.length > 0 ? `第 ${dupPeriods[0]} 期已有同一組` : null);

    const set = (patch: Partial<Draft>) => { setDraft({ ...draft, ...patch }); setMsg(null); };

    const changeGame = (g: GameKind) => set({ game: g, numbers: g === draft.game ? draft.numbers : [], pick: null });
    const changeStar = (s: number) => set({ star: s, numbers: draft.numbers.slice(0, s) });

    const submit = async () => {
        if (!item || !period || disabledReason) return;
        if (cost > balance) { setMsg({ ok: false, text: '代幣不足，可先簽到或領取救濟' }); return; }
        setBusy(true);
        sfx.click();
        try {
            await onPlace(period, draft.multiplier, [item], nPeriods);
            setMsg({
                ok: true,
                text: nPeriods > 1
                    ? `已下注：${itemLabel(item)} ×${draft.multiplier}・${rangeText(period, nPeriods)}（${cost.toLocaleString()} 幣）`
                    : `已下注：${itemLabel(item)} ×${draft.multiplier}（${cost.toLocaleString()} 幣）`,
            });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : '下注失敗' });
        } finally {
            setBusy(false);
        }
    };

    const placedCost = placed.reduce((s, b) => s + itemCost(b.item, b.multiplier), 0);

    return (
        <section className="arcade-panel arcade-bet" aria-label="下注">
            <header className="arcade-bet-head">
                <h2 className="arcade-panel-title">下注 {period ? <small>第 {period} 期</small> : null}</h2>
                <div className={`arcade-countdown${secondsToClose <= 30 ? ' is-urgent' : ''}`}>
                    {blockedReason === null || secondsToClose > 0 ? <>截止 <b>{fmtClock(secondsToClose)}</b></> : '已截止'}
                </div>
            </header>

            <div className="arcade-seg" role="tablist" aria-label="玩法">
                {GAMES.map((g) => (
                    <button key={g.key} type="button" role="tab" aria-selected={draft.game === g.key}
                        className={`arcade-seg-btn${draft.game === g.key ? ' is-on' : ''}`} onClick={() => changeGame(g.key)}>
                        {g.label}
                    </button>
                ))}
            </div>

            {draft.game === 'basic' && (
                <div className="arcade-stars" role="group" aria-label="星數">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => (
                        <button key={s} type="button" className={`arcade-chip${draft.star === s ? ' is-on' : ''}`} onClick={() => changeStar(s)}>
                            {s}星
                        </button>
                    ))}
                </div>
            )}

            {(draft.game === 'basic' || draft.game === 'super') && (
                <>
                    <div className="arcade-pick-bar">
                        <span>已選 <b>{draft.numbers.length}</b> / {maxPick}</span>
                        <button type="button" className="arcade-btn arcade-btn--sm" onClick={() => set({ numbers: quickPick(draft.game === 'basic' ? draft.star : draft.numbers.length || 3) })}>快選</button>
                        <button type="button" className="arcade-btn arcade-btn--sm arcade-btn--ghost" onClick={() => set({ numbers: [] })}>清除</button>
                    </div>
                    <NumberPicker selected={draft.numbers} max={maxPick} onChange={(n) => set({ numbers: n })} />
                    {draft.game === 'super' && <p className="arcade-hint">猜第 20 顆（超級獎號），每個號碼 1 注，中獎 1,200 × 倍數</p>}
                </>
            )}

            {(draft.game === 'bigSmall' || draft.game === 'oddEven') && (
                <div className="arcade-sides">
                    {(draft.game === 'bigSmall' ? ['大', '小'] : ['單', '雙']).map((p) => (
                        <button key={p} type="button" className={`arcade-side-btn${draft.pick === p ? ' is-on' : ''}`} onClick={() => set({ pick: p })}>
                            {p}
                            <small>{draft.game === 'bigSmall' ? (p === '大' ? '41~80 ≥13 顆' : '01~40 ≥13 顆') : `${p}數 ≥13 顆`}</small>
                        </button>
                    ))}
                    <p className="arcade-hint">中獎 150 × 倍數；兩邊都不足 13 顆為和局（不中獎）</p>
                </div>
            )}

            <div className="arcade-mults" role="group" aria-label="倍數">
                {MULTIPLIERS.map((m) => (
                    <button key={m} type="button" className={`arcade-chip arcade-chip--mult${draft.multiplier === m ? ' is-on' : ''}`} onClick={() => set({ multiplier: m })}>
                        ×{m}
                    </button>
                ))}
            </div>

            <div className="arcade-periods-head">
                <span>連續期數</span>
                {crossDay && <small className="arcade-crossday">含隔日期別</small>}
            </div>
            <div className="arcade-periods" role="group" aria-label="連續期數">
                {PERIOD_OPTIONS.map((n) => (
                    <button key={n} type="button"
                        className={`arcade-chip arcade-chip--period${nPeriods === n ? ' is-on' : ''}`}
                        aria-pressed={nPeriods === n} onClick={() => set({ periods: n })}>
                        {n}期
                    </button>
                ))}
            </div>

            <div className="arcade-cost">
                <span>{units} 注 × 25 × {draft.multiplier} 倍</span>
                <b>{cost.toLocaleString()} 幣</b>
            </div>
            <p className="arcade-cost-multi" aria-live="polite">
                單期 {unitCost.toLocaleString()} 幣 × {nPeriods} 期 ＝ 總計 <b>{cost.toLocaleString()}</b> 幣
                {period && nPeriods > 1 && <><br />期別：{rangeText(period, nPeriods)}</>}
            </p>

            <button type="button" className="arcade-btn arcade-btn--gold arcade-btn--block arcade-btn--xl"
                disabled={!item || !!disabledReason || busy} onClick={submit}>
                {disabledReason ?? (busy ? '下注中…' : item
                    ? (nPeriods > 1 && period ? `確認下注 ${rangeText(period, nPeriods)}` : '確認下注')
                    : draft.game === 'basic' ? `請選 ${draft.star} 個號碼` : '請完成選擇')}
            </button>
            {msg && <p className={msg.ok ? 'arcade-ok' : 'arcade-error'}>{msg.text}</p>}
            {demo && <p className="arcade-demo-note">試玩模式・不計排行</p>}

            {placed.length > 0 && (
                <div className="arcade-placed">
                    <div className="arcade-placed-head">本期已下注 {placed.length} 項・{placedCost.toLocaleString()} 幣</div>
                    <ul>
                        {placed.map((b, i) => (
                            <li key={i}>
                                <span>{itemLabel(b.item)} ×{b.multiplier}</span>
                                {'numbers' in b.item && <span className="arcade-placed-nums">{b.item.numbers.map((n) => String(n).padStart(2, '0')).join(' ')}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {reservations.length > 0 && (
                <div className="arcade-placed arcade-reserved">
                    <div className="arcade-placed-head">
                        已預約 {new Set(reservations.flatMap((g) => g.periods)).size} 期・{reservations.length} 組
                    </div>
                    <ul>
                        {reservations.map((g) => (
                            <li key={g.groupId}>
                                <span>
                                    {g.items.map((b) => `${itemLabel(b.item)} ×${b.multiplier}`).join('、')}
                                    ・剩 {g.periods.length} 期
                                </span>
                                <span className="arcade-reserved-range">
                                    {g.periods.length > 1 ? `${withDate(g.periods[0])} ~ ${withDate(g.periods[g.periods.length - 1])}` : `第 ${withDate(g.periods[0])} 期`}
                                </span>
                                {g.items.map((b, i) => 'numbers' in b.item && (
                                    <span key={i} className="arcade-placed-nums">{b.item.numbers.map((n) => String(n).padStart(2, '0')).join(' ')}</span>
                                ))}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <DisclaimerBar variant="inline" />
        </section>
    );
}
