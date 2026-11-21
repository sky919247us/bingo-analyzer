/**
 * 金幣雨（canvas）
 * reduced-motion 時關閉；低階裝置（≤4 核或省電）自動減量
 */
import { useEffect, useRef } from 'react';
import { sfx } from '../audio';

interface Coin { x: number; y: number; vx: number; vy: number; r: number; spin: number; phase: number }

function particleBudget(level: 'win' | 'big' | 'mega'): number {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
    const low = cores <= 4;
    const base = level === 'mega' ? 420 : level === 'big' ? 280 : 110;
    return low ? Math.round(base * 0.35) : base;
}

export default function CoinRain({ level, reduced }: { level: 'win' | 'big' | 'mega' | null; reduced: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!level || reduced) return;
        const canvas = ref.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const resize = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        const W = () => window.innerWidth;
        const total = particleBudget(level);
        const coins: Coin[] = [];
        let spawned = 0;
        const started = performance.now();
        const duration = level === 'win' ? 3500 : 5500;
        let raf = 0;
        let lastSound = 0;

        const spawn = (n: number) => {
            for (let i = 0; i < n && spawned < total; i++, spawned++) {
                coins.push({
                    x: Math.random() * W(),
                    y: -20 - Math.random() * 120,
                    vx: (Math.random() - 0.5) * 1.6,
                    vy: 2 + Math.random() * 3.5,
                    r: 6 + Math.random() * 7,
                    spin: 0.05 + Math.random() * 0.15,
                    phase: Math.random() * Math.PI * 2,
                });
            }
        };

        const tick = (t: number) => {
            const elapsed = t - started;
            if (elapsed < duration) spawn(Math.ceil(total / 60));
            ctx.clearRect(0, 0, W(), window.innerHeight);
            for (const c of coins) {
                c.vy += 0.08;
                c.x += c.vx;
                c.y += c.vy;
                c.phase += c.spin;
                const w = Math.abs(Math.cos(c.phase)) * c.r + 1;
                const g = ctx.createLinearGradient(c.x - w, c.y, c.x + w, c.y);
                g.addColorStop(0, '#b8860b');
                g.addColorStop(0.5, '#ffe27a');
                g.addColorStop(1, '#c9971c');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.ellipse(c.x, c.y, w, c.r, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            for (let i = coins.length - 1; i >= 0; i--) if (coins[i].y > window.innerHeight + 30) coins.splice(i, 1);
            if (t - lastSound > 180 && elapsed < duration) { sfx.coin(); lastSound = t; }
            if (elapsed < duration || coins.length > 0) raf = requestAnimationFrame(tick);
            else ctx.clearRect(0, 0, W(), window.innerHeight);
        };
        raf = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };
    }, [level, reduced]);

    if (!level || reduced) return null;
    return <canvas ref={ref} className="arcade-coinrain" aria-hidden="true" />;
}
