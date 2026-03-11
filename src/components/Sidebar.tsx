/**
 * 左側固定側邊欄元件
 * 手機版可透過漢堡選單開關，PC 版固定顯示
 */
import { NavLink } from 'react-router-dom';

/** 模組一：核心大盤 */
const CORE_NAV = [
    { to: '/', label: '儀表板', icon: '📊', end: true },
    { to: '/calculator', label: '計算器', icon: '🧮', end: false },
    { to: '/prize-tables', label: '獎金表', icon: '🏆', end: false },
];

/** 模組二：量化實驗室 */
const QUANT_NAV = [
    { to: '/backtest', label: '歷史回測', icon: '📜', end: false },
    { to: '/simulation', label: '蒙地卡羅', icon: '🎲', end: false },
];

/** 模組三：Bingo 專業套件 */
const BINGO_NAV = [
    { to: '/bingo-latest', label: '最新開獎', icon: '🏅', end: false },
    { to: '/bingo-prediction', label: '號碼預測', icon: '🔮', end: false },
    { to: '/bingo-records', label: '預測紀錄', icon: '📋', end: false },
    { to: '/bingo-distribution', label: '獎號分布', icon: '🎯', end: false },
    { to: '/bingo-statistics', label: '統計分析', icon: '📈', end: false },
    { to: '/dashboard-large', label: '大螢幕模式', icon: '🖥️', end: false },
];

interface SidebarProps {
    /** 手機版是否打開 */
    isOpen: boolean;
    /** 關閉側邊欄（手機版點擊連結後自動關閉） */
    onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    /** 點擊導航項目時，在手機版上自動關閉側邊欄 */
    const handleNavClick = () => {
        onClose();
    };

    return (
        <>
            {/* 手機版遮罩層 */}
            {isOpen && (
                <div className="sidebar-overlay" onClick={onClose} />
            )}

            <aside className={`sidebar${isOpen ? ' sidebar-open' : ''}`}>
                <div className="sidebar-brand">
                    刮刮研究室
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-module">
                        <div className="nav-module-title">核心大盤 Core Analytics</div>
                        {CORE_NAV.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                                onClick={handleNavClick}
                            >
                                <span style={{ width: 24, textAlign: 'center' }}>{item.icon}</span>
                                {item.label}
                            </NavLink>
                        ))}
                    </div>

                    <div className="nav-module">
                        <div className="nav-module-title">量化實驗室 Quant Lab</div>
                        {QUANT_NAV.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                                onClick={handleNavClick}
                            >
                                <span style={{ width: 24, textAlign: 'center' }}>{item.icon}</span>
                                {item.label}
                            </NavLink>
                        ))}
                    </div>

                    <div className="nav-module">
                        <div className="nav-module-title">Bingo 專業版 Pro Suite</div>
                        {BINGO_NAV.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                                onClick={handleNavClick}
                            >
                                <span style={{ width: 24, textAlign: 'center' }}>{item.icon}</span>
                                {item.label}
                            </NavLink>
                        ))}
                    </div>
                </nav>

                <div className="sidebar-footer" style={{ padding: '20px', marginTop: 'auto', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center' }}>
                    <a href="https://www.youtube.com/channel/UCU68swgh6cL3cCauKf5ZJKA/" target="_blank" rel="noopener noreferrer" aria-label="刮刮研究室 YouTube 頻道" style={{ color: '#ff0000', display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        訂閱頻道
                    </a>
                </div>
            </aside>
        </>
    );
}
