/** Node fetch 要求 Header 值为 Latin-1；中文占位符会触发 ByteString 错误 */

const NON_ASCII = /[^\x00-\xFF]/;

export function assertAsciiHeaderValue(field: string, value: string): string {
  if (!NON_ASCII.test(value)) return value;
  const idx = [...value].findIndex((ch) => ch.charCodeAt(0) > 255);
  throw new Error(
    `${field} 含非法字符（第 ${idx + 1} 位），HTTP 头只能是英文。` +
      `请填写 Postman 复制的 Bearer Token，不要用「你的BearerToken」等中文占位符。`,
  );
}

export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = assertAsciiHeaderValue(key, String(value));
  }
  return out;
}

export function normalizeBearerToken(
  raw: string | undefined,
  fieldName: string,
): string | undefined {
  const token = raw?.trim();
  if (!token) return undefined;
  assertAsciiHeaderValue(fieldName, token);
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export async function fetchWithAsciiHeaders(
  url: string,
  init: RequestInit & { headers?: Record<string, string> },
): Promise<Response> {
  const headers = init.headers ? sanitizeHeaders(init.headers) : undefined;
  return fetch(url, { ...init, headers });
}
