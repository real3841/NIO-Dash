import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());

export function getEnvFilePath(): string {
  return process.env.NIO_ENV_FILE ?? path.join(ROOT, "deploy", ".env");
}

export function readEnvFileRaw(): string {
  const file = getEnvFilePath();
  if (!fs.existsSync(file)) {
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

export function writeEnvFileRaw(content: string): void {
  const file = getEnvFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

export function parseEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function formatEnvValue(value: string): string {
  if (!value) return "";
  if (/[\s#",]/.test(value) || value.startsWith("{")) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    out[key] = parseEnvValue(value);
  }
  return out;
}

export function applyEnvUpdates(content: string, updates: Record<string, string>): string {
  const lines = content.split("\n");
  const updated = new Set<string>();
  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return line;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in updates)) return line;
    updated.add(key);
    const indent = line.match(/^\s*/)?.[0] ?? "";
    return `${indent}${key}=${formatEnvValue(updates[key] ?? "")}`;
  });

  const append: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!updated.has(key)) {
      append.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  if (append.length === 0) {
    return next.join("\n");
  }

  const joined = next.join("\n");
  const suffix = append.join("\n");
  return joined.endsWith("\n") || joined.length === 0 ? `${joined}${suffix}\n` : `${joined}\n${suffix}`;
}

export const VEHICLE_ENV_KEYS = [
  "NIO_VEHICLE_API_URL",
  "NIO_VEHICLE_ACCESS_TOKEN",
  "NIO_VEHICLE_POLL_DRIVING_SEC",
  "NIO_VEHICLE_POLL_DAY_SEC",
  "NIO_VEHICLE_POLL_NIGHT_SEC",
  "NIO_CHECKIN_API_URL",
  "NIO_CHECKIN_ACCESS_TOKEN",
] as const;

export const CHANGE_ENV_KEYS = [
  "NIO_CHANGE_API_URL",
  "NIO_CHANGE_ACCESS_TOKEN",
  "NIO_CHANGE_POLL_INTERVAL",
] as const;

export const GENERAL_ENV_KEYS = ["NIO_POLL_INTERVAL", "WEB_PORT", "NIO_TRAY_DISPLAY"] as const;

export const TRAY_ENV_KEYS = ["NIO_TRAY_DISPLAY"] as const;

export type VehicleEnv = Record<(typeof VEHICLE_ENV_KEYS)[number], string>;
export type ChangeEnv = Record<(typeof CHANGE_ENV_KEYS)[number], string>;
export type GeneralEnv = Record<(typeof GENERAL_ENV_KEYS)[number], string>;

function pickKeys(all: Record<string, string>, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    out[key] = all[key] ?? "";
  }
  return out;
}

export function loadEnvSections(): { vehicle: VehicleEnv; change: ChangeEnv; general: GeneralEnv } {
  const all = parseEnvFile(readEnvFileRaw());
  return {
    vehicle: pickKeys(all, VEHICLE_ENV_KEYS) as VehicleEnv,
    change: pickKeys(all, CHANGE_ENV_KEYS) as ChangeEnv,
    general: pickKeys(all, GENERAL_ENV_KEYS) as GeneralEnv,
  };
}

export function saveEnvSection(updates: Record<string, string>): void {
  const current = readEnvFileRaw();
  const next = applyEnvUpdates(current, updates);
  writeEnvFileRaw(next);
}
