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

/** 後端 API 基底 URL */
const API_BASE = 'http://localhost:8888';

/** 台彩公開 API 端點（前端直連用） */
const TLC_LATEST_URL = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/LatestBingoResult';
const TLC_HISTORY_URL = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult';

/** 即時模式刷新間隔（毫秒）— 每 60 秒取一次最新期 */
const LIVE_REFRESH_INTERVAL = 60_000;

/** CSV 模式刷新間隔（毫秒）— 同樣 60 秒 */
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
 * 直接從台彩公開 API 取得最新開獎（不需後端代理）
 */
async function fetchFromTlcApi(): Promise<BingoDrawData | null> {
    try {
        const resp = await fetch(TLC_LATEST_URL, {
            headers: {
                'Accept': 'application/json',
            },
        });
        if (!resp.ok) return null;
        const data = await resp.json();

        if (data.rtCode !== 0) return null;

        const post = data.content?.lotteryBingoLatestPost;
        if (!post) return null;

        return {
            period: String(post.drawTerm),
            drawTime: post.dDate,
            numbers: post.bigShowOrder.map((n: string) => parseInt(n, 10)),
            superNumber: parseInt(post.prizeNum?.bullEye || '0', 10),
        };
    } catch {
        return null;
    }
}

/**
 * 從後端 API 取得最新開獎，失敗時 fallback 到台彩 API 直連
 */
async function fetchLiveLatest(): Promise<BingoDrawData | null> {
    // 先嘗試本地後端
    try {
        const resp = await fetch(`${API_BASE}/api/latest`);
        if (resp.ok) {
            const json = await resp.json();
            if (json.success && json.data) {
                const d = json.data;
                return {
                    period: String(d.drawTerm),
                    drawTime: d.dDate,
                    numbers: d.bigShowOrder.map((n: string) => parseInt(n, 10)),
                    superNumber: parseInt(d.superNumber, 10),
                };
            }
        }
    } catch {
        // 後端不可用，繼續嘗試台彩 API
    }

    // Fallback：直接呼叫台彩 API
    return fetchFromTlcApi();
}

/**
 * 從後端 API 取得今日歷史，失敗時 fallback 到台彩歷史 API 直連
 */
async function fetchLiveHistory(): Promise<BingoDrawData[]> {
    // 先嘗試本地後端
    try {
        const today = new Date().toISOString().slice(0, 10);
        const resp = await fetch(`${API_BASE}/api/history?date=${today}&page=1&size=50`);
        if (resp.ok) {
            const json = await resp.json();
            if (json.success && json.data?.draws && json.data.draws.length > 0) {
                return json.data.draws.map((d: Record<string, unknown>) => ({
                    period: String(d.drawTerm),
                    drawTime: (d.dDate as string) || today,
                    numbers: (d.bigShowOrder as string[]).map((n: string) => parseInt(n, 10)),
                    superNumber: parseInt(d.superNumber as string, 10),
                }));
            }
        }
    } catch {
        // 後端不可用
    }

    // Fallback：直接呼叫台彩歷史 API
    return fetchHistoryFromTlcApi();
}

/**
 * 直接從台彩歷史 API 取得當天開獎資料（支援翻頁）
 */
async function fetchHistoryFromTlcApi(): Promise<BingoDrawData[]> {
    const allDraws: BingoDrawData[] = [];
    const today = new Date().toISOString().slice(0, 10);
    let page = 1;
    const pageSize = 50;

    try {
        // 最多取 5 頁（250 期），避免無限迴圈
        while (page <= 5) {
            const url = `${TLC_HISTORY_URL}?openDate=${today}&pageNum=${page}&pageSize=${pageSize}`;
            const resp = await fetch(url, {
                headers: { 'Accept': 'application/json' },
            });
            if (!resp.ok) break;

            const data = await resp.json();
            if (data.rtCode !== 0) break;

            const results = data.content?.bingoQueryResult;
            if (!results || results.length === 0) break;

            for (const item of results) {
                allDraws.push({
                    period: String(item.drawTerm),
                    drawTime: item.dDate || today,
                    numbers: item.bigShowOrder.map((n: string) => parseInt(n, 10)),
                    superNumber: parseInt(item.bullEyeTop || '0', 10),
                });
            }

            const totalSize = data.content?.totalSize || 0;
            if (allDraws.length >= totalSize) break;
            page++;
        }
    } catch {
        // 台彩 API 也不可用
    }

    return allDraws;
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

    /** 即時模式：從後端 API 或台彩 API 取得資料 */
    const loadLive = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // 同時取得最新期與今日歷史
            const [latest, history] = await Promise.all([
                fetchLiveLatest(),
                fetchLiveHistory(),
            ]);

            // 只要最新期取得成功就維持即時模式
            if (!latest && history.length === 0) {
                // 所有來源都不可用，自動降級到 CSV
                setMode('csv');
                setError('API 不可用，已切換至 CSV 模式');
                return;
            }

            // 合併：最新期 + 歷史（去重），按期數降序排列
            const allDraws: BingoDrawData[] = [];
            if (latest) allDraws.push(latest);
            for (const d of history) {
                if (!allDraws.some((existing) => existing.period === d.period)) {
                    allDraws.push(d);
                }
            }

            // 按期數降序排列，確保最新在前
            allDraws.sort((a, b) => Number(b.period) - Number(a.period));

            setDraws(allDraws);
            setRawDraws([]); // 即時模式下不使用 rawDraws
            setCountdown(LIVE_REFRESH_INTERVAL / 1000);
        } catch {
            setError('即時資料取得失敗');
            setMode('csv');
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
    }, [loadData, mode]);

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
