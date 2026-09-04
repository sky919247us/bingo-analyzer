/**
 * 台灣彩券賓果賓果 — 資料取得 Hook
 * - 「即時模式」：**前端直連台彩 API**，開獎後守候式輪詢（見 utils/tlc-direct.ts）
 *   Cloudflare Worker KV 降級為 fallback（直連失敗時）與 OEHL 大小單雙統計的來源
 * - 「CSV 模式」：從 public/data/ 載入靜態歷史 CSV（作為 Fallback 或年份瀏覽）
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { parseCsvData, type DrawResult } from '../utils/csv-parser';
import type { BingoDrawData } from '../utils/bingo-strategies';
import {
    fetchDayDirect,
    isFirstDrawOfDay,
    secondsUntilNextDraw,
    taipeiDateStr,
    taipeiDateTimeStr,
    waitForDraw,
} from '../utils/tlc-direct';

/** 可用的歷史年份清單 */
const AVAILABLE_YEARS = [
    2026, 2025, 2024, 2023, 2022, 2021, 2020,
    2019, 2018, 2017, 2016, 2015, 2014, 2013,
];

/** 後端 API 基底 URL (對應新建的 Cloudflare Worker) */
const API_BASE = 'https://bingo-kv-worker.sky919247us.workers.dev';

/** CSV 模式刷新間隔（毫秒）— 保持 60 秒 */
const CSV_REFRESH_INTERVAL = 60_000;

/** OEHL 大小單雙統計資料結構 */
export interface OEHLStats {
    /** 今日累積開出次數 */
    todayDrawSum: { odd: number; even: number; peace: number; high: number; low: number; middle: number };
    /** 今日最高連續未開出期數 */
    todayLostSum: { odd: number; even: number; peace: number; high: number; low: number; middle: number };
    /** 目前連續未開出期數 */
    lostSumNow: { odd: number; even: number; peace: number; high: number; low: number; middle: number };
    /** 今日每期結果列表 */
    todayResults: OEHLResult[];
}

export interface OEHLResult {
    drawTime: string;
    drawTerm: number;
    odd: string;
    oddLostNum: number;
    even: string;
    evenLostNum: number;
    peace: string;
    peaceLostNum: number;
    high: string;
    highLostNum: number;
    low: string;
    lowLostNum: number;
    middle: string;
    middleLostNum: number;
}

interface UseBingoDataReturn {
    draws: BingoDrawData[];
    rawDraws: DrawResult[];
    loading: boolean;
    error: string | null;
    latestDraw: BingoDrawData | null;
    latestStats: {
        bigSmallRatio: string;
        oddEvenRatio: string;
        /** 大小結果：大/小/－（需 ≥13 顆才成立） */
        bigSmallResult: string;
        /** 單雙結果：單/雙/－（需 ≥13 顆才成立） */
        oddEvenResult: string;
        /** 所有開獎號碼總和 (和值) */
        sum: number;
    } | null;
    countdown: number;
    refresh: () => void;
    /** 資料模式：live（即時 API）或 csv（靜態年份） */
    mode: 'live' | 'csv';
    /** 切換到即時模式 */
    setLiveMode: () => void;
    /** 切換到 CSV 模式並指定年份 */
    setCsvYear: (year: number) => void;
    /** 目前選擇的年份（CSV 模式下有效） */
    selectedYear: number;
    /** 可用年份清單 */
    availableYears: number[];
    /** 大小單雙即時統計（來自台彩 OEHLStatistic API） */
    oehlStats: OEHLStats | null;
}

/**
 * 從 Worker KV API 取得今日歷史
 */
async function fetchFromKV(): Promise<{ draws: BingoDrawData[], lastUpdated: string | null }> {
    try {
        const resp = await fetch(`${API_BASE}/api/kv/today`);
        if (resp.ok) {
            const json = await resp.json();
            if (json.success && json.draws) {
                return {
                    draws: json.draws,
                    lastUpdated: json.lastUpdated
                };
            }
        }
    } catch (err) {
        console.error('Failed to fetch from KV', err);
    }
    return { draws: [], lastUpdated: null };
}

/**
 * 從 Worker KV 取得 OEHL 大小單雙統計
 */
async function fetchOEHLFromKV(): Promise<OEHLStats | null> {
    try {
        const resp = await fetch(`${API_BASE}/api/kv/oehl`);
        if (resp.ok) {
            const json = await resp.json();
            if (json.success && json.oehl) {
                return json.oehl as OEHLStats;
            }
        }
    } catch (err) {
        console.error('Failed to fetch OEHL from KV', err);
    }
    return null;
}

/**
 * 從 public/data/ 載入指定年份的 CSV
 */
async function fetchCsvYear(year: number): Promise<DrawResult[]> {
    const url = `${import.meta.env.BASE_URL}data/賓果賓果_${year}.csv`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`無法載入 ${year} 年資料 (HTTP ${response.status})`);
    const csvText = await response.text();
    return parseCsvData(csvText);
}

function toBingoDrawData(draw: DrawResult): BingoDrawData {
    return {
        period: draw.period,
        drawTime: draw.date,
        numbers: draw.numbers,
        superNumber: draw.superNumber,
    };
}

function calculateStats(numbers: number[]) {
    const bigCount = numbers.filter((n) => n >= 41).length;
    const smallCount = numbers.length - bigCount;
    const oddCount = numbers.filter((n) => n % 2 === 1).length;
    const evenCount = numbers.length - oddCount;

    // 賓果賓果規則：需 ≥13 顆才判定大/小、單/雙，否則為和（－）
    const bigSmallResult = bigCount >= 13 ? '大' : smallCount >= 13 ? '小' : '－';
    const oddEvenResult = oddCount >= 13 ? '單' : evenCount >= 13 ? '雙' : '－';

    return {
        bigSmallRatio: `${bigCount}:${smallCount}`,
        oddEvenRatio: `${oddCount}:${evenCount}`,
        bigSmallResult,
        oddEvenResult,
        sum: numbers.reduce((a, b) => a + b, 0),
    };
}

/**
 * 賓果資料取得 Hook
 * 預設嘗試即時模式（後端 API），若後端不可用則自動降級為 CSV 模式
 */
export function useBingoData(): UseBingoDataReturn {
    const [mode, setMode] = useState<'live' | 'csv'>('live');
    const [selectedYear, setSelectedYear] = useState(AVAILABLE_YEARS[0]);
    const [rawDraws, setRawDraws] = useState<DrawResult[]>([]);
    const [draws, setDraws] = useState<BingoDrawData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(60);
    const [oehlStats, setOehlStats] = useState<OEHLStats | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    /** 目前已知的最新期別，守候輪詢用來判斷是否為新的一期 */
    const latestPeriodRef = useRef<string | null>(null);

    /**
     * 即時模式：直連台彩 API 撈當日全部期數（頁面開啟或手動刷新時用）
     * 直連失敗才退回 Worker KV
     */
    const loadLive = useCallback(async () => {
        setLoading(true);
        setError(null);

        // OEHL 大小單雙統計仍由 Worker 計算，非阻塞地取回
        fetchOEHLFromKV().then((oehl) => { if (oehl) setOehlStats(oehl); });

        try {
            const dateStr = taipeiDateStr();
            const direct = await fetchDayDirect(dateStr);

            if (direct.length > 0) {
                setDraws(direct);
                setRawDraws([]);
                latestPeriodRef.current = direct[0].period;
                setCountdown(secondsUntilNextDraw());
                return;
            }

            // 當日尚無開獎（清晨時段）→ 退回 KV 看看有沒有前一日資料
            const { draws: kvDraws } = await fetchFromKV();
            if (kvDraws && kvDraws.length > 0) {
                const sorted = [...kvDraws].sort((a, b) => Number(b.period) - Number(a.period));
                setDraws(sorted);
                setRawDraws([]);
                latestPeriodRef.current = sorted[0].period;
            } else {
                setError('當日尚無開獎資料');
                setDraws([]);
                setRawDraws([]);
            }
            setCountdown(secondsUntilNextDraw());
        } catch {
            // 直連整個失敗（斷網 / API 異常）→ 最後退回 KV
            const { draws: kvDraws } = await fetchFromKV();
            if (kvDraws && kvDraws.length > 0) {
                const sorted = [...kvDraws].sort((a, b) => Number(b.period) - Number(a.period));
                setDraws(sorted);
                setRawDraws([]);
                latestPeriodRef.current = sorted[0].period;
                setError('台彩 API 直連失敗，已改用備援資料');
            } else {
                setError('即時資料取得失敗');
            }
            setCountdown(secondsUntilNextDraw());
        } finally {
            setLoading(false);
        }
    }, []);

    /** CSV 模式：從靜態檔案載入 */
    const loadCsv = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const csvData = await fetchCsvYear(selectedYear);
            // 反序排列，確保最新期在前
            const reversedCsvData = [...csvData].reverse();
            const reversedDraws = reversedCsvData.map(toBingoDrawData);
            setRawDraws(reversedCsvData);
            setDraws(reversedDraws);
            setCountdown(CSV_REFRESH_INTERVAL / 1000);
        } catch (err) {
            setError(err instanceof Error ? err.message : '載入失敗');
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    /** 根據當前模式載入資料 */
    const loadData = useCallback(() => {
        if (mode === 'live') return loadLive();
        return loadCsv();
    }, [mode, loadLive, loadCsv]);

    // 即時模式：用 setTimeout 精確對齊開獎時間 +10 秒；CSV 模式：固定間隔
    useEffect(() => {
        loadData();

        if (mode === 'live') {
            // 即時模式：對每一期做守候式輪詢
            // 開獎後 20 秒開始（首期 60 秒），每秒查一次，直到取得或逾時 66 秒（首期 120 秒）
            const signal = { cancelled: false };

            const scheduleNext = () => {
                if (signal.cancelled) return;

                const waitSecs = secondsUntilNextDraw();
                const scheduledMs = Date.now() + waitSecs * 1000;
                setCountdown(waitSecs);

                timerRef.current = setTimeout(async () => {
                    if (signal.cancelled) return;

                    const isFirst = isFirstDrawOfDay(new Date(scheduledMs));
                    const got = await waitForDraw(scheduledMs, latestPeriodRef.current, { isFirst, signal });

                    if (signal.cancelled) return;

                    if (got) {
                        // API 的 dDate 不可用，改用該期的名目開獎時刻
                        const draw = { ...got.draw, drawTime: taipeiDateTimeStr(new Date(scheduledMs)) };
                        latestPeriodRef.current = draw.period;
                        setDraws((prev) => {
                            if (prev.some((d) => d.period === draw.period)) return prev;
                            return [draw, ...prev];
                        });
                        setError(null);
                        // 開獎號碼已就緒後才補抓 OEHL 統計，不擋主流程
                        fetchOEHLFromKV().then((oehl) => { if (oehl) setOehlStats(oehl); });
                    } else {
                        setError('開獎延遲：超過正常公布時間仍未取得資料');
                    }

                    scheduleNext();
                }, waitSecs * 1000) as unknown as ReturnType<typeof setInterval>;
            };
            scheduleNext();

            // 每秒倒數
            countdownRef.current = setInterval(() => {
                setCountdown((prev) => Math.max(prev - 1, 0));
            }, 1000);

            return () => {
                signal.cancelled = true;
                if (timerRef.current) {
                    clearTimeout(timerRef.current as unknown as number);
                    clearInterval(timerRef.current);
                }
                if (countdownRef.current) clearInterval(countdownRef.current);
            };
        } else {
            // CSV 模式：固定 60 秒刷新
            timerRef.current = setInterval(loadData, CSV_REFRESH_INTERVAL);
            countdownRef.current = setInterval(() => {
                setCountdown((prev) => (prev <= 1 ? CSV_REFRESH_INTERVAL / 1000 : prev - 1));
            }, 1000);
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current as unknown as number);
                clearInterval(timerRef.current);
            }
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [mode]); // 移除 loadData 依賴，避免重複觸發

    const latestDraw = draws.length > 0 ? draws[0] : null;

    const setLiveMode = useCallback(() => {
        setMode('live');
    }, []);

    const setCsvYear = useCallback((year: number) => {
        setSelectedYear(year);
        setMode('csv');
    }, []);

    return {
        draws,
        rawDraws,
        loading,
        error,
        latestDraw,
        latestStats: latestDraw ? calculateStats(latestDraw.numbers) : null,
        countdown,
        refresh: loadData,
        mode,
        setLiveMode,
        setCsvYear,
        selectedYear,
        availableYears: AVAILABLE_YEARS,
        oehlStats,
    };
}
