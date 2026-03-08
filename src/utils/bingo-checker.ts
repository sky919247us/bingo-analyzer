/**
 * 兌獎工具模組
 * 比對使用者預測號碼與實際開獎結果，計算中獎金額
 */
import type { PredictionRecord } from './bingo-storage';
import { getPrize } from '../models/prize-table';

/** 後端 API 基底 URL */
const API_BASE = 'http://localhost:8888';

/** 單期兌獎結果 */
export interface SingleDrawCheckResult {
    /** 對應的期號 */
    period: string;
    /** 開獎號碼 */
    drawNumbers: number[];
    /** 超級獎號 */
    superNumber: number;
    /** 使用者號碼中，命中的號碼清單 */
    hitNumbers: number[];
    /** 命中數 */
    hitCount: number;
    /** 該期獎金（含倍數，稅前） */
    prize: number;
    /** 是否已開獎 */
    drawn: true;
}

/** 尚未開獎的期 */
export interface PendingDrawResult {
    /** 預計期序（第幾期） */
    index: number;
    drawn: false;
}

/** 整筆紀錄的兌獎總結 */
export interface CheckResult {
    /** 紀錄 ID */
    recordId: string;
    /** 各期結果（已開獎的 + 未開獎的） */
    drawResults: (SingleDrawCheckResult | PendingDrawResult)[];
    /** 已開獎期數 */
    drawnCount: number;
    /** 總投注期數 */
    totalPeriods: number;
    /** 已開獎各期的總獎金 */
    totalPrize: number;
    /** 總成本 */
    totalCost: number;
    /** 淨損益 */
    netProfit: number;
    /** 是否全部開完 */
    allDrawn: boolean;
}

/** 台彩歷史 API 端點（前端直連 fallback 用） */
const TLC_HISTORY_URL = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult';

/**
 * 從後端 API 取得指定日期的所有開獎資料
 * 若後端不可用，則 Fallback 至台彩公開歷史 API
 */
async function fetchDrawsByDate(date: string): Promise<Array<{
    period: string;
    numbers: number[];
    superNumber: number;
    drawTime: string;
}>> {
    let results: Array<{ period: string; numbers: number[]; superNumber: number; drawTime: string }> = [];
    let backendSuccess = false;

    try {
        // 取前 4 頁（200 期），涵蓋一天全部的開獎（本地 API）
        for (let page = 1; page <= 4; page++) {
            const resp = await fetch(`${API_BASE}/api/history?date=${date}&page=${page}&size=50`);
            if (!resp.ok) throw new Error('Backend failed');
            const json = await resp.json();
            if (!json.success || !json.data?.draws) throw new Error('Invalid data');

            const draws = json.data.draws as Array<Record<string, unknown>>;
            if (draws.length === 0) break;

            for (const d of draws) {
                results.push({
                    period: String(d.drawTerm),
                    numbers: (d.bigShowOrder as string[]).map((n: string) => parseInt(n, 10)),
                    superNumber: parseInt(d.superNumber as string, 10),
                    drawTime: (d.dDate as string) || date,
                });
            }

            backendSuccess = true;
            // 如果這一頁不滿 50 筆，代表沒有下一頁
            if (draws.length < 50) break;
        }
    } catch {
        // 後端失敗，將進行 fallback
    }

    if (backendSuccess && results.length > 0) {
        return results;
    }

    // Fallback：直接呼叫台彩歷史 API
    results = [];
    try {
        let page = 1;
        const pageSize = 50;

        while (page <= 5) {
            const url = `${TLC_HISTORY_URL}?openDate=${date}&pageNum=${page}&pageSize=${pageSize}`;
            const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!resp.ok) break;

            const data = await resp.json();
            if (data.rtCode !== 0) break;

            const contentResults = data.content?.bingoQueryResult;
            if (!contentResults || contentResults.length === 0) break;

            for (const item of contentResults) {
                results.push({
                    period: String(item.drawTerm),
                    numbers: item.bigShowOrder.map((n: string) => parseInt(n, 10)),
                    superNumber: parseInt(item.bullEyeTop || '0', 10),
                    drawTime: item.dDate || date, // 若無時間，先預設為該日期
                });
            }

            const totalSize = data.content?.totalSize || 0;
            if (results.length >= totalSize) break;
            page++;
        }
    } catch (err) {
        console.error('TLC History Fallback Failed:', err);
    }

    return results;
}

/**
 * 取得紀錄儲存日附近的開獎資料（取當天 + 隔天的資料）
 * 涵蓋多期投注可能跨天的情況
 */
async function fetchRelevantDraws(savedAtISO: string): Promise<Array<{
    period: string;
    numbers: number[];
    superNumber: number;
    drawTime: string;
}>> {
    const savedDate = new Date(savedAtISO);
    const dateStr = savedDate.toISOString().slice(0, 10);

    // 取儲存日 + 隔天（涵蓋跨日投注）
    const nextDay = new Date(savedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDateStr = nextDay.toISOString().slice(0, 10);

    const [todayDraws, tomorrowDraws] = await Promise.all([
        fetchDrawsByDate(dateStr),
        fetchDrawsByDate(nextDateStr),
    ]);

    return [...todayDraws, ...tomorrowDraws];
}

/**
 * 對單筆紀錄進行兌獎
 * 依據 `startPeriod` 找到該期之後的連續 N 期，逐期比對
 */
export async function checkRecord(record: PredictionRecord): Promise<CheckResult> {
    const periodCount = record.periodCount || 1;
    const cost = 25 * record.betMultiplier * periodCount;

    // 取得相關的開獎資料
    const allDraws = record.savedAtISO
        ? await fetchRelevantDraws(record.savedAtISO)
        : [];

    // 依期號由小到大排序
    allDraws.sort((a, b) => a.period.localeCompare(b.period));

    // 找到起始期的位置（包含起始期本身）
    let startIdx = -1;
    if (record.startPeriod) {
        startIdx = allDraws.findIndex((d) => d.period === record.startPeriod);
    }

    // 若找不到精確的起始期，嘗試找最接近儲存時間之後的期
    if (startIdx === -1 && record.savedAtISO) {
        const savedTime = new Date(record.savedAtISO).getTime();
        startIdx = allDraws.findIndex((d) => {
            const drawTime = new Date(d.drawTime).getTime();
            return drawTime >= savedTime;
        });
    }

    // 收集各期結果
    const drawResults: (SingleDrawCheckResult | PendingDrawResult)[] = [];
    let totalPrize = 0;
    let drawnCount = 0;

    for (let i = 0; i < periodCount; i++) {
        const drawIdx = startIdx >= 0 ? startIdx + i : -1;

        if (drawIdx >= 0 && drawIdx < allDraws.length) {
            const draw = allDraws[drawIdx];
            const hitNumbers = record.numbers.filter((n) => draw.numbers.includes(n));
            const hitCount = hitNumbers.length;

            // 計算獎金（含投注倍數）
            const basePrize = getPrize(record.starCount, hitCount, false);
            const prize = basePrize * record.betMultiplier;

            drawResults.push({
                period: draw.period,
                drawNumbers: draw.numbers,
                superNumber: draw.superNumber,
                hitNumbers,
                hitCount,
                prize,
                drawn: true,
            });

            totalPrize += prize;
            drawnCount++;
        } else {
            // 尚未開獎
            drawResults.push({
                index: i + 1,
                drawn: false,
            });
        }
    }

    return {
        recordId: record.id,
        drawResults,
        drawnCount,
        totalPeriods: periodCount,
        totalPrize,
        totalCost: cost,
        netProfit: totalPrize - cost,
        allDrawn: drawnCount === periodCount,
    };
}

/**
 * 批次兌獎：對多筆紀錄同時兌獎
 */
export async function checkAllRecords(records: PredictionRecord[]): Promise<Map<string, CheckResult>> {
    const results = new Map<string, CheckResult>();
    // 依序處理，避免 API 過載
    for (const record of records) {
        const result = await checkRecord(record);
        results.set(record.id, result);
    }
    return results;
}
