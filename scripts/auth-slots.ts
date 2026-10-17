import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "./atomic-write.js";
import { getDataDir } from "./paths.js";
import { extractErrorKind } from "../src/lib/nio-api-errors.js";
import { AUTH_SLOTS, type AuthSlotId } from "../src/lib/auth-slots.js";

export interface AuthSlotStatus {
  ok: boolean;
  kind: "sign" | "auth" | "generic" | null;
  at: number;
}

type AuthSlotFile = Partial<Record<AuthSlotId, AuthSlotStatus>>;

function statusFile(): string {
  return path.join(getDataDir(), "auth-slots.json");
}

export function readAuthSlotStatus(): AuthSlotFile {
  try {
    const raw = JSON.parse(fs.readFileSync(statusFile(), "utf8")) as AuthSlotFile;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function kindOf(err: unknown): AuthSlotStatus["kind"] {
  const kind = extractErrorKind(err);
  if (kind !== "generic") return kind;
  const message = err instanceof Error ? err.message : String(err ?? "");
  const blob = message.toLowerCase();
  if (blob.includes("sign")) return "sign";
  if (
    blob.includes("auth") ||
    blob.includes("token") ||
    blob.includes("login") ||
    blob.includes("unauthor") ||
    message.includes("未登录")
  ) {
    return "auth";
  }
  return "generic";
}

export function recordAuthSlot(id: AuthSlotId, ok: boolean, err?: unknown): void {
  const file = readAuthSlotStatus();
  file[id] = {
    ok,
    kind: ok ? null : kindOf(err),
    at: Date.now(),
  };
  try {
    fs.mkdirSync(getDataDir(), { recursive: true });
    writeJsonAtomic(statusFile(), file);
  } catch {
    /* 状态写失败不影响拉取 */
  }
}

export function authSlotSnapshot(): Array<{
  id: AuthSlotId;
  label: string;
  method: "GET" | "POST";
  address: string;
  needsUrl: boolean;
  ok: boolean | null;
  kind: AuthSlotStatus["kind"];
  at: number | null;
}> {
  const file = readAuthSlotStatus();
  return AUTH_SLOTS.map((slot) => {
    const status = file[slot.id];
    return {
      id: slot.id,
      label: slot.label,
      method: slot.method,
      address: slot.address,
      needsUrl: slot.needsUrl,
      ok: status ? status.ok : null,
      kind: status?.kind ?? null,
      at: status?.at ?? null,
    };
  });
}
