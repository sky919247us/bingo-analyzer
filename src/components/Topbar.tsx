/**
 * 頂部狀態列元件
 * 手機版顯示漢堡選單按鈕，PC 版隱藏
 */
import { useEffect, useState } from 'react';

interface TopbarProps {
    /** 觸發開關側邊欄（手機版） */
    onToggleSidebar: () => void;
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
    const [currentTime, setCurrentTime] = useState('');

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleString('zh-TW', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            }));
        };
        updateTime();
        const timer = setInterval(updateTime, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <header className="topbar">
            {/* 左側區塊：漢堡選單 + 搜尋 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flex: 1 }}>
                {/* 漢堡選單按鈕（僅手機版可見，CSS 控制） */}
                <button
                    className="hamburger-btn"
                    onClick={onToggleSidebar}
                    aria-label="開啟選單"
                >
                    <span />
                    <span />
                    <span />
                </button>

                <div className="topbar-search">
                    <span style={{ color: 'var(--text-muted)' }}>🔍</span>
                    <input type="text" placeholder="搜尋彩券名稱或功能..." />
                </div>
            </div>

            {/* 右側區塊：公告 + 時間 */}
            <div className="topbar-right">
                <div className="topbar-announcement">
                    🔔 <span className="ticker-text">台彩 BINGO BINGO 連線正常，資料即時同步中</span>
                </div>

                <div className="topbar-time">
                    {currentTime}
                </div>
            </div>
        </header>
    );
}
