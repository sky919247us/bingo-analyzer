/** 認證：LINE Login（OAuth2 + PKCE S256）、一次性 login_code、Bearer session */
import { getUserById, nowIso, upsertUser } from './db';
import { ApiError, isAllowedReturnTo, json, readJson } from './http';
import type { ArcadeEnv, UserRow } from './types';

const SESSION_DAYS = 30;
const LINE_AUTHORIZE = 'https://access.line.me/oauth2/v2.1/authorize';
const LINE_TOKEN = 'https://api.line.me/oauth2/v2.1/token';
const LINE_VERIFY = 'https://api.line.me/oauth2/v2.1/verify';

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomHex(bytes = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

/** 建立 session，回傳明文 token（D1 只存 sha256） */
export async function createSession(env: ArcadeEnv, userId: number): Promise<string> {
  const token = randomHex(32);
  const now = Date.now();
  await env.ARCADE_DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, nowIso(now), nowIso(now + SESSION_DAYS * 86400_000)).run();
  return token;
}

function bearer(request: Request): string | null {
  const h = request.headers.get('Authorization') ?? '';
  const m = h.match(/^Bearer\s+([0-9a-f]{64})$/i);
  return m ? m[1].toLowerCase() : null;
}

/** 有帶合法 token 則回使用者，否則 null */
export async function optionalUser(request: Request, env: ArcadeEnv): Promise<UserRow | null> {
  const token = bearer(request);
  if (!token) return null;
  const s = await env.ARCADE_DB.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .bind(await sha256Hex(token)).first<{ user_id: number; expires_at: string }>();
  if (!s || s.expires_at <= nowIso()) return null;
  return getUserById(env, s.user_id);
}

export async function requireUser(request: Request, env: ArcadeEnv): Promise<UserRow> {
  const u = await optionalUser(request, env);
  if (!u) throw new ApiError(401, '請先登入', 'UNAUTHORIZED');
  return u;
}

export function requireAgreed(user: UserRow): void {
  if (!user.agreed_at) throw new ApiError(403, '請先閱讀並同意使用條款', 'NOT_AGREED');
}

/** 把 login_code / login_error 加到 return_to 的 hash 路徑查詢字串 */
function withHashParam(returnTo: string, key: string, value: string): string {
  const u = new URL(returnTo);
  let hash = u.hash.replace(/^#/, '') || '/bingo-arcade';
  hash += (hash.includes('?') ? '&' : '?') + `${key}=${encodeURIComponent(value)}`;
  u.hash = hash;
  return u.toString();
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } });
}

/** GET /api/auth/line/start?return_to= */
export async function lineStart(request: Request, env: ArcadeEnv): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('return_to');
  if (!isAllowedReturnTo(returnTo)) throw new ApiError(400, 'return_to 不在允許清單', 'BAD_RETURN_TO');
  if (!env.LINE_CHANNEL_ID || !env.LINE_CALLBACK_URL) throw new ApiError(500, 'LINE Login 尚未設定', 'NOT_CONFIGURED');

  const state = randomHex(16);
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  await env.BINGO_KV.put(`arcade:oauth:${state}`, JSON.stringify({ verifier, returnTo }), { expirationTtl: 600 });

  const auth = new URL(LINE_AUTHORIZE);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('client_id', env.LINE_CHANNEL_ID);
  auth.searchParams.set('redirect_uri', env.LINE_CALLBACK_URL);
  auth.searchParams.set('state', state);
  auth.searchParams.set('scope', 'openid profile');
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  return redirect(auth.toString());
}

/** GET /api/auth/line/callback?code&state */
export async function lineCallback(request: Request, env: ArcadeEnv): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code');
  const saved = /^[0-9a-f]{32}$/.test(state) ? await env.BINGO_KV.get(`arcade:oauth:${state}`) : null;
  if (!saved) {
    return new Response('登入逾時或 state 無效，請回網站重新登入', {
      status: 400,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    });
  }
  await env.BINGO_KV.delete(`arcade:oauth:${state}`);
  const { verifier, returnTo } = JSON.parse(saved) as { verifier: string; returnTo: string };

  try {
    if (!code) throw new Error(url.searchParams.get('error_description') || url.searchParams.get('error') || '使用者取消授權');
    const tokenResp = await fetch(LINE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.LINE_CALLBACK_URL ?? '',
        client_id: env.LINE_CHANNEL_ID ?? '',
        client_secret: env.LINE_CHANNEL_SECRET ?? '',
        code_verifier: verifier,
      }),
    });
    if (!tokenResp.ok) throw new Error(`token 交換失敗 (${tokenResp.status})`);
    const tokenData: any = await tokenResp.json();
    if (!tokenData.id_token) throw new Error('LINE 未回傳 id_token');

    const verifyResp = await fetch(LINE_VERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: tokenData.id_token, client_id: env.LINE_CHANNEL_ID ?? '' }),
    });
    if (!verifyResp.ok) throw new Error(`id_token 驗證失敗 (${verifyResp.status})`);
    const profile: any = await verifyResp.json();
    if (!profile.sub) throw new Error('id_token 無 sub');

    const user = await upsertUser(
      env,
      String(profile.sub),
      String(profile.name ?? '').slice(0, 50),
      profile.picture ? String(profile.picture) : null,
    );
    const loginCode = randomHex(16);
    await env.BINGO_KV.put(`arcade:login:${loginCode}`, String(user.id), { expirationTtl: 120 });
    return redirect(withHashParam(returnTo, 'login_code', loginCode));
  } catch (err: any) {
    console.error('[arcade] LINE callback 失敗:', err);
    return redirect(withHashParam(returnTo, 'login_error', String(err?.message ?? 'login failed').slice(0, 100)));
  }
}

/** POST /api/auth/exchange {code} → { token, user } */
export async function exchange(request: Request, env: ArcadeEnv, userView: (u: UserRow) => unknown): Promise<Response> {
  const body = await readJson(request);
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!/^[0-9a-f]{32}$/.test(code)) throw new ApiError(400, 'code 格式錯誤', 'BAD_CODE');
  const key = `arcade:login:${code}`;
  const uid = await env.BINGO_KV.get(key);
  if (!uid) throw new ApiError(400, 'code 無效或已過期', 'BAD_CODE');
  await env.BINGO_KV.delete(key); // 用過即刪
  const user = await getUserById(env, Number(uid));
  if (!user) throw new ApiError(400, '使用者不存在', 'BAD_CODE');
  const token = await createSession(env, user.id);
  return json(request, { token, user: userView(user) });
}

/** POST /api/auth/logout */
export async function logout(request: Request, env: ArcadeEnv): Promise<Response> {
  const token = bearer(request);
  if (token) await env.ARCADE_DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return json(request, { ok: true });
}
