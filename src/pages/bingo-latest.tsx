/**
 * 最新開獎頁面
 * 僅顯示即時模式：最新期數、盤路統計、近期開獎紀錄
 */
import { useBingoData } from '../hooks/useBingoData';

export default function BingoLatest() {
    const { latestDraw, latestStats, loading, countdown, draws, error } = useBingoData();

    /** 格式化 Date 物件為顯示用字串 */
    const formatDate = (dt: Date) =>
        `${dt.getFullYear()}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getDate().toString().padStart(2, '0')} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;

    /** 格式化開獎時間（原始字串版） */
    const formatDrawTime = (drawTime: string) => {
        if (!drawTime || drawTime === '0001-01-01T00:00:00') return '—';
        try {
            const dt = new Date(drawTime);
            if (isNaN(dt.getTime())) return drawTime;
            return formatDate(dt);
        } catch {
            return drawTime;
        }
    };

    /**
     * 取得指定 draw 的開獎時間
     * 台彩歷史 API 不回傳個別期次的時間，故以最新期的已知時間為基準，
     * 根據期數差 × 5 分鐘反推計算
     */
    const getDrawTime = (draw: typeof draws[0]) => {
        // 如果 draw 本身有有效時間，直接用
        if (draw.drawTime && draw.drawTime !== '0001-01-01T00:00:00') {
            const dt = new Date(draw.drawTime);
            if (!isNaN(dt.getTime()) && dt.getFullYear() > 2000) {
                return formatDate(dt);
            }
        }

        // 以最新期為基準反推（賓果賓果每 5 分鐘一期）
        if (latestDraw?.drawTime && latestDraw.period) {
            const latestDate = new Date(latestDraw.drawTime);
            if (!isNaN(latestDate.getTime()) && latestDate.getFullYear() > 2000) {
                const periodDiff = Number(latestDraw.period) - Number(draw.period);
                const drawDate = new Date(latestDate.getTime() - periodDiff * 5 * 60_000);
                return formatDate(drawDate);
            }
        }

        return '—';
    };

    return (
        <div className="animate-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <h1 className="page-title">🏆 最新開獎</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge badge-success" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                        🟢 即時模式
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>⏱ {countdown}s 後更新</span>
                </div>
            </div>

            {loading && <div className="skeleton" style={{ height: 200, marginBottom: 20 }} />}

            {error && (
                <div className="card" style={{ marginBottom: 20, borderColor: 'var(--danger)' }}>
                    <p style={{ color: 'var(--danger)' }}>⚠️ {error}</p>
                </div>
            )}

            {!loading && latestDraw && (
                <>
                    {/* 期數與時間 */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                            <div>
                                <span className="form-label">期數</span>
                                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: 1, color: 'var(--success)' }}>
                                    第 {latestDraw.period} 期
                                </h2>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span className="form-label">開獎時間</span>
                                <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                                    {formatDrawTime(latestDraw.drawTime)}
                                </p>
                            </div>
                        </div>

                        {/* 開獎號碼 */}
                        <h3 className="section-title">🎱 開獎號碼</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                            {latestDraw.numbers.map((num) => (
                                <div
                                    key={num}
                                    className={`bingo-ball${num === latestDraw.superNumber ? ' super' : ' drawn'}`}
                                >
                                    {num}
                                </div>
                            ))}
                        </div>

                        {/* 超級獎號 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>超級獎號</span>
                            <div className="bingo-ball super" style={{ width: 52, height: 52, fontSize: '1.1rem' }}>
                                {latestDraw.superNumber}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                {latestStats ? (
                                    <>
                                        {latestStats.bigSmallResult !== '－' ? (
                                            latestStats.bigSmallResult === '大' ? '🔴 大' : '🔵 小'
                                        ) : '⚪ 和'}
                                        {' · '}
                                        {latestStats.oddEvenResult !== '－' ? latestStats.oddEvenResult : '和'}
                                    </>
                                ) : '—'}
                            </div>
                        </div>
                    </div>

                    {/* 盤路統計 */}
                    {latestStats && (
                        <div className="card" style={{ marginBottom: 20 }}>
                            <h3 className="section-title">📊 盤路統計</h3>
                            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                                <div>
                                    <span className="form-label">大小比</span>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: 1 }}>
                                        {latestStats.bigSmallRatio}
                                        {latestStats.bigSmallResult !== '－' && (
                                            <span style={{ marginLeft: 8, fontSize: '1rem', color: latestStats.bigSmallResult === '大' ? 'var(--danger)' : 'var(--info)' }}>
                                                ({latestStats.bigSmallResult})
                                            </span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(≥41 : ≤40，≥13成立)</span>
                                </div>
                                <div>
                                    <span className="form-label">單雙比</span>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: 1 }}>
                                        {latestStats.oddEvenRatio}
                                        {latestStats.oddEvenResult !== '－' && (
                                            <span style={{ marginLeft: 8, fontSize: '1rem', color: latestStats.oddEvenResult === '單' ? 'var(--warning)' : '#a78bfa' }}>
                                                ({latestStats.oddEvenResult})
                                            </span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(單 : 雙，≥13成立)</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 近 20 期列表 */}
                    <div className="card">
                        <h3 className="section-title">📋 近期開獎紀錄（最新 20 期）</h3>
                        <div className="table-container" style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>期數</th>
                                        <th>時間</th>
                                        <th>開獎號碼</th>
                                        <th>超級獎號</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {draws.slice(0, 20).map((draw) => (
                                        <tr key={draw.period}>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                                {draw.period}
                                            </td>
                                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {getDrawTime(draw)}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                                    {draw.numbers.map((n) => (
                                                        <span
                                                            key={n}
                                                            style={{
                                                                display: 'inline-block',
                                                                width: 26, height: 26,
                                                                lineHeight: '26px', textAlign: 'center',
                                                                borderRadius: '50%',
                                                                fontSize: '0.65rem', fontWeight: 700,
                                                                fontFamily: 'var(--font-mono)',
                                                                background: n === draw.superNumber
                                                                    ? 'var(--warning)'
                                                                    : 'var(--primary)',
                                                                color: n === draw.superNumber
                                                                    ? 'var(--primary)'
                                                                    : 'var(--text-inverse)',
                                                            }}
                                                        >
                                                            {n}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge badge-warning" style={{ fontSize: '0.85rem' }}>{draw.superNumber}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {!loading && !latestDraw && !error && (
                <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                    <div style={{ fontSize: 48 }}>🎰</div>
                    <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>目前尚無開獎資料</p>
                </div>
            )}
        </div>
    );
}
