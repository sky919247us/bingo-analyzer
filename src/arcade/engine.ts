/**
 * 賓果娛樂機 — 演出狀態機
 *
 * 期間流程：下注中 → 截止等待 → 預告 → 出球（含聽牌、PUSH、超級獎號 cut-in）→ 結算 → 回到下注
 * 「下注中 / 截止等待」由倒數決定（roundPhase），之後的階段由 ShowRunner 依腳本逐步推進。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BingoDrawData } from '../utils/bingo-strategies';
import { expectedIndex, secondsUntilNextDraw, taipeiDateStr } from '../utils/tlc-direct';
import { direct, simulatedOrder, type DirectorPlan } from './director';
import { settleAll, type PlayedBet, type SettleSummary } from './payout';
import { sfx, startHeartbeat, stopHeartbeat } from './audio';

/** 開獎前幾秒截止下注 */
export const CLOSE_BEFORE_SEC = 30;

export type RoundPhase = 'betting' | 'closed' | 'preview' | 'drawing' | 'settle';
export type ShowPhase = 'idle' | 'preview' | 'drawing' | 'settle';

export interface ShowInput {
    period: string;
    numbers: number[];
    superNumber: number;
    order: number[];
    /** 開出順序為模擬（資料源缺 openShowOrder） */
    simulated: boolean;
    bets: PlayedBet[];
    kind: 'live' | 'replay';
}

export interface ShowState {
    phase: ShowPhase;
    input: ShowInput | null;
    plan: DirectorPlan | null;
    summary: SettleSummary | null;
    /** 目前顯示的預告 STEP（0 = 無） */
    previewStep: number;
    showColor: boolean;
    /** 已開出的號碼（依開出順序） */
    drawn: number[];
    lastHit: boolean;
    hitCount: number;
    reachOn: boolean;
    reachResult: 'win' | 'lose' | null;
    cutIn: boolean;
    pushWaiting: boolean;
}

const IDLE: ShowState = {
    phase: 'idle', input: null, plan: null, summary: null, previewStep: 0, showColor: false,
    drawn: [], lastHit: false, hitCount: 0, reachOn: false, reachResult: null, cutIn: false, pushWaiting: false,
};

/** 由一期開獎資料組出演出輸入 */
export function buildShowInput(draw: BingoDrawData, bets: PlayedBet[], kind: ShowInput['kind']): ShowInput {
    const valid = draw.openOrder && draw.openOrder.length === draw.numbers.length
        && draw.openOrder.every((n) => draw.numbers.includes(n));
    return {
        period: draw.period,
        numbers: draw.numbers,
        superNumber: draw.superNumber,
        order: valid ? draw.openOrder! : simulatedOrder(draw.period, draw.numbers, draw.superNumber),
        simulated: !valid,
        bets,
        kind,
    };
}

/** 由已知開獎推算下一個可下注期別（試玩模式用；跨年時可能不準） */
export function nextPeriodFromDraws(draws: BingoDrawData[], now: Date = new Date()): string | null {
    if (draws.length === 0) return null;
    const latest = Number(draws[0].period);
    if (!Number.isFinite(latest)) return null;
    const today = taipeiDateStr(now);
    const todayCount = draws.filter((d) => d.drawTime.startsWith(today)).length;
    const gap = Math.max(0, expectedIndex(now) - todayCount);
    return String(latest + gap + 1);
}

/* ───────────── 腳本 ───────────── */

interface Step {
    delay: number;
    apply?: (s: ShowState) => ShowState;
    fx?: () => void;
    /** PUSH 暫停點 */
    push?: boolean;
    /** 跳過時不會被略過的步驟（結算） */
    final?: boolean;
}

function buildScript(input: ShowInput, plan: DirectorPlan, reduced: boolean, onDone: () => void): Step[] {
    const k = reduced ? 0.35 : 1;
    const steps: Step[] = [];
    const mine = new Set<number>();
    for (const b of input.bets) {
        if (b.item.game === 'basic' || b.item.game === 'super') b.item.numbers.forEach((n) => mine.add(n));
    }

    // 預告 STEP 1 → N
    for (let s = 1; s <= plan.step; s++) {
        steps.push({ delay: (s === 1 ? 500 : 650) * k, apply: (st) => ({ ...st, previewStep: s }), fx: () => sfx.step(s) });
    }
    steps.push({ delay: 800 * k, apply: (st) => ({ ...st, showColor: true }), fx: () => sfx.step(plan.step + 1) });
    steps.push({ delay: 1100 * k, apply: (st) => ({ ...st, phase: 'drawing', previewStep: 0, showColor: false }) });

    const reach = plan.reach;
    const last = input.order.length - 1;
    input.order.forEach((n, i) => {
        if (i === last - 2) steps.push({ delay: 300 * k, push: true });
        const inReach = !!reach && i > reach.startIndex && (reach.resolveIndex === null || i <= reach.resolveIndex);
        let delay = i < 10 ? 900 : i < 17 ? 1250 : 1700;
        if (inReach && !reduced) delay = 2500;
        if (i === last) {
            steps.push({ delay: 900 * k, apply: (st) => ({ ...st, cutIn: true }), fx: () => sfx.cutIn() });
            delay = 1900;
        }
        const hit = mine.has(n);
        steps.push({
            delay: delay * k,
            apply: (st) => {
                const next: ShowState = {
                    ...st,
                    drawn: [...st.drawn, n],
                    lastHit: hit,
                    hitCount: st.hitCount + (hit ? 1 : 0),
                };
                if (reach && i === reach.startIndex) next.reachOn = true;
                if (reach && i === reach.resolveIndex) next.reachResult = 'win';
                if (reach && i === last && reach.resolveIndex === null) next.reachResult = 'lose';
                return next;
            },
            fx: () => {
                if (hit) sfx.hit(); else sfx.ball(i);
                if (reach && i === reach.startIndex) { sfx.reach(); startHeartbeat(); }
                if (reach && (i === reach.resolveIndex || i === last)) stopHeartbeat();
            },
        });
        if (reach && (i === reach.resolveIndex || (i === last && reach.resolveIndex === null))) {
            steps.push({ delay: 1300 * k, apply: (st) => ({ ...st, reachOn: false }) });
        }
        if (i === last) steps.push({ delay: 1600 * k, apply: (st) => ({ ...st, cutIn: false }) });
    });

    const win = plan.winClass !== 'none';
    steps.push({
        delay: 700 * k,
        final: true,
        apply: (st) => ({ ...st, phase: 'settle', reachOn: false, cutIn: false, pushWaiting: false }),
        fx: () => {
            stopHeartbeat();
            if (win) sfx.fanfare(plan.winClass === 'big' || plan.winClass === 'mega'); else sfx.miss();
        },
    });
    steps.push({ delay: (win ? 7000 : 4500) * (reduced ? 0.6 : 1), final: true, apply: () => IDLE, fx: onDone });
    return steps;
}

/* ───────────── 執行器 ───────────── */

class ShowRunner {
    private q: Step[] = [];
    private t: ReturnType<typeof setTimeout> | null = null;
    private waitingPush = false;
    private readonly set: (fn: (s: ShowState) => ShowState) => void;

    constructor(set: (fn: (s: ShowState) => ShowState) => void) {
        this.set = set;
    }

    start(steps: Step[]): void {
        this.stop();
        this.q = [...steps];
        this.next();
    }

    private next(): void {
        const st = this.q.shift();
        if (!st) return;
        if (st.push) {
            this.waitingPush = true;
            this.set((s) => ({ ...s, pushWaiting: true }));
            this.t = setTimeout(() => this.push(), 5000);   // 5 秒後自動揭曉
            return;
        }
        this.t = setTimeout(() => {
            this.t = null;
            if (st.apply) this.set(st.apply);
            st.fx?.();
            this.next();
        }, st.delay);
    }

    push(): void {
        if (!this.waitingPush) return;
        this.waitingPush = false;
        if (this.t) clearTimeout(this.t);
        this.set((s) => ({ ...s, pushWaiting: false }));
        sfx.push();
        this.next();
    }

    /** 跳過演出，直接到結算 */
    skip(): void {
        if (this.t) clearTimeout(this.t);
        this.t = null;
        this.waitingPush = false;
        stopHeartbeat();
        while (this.q.length > 0 && !this.q[0].final) {
            const st = this.q.shift()!;
            if (st.apply) this.set(st.apply);
        }
        this.set((s) => ({ ...s, pushWaiting: false, cutIn: false, reachOn: false }));
        this.next();
    }

    stop(): void {
        if (this.t) clearTimeout(this.t);
        this.t = null;
        this.q = [];
        this.waitingPush = false;
        stopHeartbeat();
    }
}

/** 演出播放 Hook */
export function useShowPlayer(reduced: boolean) {
    const [state, setState] = useState<ShowState>(IDLE);
    const runner = useMemo(() => new ShowRunner(setState), []);
    const reducedRef = useRef(reduced);
    reducedRef.current = reduced;

    // 卸載（或開發模式熱更新）時停止演出並回到閒置，避免卡在半途
    useEffect(() => () => { runner.stop(); setState(IDLE); }, [runner]);

    const api = useMemo(() => ({
        start(input: ShowInput, onDone: () => void = () => {}) {
            const summary = settleAll(input.bets, input.numbers, input.superNumber);
            const plan = direct(input.period, input.order, input.superNumber, input.bets, summary);
            setState({ ...IDLE, phase: 'preview', input, plan, summary });
            runner.start(buildScript(input, plan, reducedRef.current, onDone));
        },
        push: () => runner.push(),
        skip: () => runner.skip(),
        stop: () => { runner.stop(); setState(IDLE); },
    }), [runner]);

    return { state, ...api };
}

/** 綜合倒數與演出狀態，得出目前的期間階段 */
export function roundPhase(show: ShowPhase, now: Date = new Date()): RoundPhase {
    if (show !== 'idle') return show;
    return secondsUntilNextDraw(now) <= CLOSE_BEFORE_SEC ? 'closed' : 'betting';
}
