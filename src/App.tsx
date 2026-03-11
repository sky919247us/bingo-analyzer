/**
 * App 根元件
 * 金融後台版面配置 (左側 Sidebar + 頂部 Topbar + 右側主要內容)
 * 支援手機版漢堡選單切換側邊欄
 */
import { useState, useCallback } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';

/* 共用版面元件 */
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

/* 模組一：核心大盤 */
import Dashboard from './pages/dashboard';
import Calculator from './pages/calculator';
import PrizeTablePage from './pages/prize-table-page';

/* 模組二：量化實驗室 */
import Backtest from './pages/backtest';
import Simulation from './pages/simulation';

/* 模組三：Bingo 專業套件 */
import BingoPrediction from './pages/bingo-prediction';
import BingoStatistics from './pages/bingo-statistics';
import BingoLatest from './pages/bingo-latest';
import BingoRecords from './pages/bingo-records';
import BingoDistribution from './pages/bingo-distribution';
import DashboardLarge from './pages/dashboard-large';

export default function App() {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const toggleSidebar = useCallback(() => {
        setSidebarOpen((prev) => !prev);
    }, []);

    const closeSidebar = useCallback(() => {
        setSidebarOpen(false);
    }, []);

    return (
        <HashRouter>
            <div className="app-layout">
                {/* 左側欄導航 */}
                <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

                {/* 右側主區域 */}
                <div className="main-wrapper">
                    {/* 頂部狀態列 */}
                    <Topbar onToggleSidebar={toggleSidebar} />

                    {/* 內容滾動區 */}
                    <main className="main-content">
                        <div className="content-container">
                            <Routes>
                                {/* 核心大盤 */}
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/calculator" element={<Calculator />} />
                                <Route path="/prize-tables" element={<PrizeTablePage />} />

                                {/* 量化實驗室 */}
                                <Route path="/backtest" element={<Backtest />} />
                                <Route path="/simulation" element={<Simulation />} />

                                {/* Bingo 專業套件 */}
                                <Route path="/bingo-prediction" element={<BingoPrediction />} />
                                <Route path="/bingo-statistics" element={<BingoStatistics />} />
                                <Route path="/bingo-latest" element={<BingoLatest />} />
                                <Route path="/bingo-records" element={<BingoRecords />} />
                                <Route path="/bingo-distribution" element={<BingoDistribution />} />
                                <Route path="/dashboard-large" element={<DashboardLarge />} />
                            </Routes>
                        </div>
                    </main>
                </div>
            </div>
        </HashRouter>
    );
}
