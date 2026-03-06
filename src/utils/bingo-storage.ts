/**
 * 賓果預測紀錄 — localStorage 存取工具
 * 負責將預測結果保存至本機並提供 CRUD 操作
 * 支援多期投注（期數：1-12 期）
 */

/** 單筆預測紀錄 */
export interface PredictionRecord {
    /** 唯一 ID (timestamp-based) */
    id: string;
    /** 儲存日期時間 */
    savedAt: string;
    /** 儲存時的 ISO 時間戳記（用於兌獎查詢） */
    savedAtISO: string;
    /** 使用策略名稱 */
    strategy: string;
    /** 預測號碼 */
    numbers: number[];
    /** 選擇星數 */
    starCount: number;
    /** 分析區間（幾期） */
    analysisRange: number;
    /** 投注倍數 */
    betMultiplier: number;
    /** 預估成本（= 25 × 倍數 × 期數） */
    estimatedCost: number;
    /** 投注期數（1,2,3...12），預設 1 */
    periodCount: number;
    /** 儲存時最新一期的期號（用於兌獎比對起始期） */
    startPeriod: string;
}

const STORAGE_KEY = 'bingo-prediction-records';

/**
 * 從 localStorage 取得所有紀錄
 */
export function getRecords(): PredictionRecord[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const records = JSON.parse(raw) as PredictionRecord[];
        // 相容舊格式：補上預設值
        return records.map((r) => ({
            ...r,
            periodCount: r.periodCount ?? 1,
            startPeriod: r.startPeriod ?? '',
            savedAtISO: r.savedAtISO ?? '',
        }));
    } catch {
        return [];
    }
}

/**
 * 儲存新紀錄
 */
export function saveRecord(record: Omit<PredictionRecord, 'id' | 'savedAt' | 'savedAtISO'>): PredictionRecord {
    const records = getRecords();
    const now = new Date();
    const newRecord: PredictionRecord = {
        ...record,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        savedAt: now.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }),
        savedAtISO: now.toISOString(),
    };
    records.unshift(newRecord); // 最新的排在前面
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return newRecord;
}

/**
 * 刪除單筆紀錄
 */
export function deleteRecord(id: string): void {
    const records = getRecords().filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/**
 * 清除所有紀錄
 */
export function clearRecords(): void {
    localStorage.removeItem(STORAGE_KEY);
}
