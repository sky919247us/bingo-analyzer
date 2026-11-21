/**
 * 賓果娛樂機 — 音效
 * 預設靜音；開關存 localStorage `arcade-sound`
 *
 * 兩層：
 * 1. AI 生成音檔（public/arcade/audio/*.mp3，Kaggle 上用 ACE-Step 1.5 / MOSS-SoundEffect 生成）
 * 2. WebAudio 即時合成 —— 音檔還沒載好、不存在或解碼失敗時的備援，所以缺檔不會沒聲音也不會丟例外
 * 音檔在第一次開聲音時才下載（靜音玩家完全不耗流量）。
 */

const KEY = 'arcade-sound';
const AUDIO_BASE = `${import.meta.env.BASE_URL}arcade/audio/`;

/** 有哪些音檔：名稱 → 檔名。沒列在這裡、或載入失敗的，一律走合成音 */
const FILES = {
    bgm: 'bgm_lobby.mp3',
    reach: 'reach_loop.mp3',
    fanfare: 'fanfare.mp3',
    bigwin: 'bigwin_party.mp3',
    // 以下音效取自 casper.tw 音效庫（Stable Audio 生成，可自由使用；已剪短）
    click: 'sfx_click.mp3',
    ball: 'sfx_ball.mp3',
    hit: 'sfx_hit.mp3',
    step: 'sfx_step.mp3',
    reachStart: 'sfx_reach.mp3',
    push: 'sfx_push.mp3',
    cutIn: 'sfx_cutin.mp3',
    coin: 'sfx_coin.mp3',
    miss: 'sfx_miss.mp3',
    /** 大獎金幣雨：賭場硬幣傾瀉＋大獎鈴聲狂響 混成一檔 */
    coinShower: 'sfx_coin_shower.mp3',
} as const;
type SampleName = keyof typeof FILES;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let enabled = loadEnabled();
let heartTimer: ReturnType<typeof setInterval> | null = null;

const buffers = new Map<SampleName, AudioBuffer | 'loading' | 'fail'>();
let bgmWanted = false;
let bgmSrc: AudioBufferSourceNode | null = null;
let reachSrc: AudioBufferSourceNode | null = null;
let duckTimer: ReturnType<typeof setTimeout> | null = null;
const BGM_GAIN = 0.35;
/** 派彩金幣音檔較長（約 3 秒），金幣雨每 180ms 會叫一次：還在播就不重疊 */
let coinBusyUntil = 0;

function loadEnabled(): boolean {
    try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
}

export function isSoundOn(): boolean {
    return enabled;
}

export function setSoundOn(on: boolean): void {
    enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 忽略 */ }
    if (on) {
        ensure();
        if (bgmWanted) startBgm();
    } else {
        stopHeartbeat();
        stopNode(bgmSrc); bgmSrc = null;
    }
}

/** 取得（必要時建立）AudioContext；需在使用者手勢後才能發聲 */
function ensure(): AudioContext | null {
    if (!enabled) return null;
    try {
        if (!ctx) {
            const AC = window.AudioContext
                ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = 0.5;
            master.connect(ctx.destination);
            musicBus = ctx.createGain();
            musicBus.gain.value = BGM_GAIN;
            musicBus.connect(master);
            preloadAll(ctx);
            // 重新整理後聲音是「開」的狀態時，瀏覽器要等使用者第一次點擊才肯發聲
            const unlock = () => { if (ctx?.state === 'suspended') void ctx.resume(); };
            window.addEventListener('pointerdown', unlock, { once: true });
            window.addEventListener('keydown', unlock, { once: true });
        }
        if (ctx.state === 'suspended') void ctx.resume();
        return ctx;
    } catch {
        return null;
    }
}

/* ---------- 音檔層 ---------- */

function preloadAll(c: AudioContext): void {
    (Object.keys(FILES) as SampleName[]).forEach((name) => {
        if (buffers.has(name)) return;
        buffers.set(name, 'loading');
        fetch(AUDIO_BASE + FILES[name])
            .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
            .then((ab) => c.decodeAudioData(ab))
            .then((buf) => {
                buffers.set(name, buf);
                if (name === 'bgm' && bgmWanted) startBgm();
            })
            .catch(() => buffers.set(name, 'fail'));
    });
}

function ready(name: SampleName): AudioBuffer | null {
    const b = buffers.get(name);
    return b instanceof AudioBuffer ? b : null;
}

function stopNode(n: AudioBufferSourceNode | null): void {
    try { n?.stop(); } catch { /* 已停 */ }
}

/** 播一個音檔；成功回傳 node，沒載好回傳 null（呼叫端改用合成音） */
function play(name: SampleName, opts: { loop?: boolean; gain?: number; bus?: GainNode | null; rate?: number } = {}): AudioBufferSourceNode | null {
    const c = ensure();
    const buf = ready(name);
    const out = opts.bus ?? master;
    if (!c || !buf || !out) return null;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts.loop;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const g = c.createGain();
    g.gain.value = opts.gain ?? 1;
    src.connect(g);
    g.connect(out);
    src.start();
    return src;
}

/** 背景音樂暫時壓低（聽牌、號角時），ms 後回復；ms=0 表示一直壓著直到 unduck() */
function duck(ms: number): void {
    if (!ctx || !musicBus) return;
    if (duckTimer) clearTimeout(duckTimer);
    duckTimer = null;
    musicBus.gain.setTargetAtTime(0.04, ctx.currentTime, 0.15);
    if (ms > 0) duckTimer = setTimeout(unduck, ms);
}

function unduck(): void {
    if (duckTimer) clearTimeout(duckTimer);
    duckTimer = null;
    if (ctx && musicBus) musicBus.gain.setTargetAtTime(BGM_GAIN, ctx.currentTime, 0.4);
}

/** 大廳背景音樂（循環）。頁面掛載時呼叫；聲音關著時只記下「想播」，打開時才真的播 */
export function startBgm(): void {
    bgmWanted = true;
    if (!enabled || bgmSrc) return;
    bgmSrc = play('bgm', { loop: true, bus: musicBus });
}

export function stopBgm(): void {
    bgmWanted = false;
    stopNode(bgmSrc);
    bgmSrc = null;
}

interface ToneOpts {
    type?: OscillatorType;
    gain?: number;
    /** 延遲幾秒開始 */
    at?: number;
    /** 頻率滑到 */
    slideTo?: number;
}

function tone(freq: number, dur: number, opts: ToneOpts = {}): void {
    const c = ensure();
    if (!c || !master) return;
    const t0 = c.currentTime + (opts.at ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const peak = opts.gain ?? 0.15;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
}

/** 白噪音短爆（閃光、cut-in 用） */
function noise(dur: number, gain = 0.12, at = 0): void {
    const c = ensure();
    if (!c || !master) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    const g = c.createGain();
    const t0 = c.currentTime + at;
    g.gain.setValueAtTime(gain, t0);
    src.buffer = buf;
    src.connect(g);
    g.connect(master);
    src.start(t0);
}

export const sfx = {
    click() {
        if (play('click', { gain: 0.6 })) return;
        tone(880, 0.05, { type: 'square', gain: 0.05 });
    },
    /** 出球：音高隨球序微微上升 */
    ball(index: number) {
        if (play('ball', { gain: 0.55, rate: 1 + index * 0.012 })) return;
        tone(420 + index * 22, 0.12, { type: 'triangle', gain: 0.12, slideTo: 640 + index * 22 });
    },
    /** 命中玩家號碼 */
    hit() {
        if (play('hit', { gain: 0.8 })) return;
        tone(988, 0.09, { type: 'square', gain: 0.08 });
        tone(1319, 0.16, { type: 'square', gain: 0.08, at: 0.08 });
    },
    /** 預告 STEP 上升：每升一級音高往上 */
    step(n: number) {
        if (play('step', { gain: 0.7, rate: 0.9 + n * 0.08 })) return;
        tone(300 + n * 120, 0.18, { type: 'sawtooth', gain: 0.07, slideTo: 500 + n * 160 });
    },
    /** 聽牌開始 */
    reach() {
        if (play('reachStart', { gain: 0.8 })) return;
        noise(0.4, 0.1);
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'sawtooth', gain: 0.07, at: i * 0.09 }));
    },
    push() {
        if (play('push', { gain: 0.8 })) return;
        tone(196, 0.3, { type: 'square', gain: 0.1, slideTo: 784 });
        noise(0.2, 0.08, 0.05);
    },
    cutIn() {
        if (play('cutIn', { gain: 0.9 })) return;
        noise(0.5, 0.14);
        tone(110, 0.6, { type: 'sawtooth', gain: 0.1, slideTo: 880 });
    },
    /** 中獎號角（一般）／大獎派對（big） */
    fanfare(big: boolean) {
        if (big) {
            // 大獎：金幣雨音效和派對配樂一起響；金幣雨期間（約 6 秒）派彩金幣琶音先不播，免得疊成一團
            const shower = play('coinShower', { gain: 0.75 });
            if (shower && ctx) coinBusyUntil = ctx.currentTime + 6;
        }
        const node = play(big ? 'bigwin' : 'fanfare', { gain: 0.9 });
        if (node) {
            duck((node.buffer?.duration ?? 4) * 1000 + 300);
            return;
        }
        const notes = big ? [523, 659, 784, 1047, 784, 1047, 1319] : [659, 784, 1047];
        notes.forEach((f, i) => {
            tone(f, 0.22, { type: 'square', gain: 0.07, at: i * 0.13 });
            tone(f / 2, 0.22, { type: 'triangle', gain: 0.06, at: i * 0.13 });
        });
    },
    /** 派彩金幣（像素琶音）。音檔還在播時再叫不重疊；沒音檔才用合成短音（金幣雨會連續叫） */
    coin() {
        const c = ensure();
        if (!c) return;
        if (ready('coin')) {
            if (c.currentTime < coinBusyUntil) return;
            const node = play('coin', { gain: 0.6 });
            if (node) { coinBusyUntil = c.currentTime + (node.buffer?.duration ?? 3); return; }
        }
        tone(1568, 0.06, { type: 'square', gain: 0.04 }); tone(2093, 0.08, { type: 'square', gain: 0.04, at: 0.05 });
    },
    /** 落空 */
    miss() {
        if (play('miss', { gain: 0.7 })) return;
        tone(392, 0.25, { type: 'triangle', gain: 0.1, slideTo: 330 });
        tone(330, 0.4, { type: 'triangle', gain: 0.1, at: 0.22, slideTo: 247 });
    },
};

/** 聽牌：有配樂就循環播聽牌配樂，否則合成心跳 */
export function startHeartbeat(): void {
    stopHeartbeat();
    if (!enabled) return;
    reachSrc = play('reach', { loop: true, gain: 0.8 });
    if (reachSrc) {
        duck(0);
        return;
    }
    const beat = () => {
        tone(70, 0.12, { type: 'sine', gain: 0.35 });
        tone(60, 0.14, { type: 'sine', gain: 0.28, at: 0.18 });
    };
    beat();
    heartTimer = setInterval(beat, 820);
}

export function stopHeartbeat(): void {
    if (heartTimer) clearInterval(heartTimer);
    heartTimer = null;
    if (reachSrc) {
        stopNode(reachSrc);
        reachSrc = null;
        unduck();
    }
}
