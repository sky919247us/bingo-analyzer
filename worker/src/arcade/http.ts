/** 新 /api/* 端點共用的 HTTP 工具（CORS 白名單、JSON 回應、錯誤） */

export const ALLOWED_ORIGINS = [
  'https://bingo.i168.win',
  'http://localhost:5173',
  'http://localhost:4173',
];

/** 業務錯誤：會轉成 { error, code } 與對應狀態碼 */
export class ApiError extends Error {
  /** extra：附加在錯誤回應 body 的欄位（例：TOO_MANY_PERIODS 的 maxPeriods） */
  constructor(public status: number, message: string, public code?: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export function json(request: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsFor(request), 'Content-Type': 'application/json;charset=UTF-8', 'Cache-Control': 'no-store' },
  });
}

export function errorResponse(request: Request, err: unknown): Response {
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { ...(err.extra ?? {}), error: err.message };
    if (err.code) body.code = err.code;
    return json(request, body, err.status);
  }
  console.error('[arcade] 未預期錯誤:', err);
  return json(request, { error: 'Internal Error', code: 'INTERNAL' }, 500);
}

export async function readJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, '請求內容不是合法 JSON', 'BAD_REQUEST');
  }
}

/** return_to 必須「origin 完全等於」白名單之一（避免 bingo.i168.win.evil.com 這類前綴繞過） */
export function isAllowedReturnTo(url: string | null): boolean {
  if (!url) return false;
  try {
    return ALLOWED_ORIGINS.includes(new URL(url).origin);
  } catch {
    return false;
  }
}
