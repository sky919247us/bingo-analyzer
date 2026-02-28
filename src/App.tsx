/**
 * App 根元件
 * 包含 HashRouter 路由、導覽列與頁面佈局
 */
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/dashboard';
import Calculator from './pages/calculator';
import PrizeTablePage from './pages/prize-table-page';
import Backtest from './pages/backtest';
import Simulation from './pages/simulation';

/** 導覽列項目定義 */
const NAV_ITEMS = [
    { to: '/', label: '📊 儀表板' },
    { to: '/calculator', label: '🧮 計算器' },
    { to: '/prize-tables', label: '🏆 獎金表' },
    { to: '/backtest', label: '📜 歷史回測' },
    { to: '/simulation', label: '🎲 蒙地卡羅' },
] as const;

export default function App() {
    return (
        <HashRouter>
            {/* 頂部導覽列 */}
            <header className="nav-header">
                <nav className="nav-inner">
                    <a href="#/" className="nav-logo">
                        <span className="nav-logo-icon">B</span>
                        <span className="nav-logo-text">刮刮研究室</span>
                    </a>
                    <div className="nav-links">
                        {NAV_ITEMS.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === '/'}
                                className={({ isActive }) =>
                                    `nav-link${isActive ? ' active' : ''}`
                                }
                            >
                                {item.label}
                            </NavLink>
                        ))}
                    </div>
                </nav>
            </header>

            {/* 主要內容區 */}
            <main className="main-content">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/calculator" element={<Calculator />} />
                    <Route path="/prize-tables" element={<PrizeTablePage />} />
                    <Route path="/backtest" element={<Backtest />} />
                    <Route path="/simulation" element={<Simulation />} />
                </Routes>
            </main>

            {/* 頁尾 */}
            <footer className="app-footer">
                刮刮研究室 © 2026 — 賓果賓果多星數機率分析模型
            </footer>
        </HashRouter>
    );
}
