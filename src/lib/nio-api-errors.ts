/** 车辆 / 换电 API 错误分类（与 ha-nio api.py 对齐） */

export type NioErrorKind = "sign" | "auth" | "generic";

export class NioApiError extends Error {
  readonly kind: NioErrorKind;

  constructor(message: string, kind: NioErrorKind = "generic") {
    super(message);
    this.name = "NioApiError";
    this.kind = kind;
  }
}

export class NioSignError extends NioApiError {
  constructor(message: string) {
    super(message, "sign");
    this.name = "NioSignError";
  }
}

export class NioAuthError extends NioApiError {
  constructor(message: string) {
    super(message, "auth");
    this.name = "NioAuthError";
  }
}

export function classifyVehicleApiFailure(
  payload: Record<string, unknown> | null | undefined,
  httpStatus: number,
): NioApiError {
  const code = payload?.result_code ?? payload?.resultCode;
  const codestr = String(code ?? "");
  const desc =
    payload?.display_msg ??
    payload?.message ??
    payload?.debug_msg ??
    payload?.result_desc ??
    codestr;

  if (code === "sign_failed" || codestr.toLowerCase().includes("sign")) {
    return new NioSignError(
      `签名被拒绝（${codestr || "sign_failed"}）：打开「更新 Token」，选中失效的那条，把完整地址贴在上面。`,
    );
  }

  const blob = `${codestr} ${desc}`.toLowerCase();
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    blob.includes("auth") ||
    blob.includes("token") ||
    blob.includes("login") ||
    blob.includes("unauthor")
  ) {
    return new NioAuthError(
      `Token 被拒绝（HTTP ${httpStatus}${codestr ? ` · ${codestr}` : ""}）：打开「更新 Token」，把新的 Bearer 贴在下面。`,
    );
  }

  return new NioApiError(`车辆 API 失败: ${desc || codestr || httpStatus}`, "generic");
}

export function classifyChangeApiFailure(
  payload: Record<string, unknown> | null | undefined,
  httpStatus: number,
): NioApiError {
  const code = String(payload?.resultCode ?? payload?.result_code ?? "");
  const msg = String(payload?.resultMsg ?? payload?.result_desc ?? payload?.debug_msg ?? "");

  if (code === "0000" || code === "success") {
    return new NioApiError("换电接口不应在此分类", "generic");
  }

  const blob = `${code} ${msg}`.toLowerCase();
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    blob.includes("auth") ||
    blob.includes("token") ||
    blob.includes("login") ||
    blob.includes("unauthor") ||
    msg.includes("用户名不能为空")
  ) {
    return new NioAuthError(
      `换电 Token 无效（${msg || code || httpStatus}）。打开「更新 Token」，选换电订单，把新的 Bearer 贴在下面。`,
    );
  }

  return new NioApiError(`换电接口失败: ${msg || code || httpStatus}`, "generic");
}

export function errorKindLabel(kind: NioErrorKind | null | undefined): string {
  switch (kind) {
    case "sign":
      return "签名错误";
    case "auth":
      return "Token 错误";
    default:
      return "拉取错误";
  }
}

export function errorKindHint(kind: NioErrorKind | null | undefined): string | null {
  switch (kind) {
    case "sign":
      return "打开「更新 Token」，选中失效的那条，完整地址贴在上面。";
    case "auth":
      return "打开「更新 Token」，把新的 Bearer 贴在下面。";
    default:
      return null;
  }
}

export function extractErrorKind(err: unknown): NioErrorKind {
  if (err instanceof NioApiError) return err.kind;
  return "generic";
}
