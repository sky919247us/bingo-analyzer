/**
 * CSV 解析工具
 * 使用 PapaParse 解析賓果賓果歷史開獎數據
 */
import Papa from 'papaparse';

/** 單期開獎資料 */
export interface DrawResult {
    /** 期別 */
    period: string;
    /** 開獎日期 */
    date: string;
    /** 銷售總額 */
    totalSales: number;
    /** 銷售注數 */
    totalBets: number;
    /** 總獎金 */
    totalPrize: number;
    /** 20 顆開獎號碼 */
    numbers: number[];
    /** 超級獎號 */
    superNumber: number;
    /** 猜大小結果 */
    bigSmall: string;
    /** 猜單雙結果 */
    oddEven: string;
}

/**
 * 解析 CSV 文字為開獎資料陣列
 */
export function parseCsvData(csvText: string): DrawResult[] {
    const parsed = Papa.parse(csvText, {
        header: false,
        skipEmptyLines: true,
    });

    const rows = parsed.data as string[][];
    // 跳過表頭
    return rows.slice(1).map((row) => {
        const numbers: number[] = [];
        for (let i = 6; i <= 25; i++) {
            const num = parseInt(row[i], 10);
            if (!isNaN(num)) numbers.push(num);
        }

        return {
            period: row[1] || '',
            date: row[2] || '',
            totalSales: parseInt(row[3], 10) || 0,
            totalBets: parseInt(row[4], 10) || 0,
            totalPrize: parseInt(row[5], 10) || 0,
            numbers,
            superNumber: parseInt(row[26], 10) || 0,
            bigSmall: row[27] || '－',
            oddEven: row[28] || '－',
        };
    }).filter((d) => d.numbers.length === 20);
}

/**
 * 從檔案載入 CSV
 */
export function loadCsvFile(file: File): Promise<DrawResult[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            resolve(parseCsvData(text));
        };
        reader.onerror = () => reject(new Error('讀取檔案失敗'));
        reader.readAsText(file, 'UTF-8');
    });
}

/**
 * 模擬回測：在歷史數據上執行策略
 * @param data - 歷史開獎數據
 * @param selectedNumbers - 玩家選擇的號碼
 */
export function backtestStrategy(
    data: DrawResult[],
    selectedNumbers: number[],
): { period: string; date: string; hits: number }[] {
    return data.map((draw) => {
        const drawnSet = new Set(draw.numbers);
        const hits = selectedNumbers.filter((n) => drawnSet.has(n)).length;
        return { period: draw.period, date: draw.date, hits };
    });
}
