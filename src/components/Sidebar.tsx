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
    { to: '/bingo-statistics', label: '統計分析', icon: '📈', end: false },
    { to: '/bingo-records', label: '歷史紀錄', icon: '📋', end: false },
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
                    <span className="logo-icon">B</span>
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
            </aside>
        </>
    );
}
