import { useSeo } from '../hooks/useSeo';
import { useBingoData } from '../hooks/useBingoData';

export default function BingoDistribution() {
    useSeo({ title: '獎號分布走勢', description: '統整80顆賓果號碼的開獎分佈圖，掌握冷熱趨勢與超級獎號落點。', keywords: '號碼分佈圖, 獎號分析' });
    const { draws, loading, error } = useBingoData();

    /** 
     * 透過實際開獎時間或期數推算精準的開獎時分
     */
    const getDrawTime = (draw: { period: string; drawTime: string }) => {
        try {
            // 嘗試解析 API 提供的 ISO 日期 (排除錯誤的 0001 年)
            const d = new Date(draw.drawTime);
            if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && (d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0)) {
                return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            }
        } catch {}
        
        // 若時間無效或為 'YYYY-MM-DD'，使用期數 (period) 推算正確時分
        // 台灣彩券 Bingo 每日 203 期，07:05 起每 5 分鐘開獎一次
        const periodNum = parseInt(draw.period, 10);
        if (!isNaN(periodNum)) {
            const dailyNum = periodNum % 1000;
            if (dailyNum >= 1 && dailyNum <= 203) {
                const totalMins = 7 * 60 + 5 + (dailyNum - 1) * 5;
                const hh = Math.floor(totalMins / 60).toString().padStart(2, '0');
                const mm = (totalMins % 60).toString().padStart(2, '0');
                return `${hh}:${mm}`;
            }
        }
        
        return "00:00";
    };

    /** 解析每期的大小單雙屬性 */
    const getProperties = (numbers: number[]) => {
        let bigCount = 0;
        let oddCount = 0;
        numbers.forEach(n => {
            if (n > 40) bigCount++;
            if (n % 2 !== 0) oddCount++;
        });
        const bsResult = bigCount > 10 ? '大' : (bigCount < 10 ? '小' : '和');
        const oeResult = oddCount > 10 ? '單' : (oddCount < 10 ? '雙' : '和');
        return { bsResult, oeResult };
    };

    if (error) {
        return <div className="error-message">載入失敗: {error}</div>;
    }

    // 生成 1 到 80 的陣列作為表頭
    const numbers1to80 = Array.from({ length: 80 }, (_, i) => i + 1);

    return (
        <div className="animate-in">
            <h1 className="page-title">
                <span className="emoji-icon">🎯</span> 獎號分布 (趨勢走勢圖)
            </h1>

            {loading && <div className="loading-spinner" />}

            {!loading && draws.length > 0 && (
                <div className="card distribution-card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <table style={{ 
                            borderCollapse: 'collapse', 
                            width: 'max-content',
                            fontSize: '0.75rem',
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)'
                        }}>
                            <thead>
                                <tr>
                                    <th style={{ position: 'sticky', left: 0, zIndex: 10, background: '#F59E0B', color: 'white', padding: '4px 8px', borderRight: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>開獎時間</th>
                                    <th style={{ background: '#F59E0B', color: 'white', padding: '4px', borderRight: '1px solid #e2e8f0' }}><div style={{width: 18}}></div></th>
                                    <th style={{ background: '#F59E0B', color: 'white', padding: '4px', borderRight: '1px solid #e2e8f0' }}><div style={{width: 18}}></div></th>
                                    {numbers1to80.map(num => (
                                        <th key={num} style={{ 
                                            background: '#F59E0B', 
                                            color: 'white', 
                                            padding: '4px 2px', 
                                            minWidth: '20px',
                                            borderRight: '1px solid rgba(255,255,255,0.2)'
                                        }}>
                                            {num.toString().padStart(2, '0')}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {draws.slice(0, 50).map((draw, rowIndex) => {
                                    const { bsResult, oeResult } = getProperties(draw.numbers);
                                    const rowBg = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                                    
                                    return (
                                        <tr key={draw.period} style={{ background: rowBg, borderBottom: '1px solid #e2e8f0' }}>
                                            <td style={{ 
                                                position: 'sticky', 
                                                left: 0, 
                                                background: rowBg, 
                                                padding: '4px 8px',
                                                borderRight: '1px solid #e2e8f0',
                                                fontWeight: 800,
                                                color: 'var(--text-main)',
                                                boxShadow: '2px 0 5px rgba(0,0,0,0.05)'
                                            }}>
                                                {getDrawTime(draw)}
                                            </td>
                                            
                                            {/* 大小 Badge */}
                                            <td style={{ padding: '2px', borderRight: '1px solid #e2e8f0' }}>
                                                {bsResult !== '和' ? (
                                                    <div style={{
                                                        width: '18px', height: '18px', borderRadius: '50%',
                                                        background: bsResult === '大' ? '#3B82F6' : '#10B981',
                                                        color: 'white', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        margin: '0 auto', fontWeight: 'bold'
                                                    }}>
                                                        {bsResult}
                                                    </div>
                                                ) : <div style={{width: 18, height: 18, margin: '0 auto', background: '#ccc', borderRadius: '50%', color: 'white', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>和</div>}
                                            </td>
                                            
                                            {/* 單雙 Badge */}
                                            <td style={{ padding: '2px', borderRight: '1px solid #e2e8f0' }}>
                                                {oeResult !== '和' ? (
                                                    <div style={{
                                                        width: '18px', height: '18px', borderRadius: '50%',
                                                        background: oeResult === '單' ? '#6B7280' : '#EC4899',
                                                        color: 'white', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        margin: '0 auto', fontWeight: 'bold'
                                                    }}>
                                                        {oeResult}
                                                    </div>
                                                ) : <div style={{width: 18, height: 18, margin: '0 auto', background: '#ccc', borderRadius: '50%', color: 'white', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>和</div>}
                                            </td>

                                            {/* 01-80 號碼佈局 */}
                                            {numbers1to80.map(num => {
                                                const isDrawn = draw.numbers.includes(num);
                                                const isSuper = num === draw.superNumber;
                                                
                                                let cellContent = null;
                                                if (isSuper) {
                                                    cellContent = (
                                                        <div style={{
                                                            background: '#8B5CF6', color: 'white', width: '18px', height: '18px', 
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            margin: '0 auto', fontWeight: 800, fontSize: '11px', borderRadius: '2px'
                                                        }}>
                                                            {num}
                                                        </div>
                                                    );
                                                } else if (isDrawn) {
                                                    cellContent = (
                                                        <div style={{
                                                            color: '#059669', width: '18px', height: '18px', 
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            margin: '0 auto', fontWeight: 800, fontSize: '11px'
                                                        }}>
                                                            {num.toString().padStart(2, '0')}
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <td key={num} style={{ 
                                                        borderRight: num % 10 === 0 ? '1px solid #cbd5e1' : '1px solid #e2e8f0',
                                                        padding: '2px'
                                                    }}>
                                                        {cellContent}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
