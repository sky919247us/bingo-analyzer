/**
 * 台灣彩券賓果賓果 — 資料取得 Hook
 * - 「即時模式」：從後端 API (/api/latest, /api/history) 取得即時開獎資料
 * - 「CSV 模式」：從 public/data/ 載入靜態歷史 CSV（作為 Fallback 或年份瀏覽）
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { parseCsvData, type DrawResult } from '../utils/csv-parser';
import type { BingoDrawData } from '../utils/bingo-strategies';

/** 可用的歷史年份清單 */
const AVAILABLE_YEARS = [
    2026, 2025, 2024, 2023, 2022, 2021, 2020,
    2019, 2018, 2017, 2016, 2015, 2014, 2013,
];

/** 後端 API 基底 URL (對應新建的 Cloudflare Worker) */
const API_BASE = 'https://bingo-kv-worker.sky919247us.workers.dev';

/** 即時模式刷新間隔（毫秒）— 每 300 秒(5分鐘)取一次最新期 */
const LIVE_REFRESH_INTERVAL = 300_000;

/** CSV 模式刷新間隔（毫秒）— 保持 60 秒 */
const CSV_REFRESH_INTERVAL = 60_000;

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
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /** 即時模式：從 Worker KV 取得資料 */
    const loadLive = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { draws: kvDraws, lastUpdated } = await fetchFromKV();

            if (!kvDraws || kvDraws.length === 0) {
                setError('KV 暫無資料，等待 Worker 更新');
                setDraws([]);
                setRawDraws([]);
                setCountdown(LIVE_REFRESH_INTERVAL / 1000);
                return;
            }

            // 按期數降序排列，確保最新在前
            const sortedDraws = [...kvDraws].sort((a, b) => Number(b.period) - Number(a.period));

            setDraws(sortedDraws);
            setRawDraws([]); // 即時模式下不使用 rawDraws

            // 精確計算倒數計時：從 lastUpdated 起算 5 分鐘
            if (lastUpdated) {
                const lastTime = new Date(lastUpdated).getTime();
                const now = Date.now();
                const diffSecs = Math.floor((now - lastTime) / 1000);
                const remaining = Math.max((LIVE_REFRESH_INTERVAL / 1000) - diffSecs, 5); // 至少 5 秒，避免 0
                setCountdown(remaining);
            } else {
                setCountdown(LIVE_REFRESH_INTERVAL / 1000);
            }
        } catch {
            setError('即時資料取得失敗 (KV 連線異常)');
            // 保留原有 draws，讓畫面不變空白
            setCountdown(LIVE_REFRESH_INTERVAL / 1000);
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

    // 載入 + 定期刷新
    useEffect(() => {
        loadData();

        const interval = mode === 'live' ? LIVE_REFRESH_INTERVAL : CSV_REFRESH_INTERVAL;
        timerRef.current = setInterval(loadData, interval);
        countdownRef.current = setInterval(() => {
            setCountdown((prev) => (prev <= 1 ? interval / 1000 : prev - 1));
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
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
    };
}
