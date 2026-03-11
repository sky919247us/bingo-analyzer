import { useSeo } from '../hooks/useSeo';
/**
 * 店家大螢幕專用儀表板
 * 隱藏側邊欄與上方導覽，全螢幕顯示最新開獎與重要統計數據。
 */
import { useEffect } from 'react';
import { useBingoData } from '../hooks/useBingoData';
import { BingoGrid } from '../components/BingoGrid';

export default function DashboardLarge() {
    useSeo({ title: '門市大螢幕看板', description: '專為彩券行與分析愛好者打造的滿版即時開獎儀表板，一目了然看盤無干擾。', keywords: '賓果大螢幕, 店面看盤' });
    const { latestDraw, latestStats, countdown, draws, error } = useBingoData();

    useEffect(() => {
        // HACK: 隱藏預設版面元素以達成全螢幕效果
        const sidebar = document.querySelector('.sidebar') as HTMLElement;
        const topbar = document.querySelector('.topbar') as HTMLElement;
        const mainContent = document.querySelector('.main-content') as HTMLElement;
        const contentContainer = document.querySelector('.content-container') as HTMLElement;

        if (sidebar) sidebar.style.display = 'none';
        if (topbar) topbar.style.display = 'none';
        if (mainContent) {
            mainContent.style.padding = '0';
            mainContent.style.background = '#0B192C'; // 深色全螢幕背景
        }
        if (contentContainer) contentContainer.style.maxWidth = '100%';

        return () => {
            // 離開時還原
            if (sidebar) sidebar.style.display = '';
            if (topbar) topbar.style.display = '';
            if (mainContent) {
                mainContent.style.padding = '';
                mainContent.style.background = '';
            }
            if (contentContainer) contentContainer.style.maxWidth = '';
        };
    }, []);

    if (error) {
        return <div style={{ color: 'red', padding: 40, fontSize: '2rem' }}>⚠️ {error}</div>;
    }

    if (!latestDraw || !latestStats) {
        return <div style={{ color: 'white', padding: 40, fontSize: '2rem' }}>載入中...</div>;
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', color: 'white', padding: '1vw' }}>
            {/* 頂部標題與時間 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2vh' }}>
                <h1 style={{ fontSize: '3.5vw', margin: 0, fontWeight: 900, color: '#f39c12', fontFamily: 'var(--font-display)' }}>🏆 台灣彩券 賓果賓果</h1>
                <div style={{ display: 'flex', gap: '2vw', alignItems: 'center' }}>
                    <div style={{ fontSize: '2.5vw', fontWeight: 700, fontFamily: 'var(--font-display)' }}>第 <span style={{ color: '#00ff87' }}>{latestDraw.period}</span> 期</div>
                    <div style={{ fontSize: '1.5vw', background: '#333', padding: '0.5vw 1.5vw', borderRadius: '50px' }}>倒數 {countdown} 秒</div>
                </div>
            </div>

            {/* 主要內容區 */}
            <div style={{ display: 'flex', gap: '2vw', flex: 1 }}>
                
                {/* 左側：方格圖 */}
                <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div className="dashboard-large-grid-container" style={{ flex: 1, background: '#121A2F', borderRadius: '1vw', padding: '1vw', border: '2px solid #5A6268', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1vw' }}>
                            <h2 style={{ fontSize: '1.5vw', color: '#60A5FA', margin: 0 }}>🔲 80 號碼分佈圖</h2>
                            <div style={{ display: 'flex', gap: '1vw', fontSize: '1vw', whiteSpace: 'nowrap' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4vw' }}><div style={{ width: '1vw', height: '1vw', background: '#F87171' }} /> 大數</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4vw' }}><div style={{ width: '1vw', height: '1vw', background: '#60A5FA' }} /> 小數</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4vw' }}><div style={{ width: '1vw', height: '1vw', background: '#F59E0B' }} /> 超級</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4vw' }}>🔁 連莊</span>
                            </div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <BingoGrid 
                                drawnNumbers={latestDraw.numbers} 
                                superNumber={latestDraw.superNumber}
                                previousNumbers={draws[1]?.numbers || []}
                            />
                        </div>
                    </div>
                </div>

                {/* 右側：開獎資訊 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5vw', minWidth: 0 }}>
                    
                    {/* 開獎號碼條列 */}
                    <div style={{ background: '#121A2F', borderRadius: '1vw', padding: '2vw', border: '2px solid #5A6268' }}>
                        <h2 style={{ fontSize: '2vw', marginBottom: '1vw', color: '#60A5FA' }}>🎱 開出號碼</h2>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5vw' }}>
                            {latestDraw.numbers.map((num) => (
                                <div key={num} style={{ 
                                    width: '3.5vw', height: '3.5vw', 
                                    borderRadius: '50%', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '1.6vw', fontWeight: 900, fontFamily: 'var(--font-display)',
                                    background: num === latestDraw.superNumber ? '#f39c12' : '#FFFFFF',
                                    color: '#0B192C'
                                }}>
                                    {num}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 統計大看板 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2vw', flex: 1 }}>
                        <div style={{ background: '#121A2F', borderRadius: '1vw', padding: '2vw', border: '2px solid #5A6268', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ fontSize: '1.5vw', color: '#94A3B8' }}>大小比 ({latestStats.bigSmallRatio})</div>
                            <div style={{ fontSize: '4.5vw', fontWeight: 900, color: latestStats.bigSmallResult === '大' ? '#F87171' : '#60A5FA' }}>
                                {latestStats.bigSmallResult !== '－' ? latestStats.bigSmallResult : '和'}
                            </div>
                        </div>
                        <div style={{ background: '#121A2F', borderRadius: '1vw', padding: '2vw', border: '2px solid #5A6268', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ fontSize: '1.5vw', color: '#94A3B8' }}>單雙比 ({latestStats.oddEvenRatio})</div>
                            <div style={{ fontSize: '4.5vw', fontWeight: 900, color: latestStats.oddEvenResult === '單' ? '#f39c12' : '#a78bfa' }}>
                                {latestStats.oddEvenResult !== '－' ? latestStats.oddEvenResult : '和'}
                            </div>
                        </div>
                        <div style={{ background: '#121A2F', borderRadius: '1vw', padding: '2vw', border: '2px solid #5A6268', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ fontSize: '1.5vw', color: '#94A3B8' }}>和值</div>
                            <div style={{ fontSize: '4.5vw', fontWeight: 900, color: latestStats.sum >= 811 ? '#F87171' : '#60A5FA' }}>
                                {latestStats.sum}
                            </div>
                        </div>
                        <div style={{ background: '#121A2F', borderRadius: '1vw', padding: '2vw', border: '2px solid #5A6268', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ fontSize: '1.5vw', color: '#94A3B8' }}>超級獎號</div>
                            <div style={{ fontSize: '5.5vw', fontWeight: 900, color: '#f39c12', textShadow: '0 0 20px rgba(243,156,18,0.5)' }}>
                                {latestDraw.superNumber}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            {/* 退出按鈕 */}
            <div style={{ position: 'absolute', bottom: '1vw', right: '1vw' }}>
                <button 
                    onClick={() => window.history.back()} 
                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '1vw 2vw', borderRadius: '0.5vw', cursor: 'pointer', fontSize: '1.2vw' }}
                >
                    返回標準模式
                </button>
            </div>
        </div>
    );
}
